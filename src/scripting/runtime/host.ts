/**
 * Hauptthread-Verwaltung der Skript-Worker: Lebenszyklus, Ereignisse,
 * Watchdog (Zeitlimit), Ratenbegrenzung und Anwenden der Befehle.
 */
import { entityScriptSource, resolveEntityScript } from '../../../shared/graphCompile';
import { SCRIPT_EVENT_TIMEOUT_MS, SCRIPT_TICK_HZ } from '../../../shared/scriptApi';
import type { EntitySpec } from '../../../shared/types';
import type { EventBus } from '../../core/events';
import type { WorldStore } from '../../core/store';
import {
  COMMAND_LIMIT_PER_SEC,
  LOG_LIMIT_PER_SEC,
  MAX_LOG_LENGTH,
  RateLimiter,
  SAY_LIMIT_PER_SEC,
  applyCommand,
  snapshotOf,
  type CommandDeps,
  type HostToWorker,
  type WorkerToHost,
} from './commands';

export type ScriptStatus = 'running' | 'stopped' | 'error';

/** Minimale Worker-Schnittstelle (echte Worker und Testattrappen). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string; preventDefault?: () => void }) => void) | null;
}

export interface HostDeps {
  store: WorldStore;
  bus: EventBus;
  localAvatarId(): string;
  audio: CommandDeps['audio'];
}

export const TIMEOUT_MESSAGE = 'Skript wurde beendet: Zeitlimit überschritten (Endlosschleife?)';
const BOOT_TIMEOUT_MS = 10_000;
/** Der Host lässt etwas mehr Spielraum als der Worker, damit Fensterkanten nicht gültige Befehle verwerfen. */
const HOST_SLACK = 2;

interface Rec {
  id: string;
  worker: WorkerLike;
  status: ScriptStatus;
  phase: 'booting' | 'init' | 'ready';
  source: string;
  dead: boolean;
  handlers: Set<string>;
  queue: { name: string; args: unknown[] }[];
  seq: number;
  pending: Map<number, string>;
  busy: boolean;
  deadline?: ReturnType<typeof setTimeout>;
  bootTimer?: ReturnType<typeof setTimeout>;
  tickTimer?: ReturnType<typeof setInterval>;
  tickOutstanding: boolean;
  startedAt: number;
  lastTickAt: number;
  cmdLimiter: RateLimiter;
  sayLimiter: RateLimiter;
  logLimiter: RateLimiter;
  lastSnapshot: { transform: EntitySpec['transform']; state: EntitySpec['state']; name: EntitySpec['name'] };
}

const runnable = (entity: EntitySpec | undefined): entity is EntitySpec => {
  const script = entity ? entityScriptSource(entity) : null;
  return Boolean(script?.enabled && script.source.trim());
};

/** Hat sich Skript oder Graph geändert (stabiler Vergleich der Serialisierung)? */
const scriptChanged = (prev: EntitySpec, next: EntitySpec): boolean =>
  prev.script?.source !== next.script?.source ||
  prev.script?.enabled !== next.script?.enabled ||
  (prev.graph !== next.graph && JSON.stringify(prev.graph) !== JSON.stringify(next.graph));

export class ScriptHost {
  private recs = new Map<string, Rec>();
  /** Skripte, die nicht laufen: 'error' bleibt bis zur Änderung des Skripts oder Moduswechsel. */
  private final = new Map<string, 'stopped' | 'error'>();
  private unsubs: (() => void)[] = [];
  /** Entities, deren Graph-Fehler bei diesem Start schon gemeldet wurden. */
  private graphReported = new Set<string>();
  private commandDeps: CommandDeps;

  constructor(
    private readonly deps: HostDeps,
    private readonly createWorker: () => WorkerLike,
  ) {
    this.commandDeps = {
      store: deps.store,
      bus: deps.bus,
      localAvatarId: deps.localAvatarId,
      audio: deps.audio,
      deliver: (from, target, message, data) => this.deliver(from, target, message, data),
    };
  }

  // ------------------------------------------------------------ Anbindung

