/**
 * Skripte testen: script_log (Protokoll und Status lesen) und script_test (Ereignis auslösen, beobachten, zurücksetzen).
 * Damit kann die KI ihre Skripte ausprobieren, Fehler sehen und korrigieren, statt blind zu schreiben.
 */
import { AI_LIMITS } from '../../../shared/aiTools';
import { entityScriptSource } from '../../../shared/graphCompile';
import type { EntitySpec } from '../../../shared/types';
import type { EventBus } from '../../core/events';
import { clip } from './log';
import { wrapData } from './summary';
import { getRunLimits } from './runLimits';
import { HIDDEN_TEXT, appHidden, fail, getEntity, ok, str, ToolError, type Handler, type ToolContext } from './tools';
import { registerHandlers } from './registry';

interface LogLine {
  level: 'log' | 'error';
  message: string;
  ts: number;
}

const MAX_LINES_PER_ENTITY = 60;
const logs = new Map<string, LogLine[]>();
const statuses = new Map<string, { status: 'running' | 'stopped' | 'error'; message?: string }>();

/** Hört auf Skript-Ereignisse und führt je Objekt ein kurzes Protokoll (wird vom KI-Kern beim Start eingehängt). */
export function attachScriptLog(bus: EventBus): () => void {
  const offs = [
    bus.on('script.log', ({ entityId, level, message, ts }) => {
      const list = logs.get(entityId) ?? [];
      list.push({ level, message, ts });
      if (list.length > MAX_LINES_PER_ENTITY) list.splice(0, list.length - MAX_LINES_PER_ENTITY);
      logs.set(entityId, list);
    }),
    bus.on('script.status', ({ entityId, status, message }) => {
      statuses.set(entityId, { status, ...(message ? { message } : {}) });
      if (status === 'running') logs.delete(entityId);
    }),
  ];
  return () => {
    for (const off of offs) off();
    logs.clear();
    statuses.clear();
  };
}