  attach(): void {
    const { bus } = this.deps;
    const u = this.unsubs;
    const reload = () => {
      this.stopAll();
      this.startAll();
    };
    u.push(bus.on('world.loaded', reload));
    u.push(bus.on('mode.changed', reload));
    u.push(bus.on('entity.added', ({ entity }) => this.start(entity.id)));
    u.push(
      bus.on('entity.removed', ({ entity }) => {
        this.stop(entity.id, false);
        this.final.delete(entity.id);
        this.graphReported.delete(entity.id);
      }),
    );
    u.push(
      bus.on('entity.changed', ({ entity, prev }) => {
        if (scriptChanged(prev, entity)) {
          this.restart(entity.id);
          return;
        }
        const rec = this.recs.get(entity.id);
        if (rec && rec.phase !== 'booting') this.syncSnapshot(rec, entity);
      }),
    );
    u.push(bus.on('entity.clicked', ({ entityId, avatar }) => this.dispatch(entityId, 'onClick', [avatar])));
    u.push(bus.on('entity.touched', ({ entityId, avatar }) => this.dispatch(entityId, 'onTouch', [avatar])));
    u.push(bus.on('trigger.enter', ({ entityId, avatar }) => this.dispatch(entityId, 'onTriggerEnter', [avatar])));
    u.push(bus.on('trigger.exit', ({ entityId, avatar }) => this.dispatch(entityId, 'onTriggerExit', [avatar])));
    u.push(
      bus.on('chat.message', ({ from, name, text, kind }) => {
        if (kind !== 'avatar') return;
        for (const id of [...this.recs.keys()]) this.dispatch(id, 'onChat', [text, { id: from, name }]);
      }),
    );
  }

  /** Startet alle Skripte der aktuellen Welt (nur im Spielmodus). */
  startAll(): void {
    for (const id of this.deps.store.getState().order) this.start(id);
  }

  stopAll(): void {
    for (const id of [...this.recs.keys()]) this.stop(id, false);
    this.final.clear();
    this.graphReported.clear();
  }

  dispose(): void {
    for (const off of this.unsubs.splice(0)) off();
    for (const rec of [...this.recs.values()]) this.teardown(rec);
    this.recs.clear();
    this.final.clear();
  }

  getStatus(entityId: string): ScriptStatus | 'none' {
    const rec = this.recs.get(entityId);
    if (rec) return rec.status;
    const fin = this.final.get(entityId);
    if (fin) return fin;
    return runnable(this.deps.store.getState().entities[entityId]) ? 'stopped' : 'none';
  }

  restart(entityId: string): void {
    this.stop(entityId, false);
    this.final.delete(entityId);
    this.graphReported.delete(entityId);
    this.start(entityId);
  }

  // ------------------------------------------------------------ Lebenszyklus

  start(id: string): void {
    if (this.recs.has(id)) return;
    const { store, bus } = this.deps;
    const entity = store.getState().entities[id];
    if (!entity || store.getState().mode !== 'play') return;
    const resolved = resolveEntityScript(entity);
    if (resolved && resolved.graphErrors.length > 0 && !this.graphReported.has(id)) {
      // Fehlerhafter Graph: jedes Problem melden, einmal Status „error“; mit entity.script geht es danach weiter.
      this.graphReported.add(id);
      for (const issue of resolved.graphErrors) this.emitLog(id, 'error', `Logik-Graph: ${issue.message}`);
      bus.emit('script.status', { entityId: id, status: 'error', message: 'Der Logik-Graph enthält Fehler.' });
      if (!runnable(entity)) this.final.set(id, 'error');
    }
    if (!runnable(entity)) return;
    if (this.final.get(id) === 'error') return;
    let worker: WorkerLike;
    try {
      worker = this.createWorker();
    } catch (error) {
      this.final.set(id, 'error');
      const message = `Skript-Worker konnte nicht gestartet werden: ${(error as Error).message}`;
      bus.emit('script.status', { entityId: id, status: 'error', message });
      this.emitLog(id, 'error', message);
      return;
    }
    const now = Date.now();
    const rec: Rec = {
      id,
      worker,
      status: 'running',
      phase: 'booting',
      source: entityScriptSource(entity)?.source ?? '',
      dead: false,
      handlers: new Set(),
      queue: [],
      seq: 0,
      pending: new Map(),
      busy: false,
      tickOutstanding: false,
      startedAt: now,
      lastTickAt: now,
      cmdLimiter: new RateLimiter(COMMAND_LIMIT_PER_SEC * HOST_SLACK),
      sayLimiter: new RateLimiter(SAY_LIMIT_PER_SEC * HOST_SLACK),
      logLimiter: new RateLimiter(LOG_LIMIT_PER_SEC * HOST_SLACK),
      lastSnapshot: { transform: entity.transform, state: entity.state, name: entity.name },
    };
    this.recs.set(id, rec);
    this.final.delete(id);
    worker.onmessage = (event) => this.onWorkerMessage(rec, event.data);
    worker.onerror = (event) => {
      event.preventDefault?.();
      this.fail(rec, `Skript-Fehler: ${event.message ?? 'unbekannt'}`);
    };
    rec.bootTimer = setTimeout(() => this.fail(rec, 'Skript-Worker hat nicht geantwortet.'), BOOT_TIMEOUT_MS);
    bus.emit('script.status', { entityId: id, status: 'running' });
  }

  /** Beendet ein Skript; `silent` unterdrückt script.status. */
  stop(id: string, silent: boolean): void {
    const rec = this.recs.get(id);
    if (!rec) return;
    this.teardown(rec);
    this.recs.delete(id);
    this.final.set(id, 'stopped');
    if (!silent) this.deps.bus.emit('script.status', { entityId: id, status: 'stopped' });
  }

  private teardown(rec: Rec): void {
    rec.dead = true;
    clearTimeout(rec.deadline);
    clearTimeout(rec.bootTimer);
    clearInterval(rec.tickTimer);
    rec.worker.onmessage = null;
    rec.worker.onerror = null;
    try {
      rec.worker.terminate();
    } catch {
      /* ignorieren */
    }
  }

  private fail(rec: Rec, message: string): void {
    if (rec.dead || this.recs.get(rec.id) !== rec) return;
    this.teardown(rec);
    this.recs.delete(rec.id);
    this.final.set(rec.id, 'error');
    this.deps.bus.emit('script.status', { entityId: rec.id, status: 'error', message });
    this.emitLog(rec.id, 'error', message);
  }

  private emitLog(entityId: string, level: 'log' | 'error', message: string): void {
    this.deps.bus.emit('script.log', { entityId, level, message, ts: Date.now() });
  }

  // ------------------------------------------------------------ Watchdog

  private outstanding(rec: Rec): boolean {
    return rec.phase === 'init' || rec.pending.size > 0 || rec.busy;
  }

  /** Startet die Frist, falls etwas aussteht; `restart` setzt eine laufende Frist zurück (Fortschritt). */
  private arm(rec: Rec, restart: boolean): void {
    if (rec.deadline !== undefined && !restart) return;
    clearTimeout(rec.deadline);
    rec.deadline = undefined;
    if (!this.outstanding(rec)) return;
    rec.deadline = setTimeout(() => this.fail(rec, TIMEOUT_MESSAGE), SCRIPT_EVENT_TIMEOUT_MS);
  }

  // ------------------------------------------------------------ Worker -> Host