export function scriptLogOf(entityId: string): LogLine[] {
  return logs.get(entityId) ?? [];
}
export function scriptStatusOf(entityId: string): { status: string; message?: string } | undefined {
  return statuses.get(entityId);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function lines(list: LogLine[], max = 25): string[] {
  return list.slice(-max).map((l) => `${l.level === 'error' ? '[Fehler] ' : ''}${clip(l.message, 240)}`);
}

const EVENTS = ['onClick', 'onTouch', 'onTriggerEnter', 'onTriggerExit', 'onChat', 'onMessage', 'none'] as const;

/** Kurze Beschreibung der Änderungen zwischen zwei Zuständen. */
export function describeChanges(prev: EntitySpec, next: EntitySpec): string[] {
  const out: string[] = [];
  const r = (n: number) => Math.round(n * 100) / 100;
  const v = (a: readonly number[]) => `(${a.map(r).join(', ')})`;
  const t0 = prev.transform;
  const t1 = next.transform;
  if (v(t0.pos) !== v(t1.pos)) out.push(`Position ${v(t0.pos)} → ${v(t1.pos)}`);
  if (v(t0.rot) !== v(t1.rot)) out.push(`Drehung geändert`);
  if (v(t0.scale) !== v(t1.scale)) out.push(`Größe ${v(t0.scale)} → ${v(t1.scale)}`);
  const m0 = prev.material ?? {};
  const m1 = next.material ?? {};
  for (const key of ['color', 'emissive', 'alpha'] as const) if (m0[key] !== m1[key]) out.push(`${key} ${m0[key] ?? '–'} → ${m1[key] ?? '–'}`);
  const s0 = prev.state ?? {};
  const s1 = next.state ?? {};
  for (const key of new Set([...Object.keys(s0), ...Object.keys(s1)])) {
    if (JSON.stringify(s0[key]) !== JSON.stringify(s1[key])) out.push(`Zustand ${key}: ${clip(s0[key], 40)} → ${clip(s1[key], 40)}`);
  }
  if (JSON.stringify(prev.particles) !== JSON.stringify(next.particles)) out.push(`Partikel ${next.particles?.enabled ? 'an' : 'aus'}`);
  if (prev.physics?.mode !== next.physics?.mode) out.push(`Physik ${prev.physics?.mode ?? '–'} → ${next.physics?.mode ?? '–'}`);
  if (JSON.stringify(prev.media) !== JSON.stringify(next.media)) out.push('Medien geändert');
  return out;
}

export const scriptTestHandlers: Record<string, Handler> = registerHandlers({
  script_log(input, ctx) {
    if (input.id === undefined) {
      const rows: unknown[] = [];
      for (const [id, st] of statuses) {
        const e = ctx.store.getState().entities[id];
        if (!e) continue;
        const l = scriptLogOf(id);
        if (st.status === 'error' || l.some((x) => x.level === 'error')) rows.push({ id, name: e.name ?? '', status: st.status, ...(st.message ? { meldung: clip(st.message, 200) } : {}), protokoll: lines(l, 8) });
      }
      return ok(wrapData(JSON.stringify({ objekte_mit_fehlern: rows.slice(0, 20), hinweis: rows.length === 0 ? 'Kein Skript meldet derzeit einen Fehler (Skripte laufen nur im Spielmodus).' : undefined })), `Skript-Protokoll gelesen (${rows.length} mit Fehlern)`, false);
    }
    const entity = getEntity(ctx, input.id);
    const st = statuses.get(entity.id);
    const hasScript = !!entityScriptSource(entity);
    return ok(
      wrapData(JSON.stringify({ id: entity.id, name: entity.name ?? '', hat_skript: hasScript, status: st?.status ?? (hasScript ? 'noch nicht gestartet (nur im Spielmodus)' : 'kein Skript'), ...(st?.message ? { meldung: clip(st.message, 200) } : {}), protokoll: lines(scriptLogOf(entity.id), 40) })),
      `Skript-Protokoll von ${entity.name || 'Objekt'} gelesen`,
      false,
    );
  },

  async script_test(input, ctx, counters) {
    if (appHidden()) return { ok: false, content: HIDDEN_TEXT, summary: 'App-Fenster im Hintergrund', mutated: false };
    const maxTests = getRunLimits().maxScriptTests;
    if ((counters.scriptTests ?? 0) >= maxTests) {
      return { ok: false, content: `Limit erreicht: höchstens ${maxTests} Skripttests pro Auftrag.`, summary: 'Testlimit erreicht', mutated: false };
    }
    const entity = getEntity(ctx, input.id);
    if (!entityScriptSource(entity)) fail('Dieses Objekt hat kein Skript (und keinen Logik-Graph). Hänge zuerst eines an.');
    const rawEvent = input.event === undefined ? 'onClick' : input.event;
    if (typeof rawEvent !== 'string' || !(EVENTS as readonly string[]).includes(rawEvent)) fail(`event muss eines von ${EVENTS.join(', ')} sein.`);
    const event = rawEvent as string;
    const wait = Math.min(3000, Math.max(200, typeof input.wait_ms === 'number' && Number.isFinite(input.wait_ms) ? Math.round(input.wait_ms) : 1000));
    const restore = input.restore !== false;
    const avatar = { id: 'test-avatar', name: input.avatar_name === undefined ? 'Tester' : str(input.avatar_name, 'avatar_name', 40) };
    const args: unknown[] =
      event === 'onChat' ? [input.text === undefined ? 'hallo' : str(input.text, 'text', 200), avatar] : event === 'onMessage' ? [input.message === undefined ? 'test' : str(input.message, 'message', 100), input.data ?? null, 'ki-test'] : event === 'none' ? [] : [avatar];
    counters.scriptTests = (counters.scriptTests ?? 0) + 1;

    const store = ctx.store;
    const previousMode = store.getState().mode;
    const heard: string[] = [];
    const sent: string[] = [];
    const sounds: string[] = [];
    const offs = [
      ctx.bus.on('chat.message', (m) => {
        if (m.kind === 'object') heard.push(`${m.name}: ${clip(m.text, 120)}`);
      }),
      ctx.bus.on('script.message', (m) => sent.push(`${clip(m.message, 40)} → ${m.to}`)),
      ctx.bus.on('sound.play', (s) => sounds.push(s.name ?? `${s.frequency} Hz`)),
    ];
    try {
      if (previousMode !== 'play') store.getState().setMode('play');
      // Warten, bis das Skript des Ziels läuft (oder einen Fehler meldet).
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const st = statuses.get(entity.id)?.status;
        if (st === 'running' || st === 'error') break;
        await sleep(50);
      }
      await sleep(350); // onStart ablaufen lassen
      const baseline = (logs.get(entity.id) ?? []).length;
      const before = { ...store.getState().entities };
      if (event !== 'none') ctx.bus.emit('script.test.dispatch', { entityId: entity.id, name: event, args });
      await sleep(wait);

      const after = store.getState().entities;
      const changed: { id: string; name: string; aenderungen: string[] }[] = [];
      for (const [id, next] of Object.entries(after)) {
        const prev = before[id];
        if (!prev || prev === next) continue;
        const d = describeChanges(prev, next);
        if (d.length > 0) changed.push({ id, name: next.name ?? next.ref, aenderungen: d.slice(0, 6) });
      }
      const created = Object.keys(after).filter((id) => !before[id] && id.startsWith('sp_')).length;
      const st = statuses.get(entity.id);
      const fresh = scriptLogOf(entity.id).slice(Math.max(0, baseline - 0));
      const errors = scriptLogOf(entity.id).filter((l) => l.level === 'error').map((l) => clip(l.message, 240));

      if (restore) {
        for (const c of changed) {
          const prev = before[c.id];
          if (prev && after[c.id]) store.getState().updateEntity(c.id, { transform: prev.transform, material: prev.material, state: prev.state, particles: prev.particles, physics: prev.physics, media: prev.media }, { source: 'script' });
        }
        for (const id of Object.keys(after)) if (!before[id] && id.startsWith('sp_')) store.getState().removeEntity(id, { source: 'script' });
      }
      const result = {
        ziel: { id: entity.id, name: entity.name ?? '' },
        ereignis: event,
        skript_status: st?.status ?? 'unbekannt',
        ...(st?.message ? { status_meldung: clip(st.message, 200) } : {}),
        protokoll: lines(fresh, 20),
        fehler: errors.slice(-6),
        objekt_hat_gesagt: heard.slice(0, 8),
        nachrichten_gesendet: sent.slice(0, 8),
        toene: sounds.slice(0, 5),
        erzeugte_objekte: created,
        geaenderte_objekte: changed.slice(0, 15),
        ...(changed.length > 15 ? { weitere_geaenderte: changed.length - 15 } : {}),
        zurueckgesetzt: restore,
        hinweis: changed.length === 0 && errors.length === 0 && heard.length === 0 && sent.length === 0 && created === 0 ? 'Nichts hat sich geändert. Prüfe, ob das Ereignis zum Skript passt (z. B. onClick-Funktion vorhanden).' : undefined,
      };
      const okRun = st?.status !== 'error' && errors.length === 0;
      return { ok: okRun, content: wrapData(JSON.stringify(result)), summary: okRun ? `Skript von ${entity.name || 'Objekt'} getestet (${event})` : `Skript von ${entity.name || 'Objekt'} meldet Fehler`, mutated: false };
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw error;
    } finally {
      for (const off of offs) off();
      if (previousMode !== 'play' && store.getState().mode === 'play') store.getState().setMode(previousMode);
    }
  },
});
export type { ToolContext };