  private onWorkerMessage(rec: Rec, data: unknown): void {
    if (rec.dead || typeof data !== 'object' || data === null) return;
    const msg = data as WorkerToHost;
    switch (msg.type) {
      case 'booted': {
        if (rec.phase !== 'booting') return;
        clearTimeout(rec.bootTimer);
        rec.phase = 'init';
        const entity = this.deps.store.getState().entities[rec.id];
        if (!entity) return;
        this.post(rec, { type: 'init', source: rec.source, snapshot: snapshotOf(entity) });
        this.arm(rec, true);
        return;
      }
      case 'ready': {
        if (rec.phase !== 'init') return;
        rec.phase = 'ready';
        const names = Array.isArray(msg.handlers) ? msg.handlers.filter((x) => typeof x === 'string') : [];
        rec.handlers = new Set(names);
        this.arm(rec, true);
        if (rec.handlers.has('onTick')) {
          rec.lastTickAt = Date.now();
          rec.tickTimer = setInterval(() => this.tick(rec), 1000 / SCRIPT_TICK_HZ);
        }
        this.send(rec, 'onStart', []);
        const queued = rec.queue.splice(0);
        for (const item of queued) this.send(rec, item.name, item.args);
        return;
      }
      case 'fatal':
        this.fail(rec, `Skript-Fehler: ${String(msg.message).slice(0, MAX_LOG_LENGTH)}`);
        return;
      case 'done': {
        const name = rec.pending.get(msg.seq);
        rec.pending.delete(msg.seq);
        if (name === 'onTick') rec.tickOutstanding = false;
        this.arm(rec, true);
        return;
      }
      case 'busy':
        rec.busy = true;
        this.arm(rec, false);
        return;
      case 'idle':
        rec.busy = false;
        this.arm(rec, true);
        return;
      case 'cmd': {
        if (rec.phase === 'booting') return;
        const raw = msg.cmd as { c?: unknown } | undefined;
        if (raw && raw.c === 'say' && !rec.sayLimiter.take()) return;
        if (!rec.cmdLimiter.take()) {
          if (rec.cmdLimiter.shouldWarn()) this.emitLog(rec.id, 'error', 'Zu viele Befehle: weitere werden verworfen.');
          return;
        }
        try {
          applyCommand(this.commandDeps, rec.id, msg.cmd);
        } catch (error) {
          this.logLimited(rec, 'error', (error as Error).message);
        }
        return;
      }
      case 'log':
        this.logLimited(rec, msg.level === 'error' ? 'error' : 'log', String(msg.message).slice(0, MAX_LOG_LENGTH));
        return;
      default:
        return;
    }
  }

  private logLimited(rec: Rec, level: 'log' | 'error', message: string): void {
    if (!rec.logLimiter.take()) return;
    this.emitLog(rec.id, level, message);
  }

  // ------------------------------------------------------------ Host -> Worker

  private post(rec: Rec, message: HostToWorker): void {
    try {
      rec.worker.postMessage(message);
    } catch {
      /* Worker schon weg */
    }
  }

  private send(rec: Rec, name: string, args: unknown[]): void {
    if (!rec.handlers.has(name)) return;
    const seq = ++rec.seq;
    rec.pending.set(seq, name);
    this.post(rec, { type: 'event', seq, name, args });
    this.arm(rec, false);
  }

  /** Stellt ein Ereignis einem Skript zu (vor `ready` wird gepuffert). */
  dispatch(entityId: string, name: string, args: unknown[]): void {
    const rec = this.recs.get(entityId);
    if (!rec || rec.dead) return;
    if (rec.phase !== 'ready') {
      if (rec.queue.length < 50) rec.queue.push({ name, args });
      return;
    }
    this.send(rec, name, args);
  }

  private tick(rec: Rec): void {
    if (rec.dead || rec.tickOutstanding) return;
    const now = Date.now();
    const dt = (now - rec.lastTickAt) / 1000;
    rec.lastTickAt = now;
    rec.tickOutstanding = true;
    this.send(rec, 'onTick', [dt, (now - rec.startedAt) / 1000]);
  }

  private syncSnapshot(rec: Rec, entity: EntitySpec): void {
    const last = rec.lastSnapshot;
    if (last.transform === entity.transform && last.state === entity.state && last.name === entity.name) return;
    rec.lastSnapshot = { transform: entity.transform, state: entity.state, name: entity.name };
    this.post(rec, { type: 'snapshot', snapshot: snapshotOf(entity) });
  }

  private deliver(from: string, target: string | null, message: string, data: unknown): void {
    const entities = this.deps.store.getState().entities;
    for (const [id, rec] of [...this.recs]) {
      if (rec.dead) continue;
      if (target === null) {
        if (id === from) continue;
      } else if (id !== target && entities[id]?.name !== target) {
        continue;
      }
      this.dispatch(id, 'onMessage', [message, data, from]);
    }
  }
}
