import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCRIPT_EVENT_TIMEOUT_MS } from '../../../shared/scriptApi';
import type { EntitySpec } from '../../../shared/types';
import { EventBus, type GameEvents } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { compactToGraph } from '../../../shared/graphCompact';
import { ScriptHost, TIMEOUT_MESSAGE, type WorkerLike } from './host';

class FakeWorker implements WorkerLike {
  sent: any[] = [];
  terminated = false;
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  postMessage(m: unknown) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  /** Antwortet auf init wie ein gesunder Worker. */
  boot(handlers: string[]) {
    this.emit({ type: 'booted' });
    this.emit({ type: 'ready', handlers });
  }
  events(name?: string) {
    return this.sent.filter((m) => m.type === 'event' && (!name || m.name === name));
  }
}

const entity = (id: string, source: string, extra: Partial<EntitySpec> = {}): EntitySpec => ({
  id,
  ref: 'EntitySpec.box',
  name: id,
  transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
  script: { enabled: true, source },
  ...extra,
});

function setup() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().loadWorld({ ...store.getState().toWorldSpec(), entities: [] });
  const workers: FakeWorker[] = [];
  const host = new ScriptHost(
    {
      store,
      bus,
      localAvatarId: () => 'me',
      audio: { playSound() {}, playTone() {} },
      makeEntity: (ref, pos) => ({ id: 'tmp', ref, transform: { pos, rot: [0, 0, 0, 1], scale: [1, 1, 1] } }),
      avatars: () => [{ id: 'me', name: 'Ich', pos: [1, 0, 2] }],
    },
    () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
  );
  host.attach();
  const log: { type: string; payload: any }[] = [];
  for (const type of ['script.status', 'script.log', 'chat.message'] as (keyof GameEvents)[]) {
    bus.on(type, (payload: unknown) => log.push({ type, payload }));
  }
  return { bus, store, host, workers, log, add: (e: EntitySpec) => store.getState().addEntity(e) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ScriptHost', () => {
  it('startet pro Skript einen Worker und stellt Ereignisse zu', () => {
    const { add, workers, bus, host } = setup();
    add(entity('a', 'x'));
    add({ ...entity('b', 'x'), script: { enabled: false, source: 'x' } });
    add(entity('c', '   '));
    expect(workers).toHaveLength(1);
    expect(host.getStatus('a')).toBe('running');
    expect(host.getStatus('b')).toBe('none');
    workers[0].boot(['onClick']);
    bus.emit('entity.clicked', { entityId: 'a', avatar: { id: 'u', name: 'U' }, point: [0, 0, 0] });
    bus.emit('entity.touched', { entityId: 'a', avatar: { id: 'u', name: 'U' } }); // kein Handler
    expect(workers[0].events()).toEqual([{ type: 'event', seq: 1, name: 'onClick', args: [{ id: 'u', name: 'U' }] }]);
    workers[0].emit({ type: 'done', seq: 1 });
    vi.advanceTimersByTime(1000);
    expect(workers[0].terminated).toBe(false);
  });

  it('beendet bei Endlosschleife (Zeitlimit) und startet nicht neu', () => {
    const { add, workers, bus, host, log } = setup();
    add(entity('a', 'x'));
    add(entity('b', 'x'));
    workers[0].boot(['onClick']);
    workers[1].boot(['onClick']);
    bus.emit('entity.clicked', { entityId: 'a', avatar: { id: 'u', name: 'U' }, point: [0, 0, 0] });
    vi.advanceTimersByTime(SCRIPT_EVENT_TIMEOUT_MS - 1);
    expect(workers[0].terminated).toBe(false);
    vi.advanceTimersByTime(2);
    expect(workers[0].terminated).toBe(true);
    expect(host.getStatus('a')).toBe('error');
    expect(workers[1].terminated).toBe(false);
    expect(host.getStatus('b')).toBe('running');
    expect(log.some((l) => l.type === 'script.status' && l.payload.entityId === 'a' && l.payload.status === 'error')).toBe(true);
    expect(log.some((l) => l.type === 'script.log' && l.payload.message === TIMEOUT_MESSAGE)).toBe(true);
    bus.emit('entity.clicked', { entityId: 'a', avatar: { id: 'u', name: 'U' }, point: [0, 0, 0] });
    expect(workers).toHaveLength(2);
  });

  it('beendet bei Endlosschleife in der Initialisierung oder in einem Timer', () => {
    const { add, workers, host } = setup();
    add(entity('a', 'x'));
    workers[0].emit({ type: 'booted' });
    vi.advanceTimersByTime(SCRIPT_EVENT_TIMEOUT_MS + 1);
    expect(host.getStatus('a')).toBe('error');
    add(entity('b', 'x'));
    workers[1].boot([]);
    workers[1].emit({ type: 'busy' });
    vi.advanceTimersByTime(SCRIPT_EVENT_TIMEOUT_MS + 1);
    expect(host.getStatus('b')).toBe('error');
  });

  it('Fortschritt setzt die Frist zurück; stehende Frist wird nicht durch neue Ereignisse verlängert', () => {
    const { add, workers, bus, host } = setup();
    add(entity('a', 'x'));
    workers[0].boot(['onClick']);
    const click = () => bus.emit('entity.clicked', { entityId: 'a', avatar: { id: 'u', name: 'U' }, point: [0, 0, 0] });
    click();
    vi.advanceTimersByTime(200);
    click();
    vi.advanceTimersByTime(100);
    expect(host.getStatus('a')).toBe('error');
  });

  it('Moduswechsel stoppt alle Skripte und startet sie neu', () => {
    const { add, workers, store, host } = setup();
    add(entity('a', 'x'));
    workers[0].boot(['onTick']);
    store.getState().setMode('build');
    expect(workers[0].terminated).toBe(true);
    expect(host.getStatus('a')).toBe('stopped');
    store.getState().setMode('play');
    expect(workers).toHaveLength(2);
    expect(host.getStatus('a')).toBe('running');
  });

  it('Moduswechsel hebt Fehlersperre auf; Skriptänderung startet neu', () => {
    const { add, workers, store, host } = setup();
    add(entity('a', 'x'));
    workers[0].boot(['onClick']);
    workers[0].emit({ type: 'fatal', message: 'kaputt' });
    expect(host.getStatus('a')).toBe('error');
    store.getState().updateEntity('a', { script: { enabled: true, source: 'y' } });
    expect(workers).toHaveLength(2);
    expect(host.getStatus('a')).toBe('running');
    store.getState().removeEntity('a');
    expect(workers[1].terminated).toBe(true);
    expect(host.getStatus('a')).toBe('none');
  });

  it('wendet Befehle an (Quelle script), verwirft Müll und begrenzt', () => {
    const { add, workers, store, log } = setup();
    add(entity('a', 'x'));
    workers[0].boot([]);
    workers[0].emit({ type: 'cmd', cmd: { c: 'color', v: '#00ff00' } });
    expect(store.getState().entities.a.material?.color).toBe('#00ff00');
    workers[0].emit({ type: 'cmd', cmd: { c: 'color', v: 'grün' } });
    expect(log.some((l) => l.type === 'script.log' && l.payload.level === 'error')).toBe(true);
    for (let i = 0; i < 100; i += 1) workers[0].emit({ type: 'cmd', cmd: { c: 'say', text: 's' } });
    expect(log.filter((l) => l.type === 'chat.message')).toHaveLength(10);
    workers[0].emit({ type: 'garbage' });
    workers[0].emit(null);
  });

  it('sendet Ticks nur bei onTick und nicht bei offener Bestätigung', () => {
    const { add, workers } = setup();
    add(entity('a', 'x'));
    add(entity('b', 'x'));
    workers[0].boot(['onTick']);
    workers[1].boot(['onClick']);
    vi.advanceTimersByTime(110);
    expect(workers[0].events('onTick')).toHaveLength(1);
    expect(workers[1].events()).toHaveLength(0);
    workers[0].emit({ type: 'done', seq: 1 });
    vi.advanceTimersByTime(60);
    expect(workers[0].events('onTick').length).toBe(2);
  });

  it('Nachrichten: per Name, per ID, Broadcast ohne Absender; Chat nur von Avataren', () => {
    const { add, workers, bus } = setup();
    add(entity('a', 'x', { name: 'Anna' }));
    add(entity('b', 'x', { name: 'Bob' }));
    add(entity('c', 'x', { name: 'Bob' }));
    workers.forEach((w) => w.boot(['onMessage', 'onChat']));
    workers[0].emit({ type: 'cmd', cmd: { c: 'send', target: 'Bob', message: 'hi', data: { n: 1 } } });
    expect(workers[0].events()).toHaveLength(0);
    expect(workers[1].events('onMessage')[0].args).toEqual(['hi', { n: 1 }, 'a']);
    expect(workers[2].events('onMessage')).toHaveLength(1);
    workers[1].emit({ type: 'cmd', cmd: { c: 'send', target: 'a', message: 'ack' } });
    expect(workers[0].events('onMessage')).toHaveLength(1);
    workers[0].emit({ type: 'cmd', cmd: { c: 'broadcast', message: 'alle' } });
    expect(workers[0].events('onMessage')).toHaveLength(1);
    expect(workers[1].events('onMessage')).toHaveLength(2);
    bus.emit('chat.message', { from: 'u1', name: 'Uli', text: 'hallo', ts: 1, kind: 'avatar' });
    bus.emit('chat.message', { from: 'a', name: 'Anna', text: 'objekt', ts: 1, kind: 'object' });
    expect(workers[0].events('onChat')).toHaveLength(1);
    expect(workers[0].events('onChat')[0].args).toEqual(['hallo', { id: 'u1', name: 'Uli' }]);
  });

  it('schickt Snapshot nach Transform-Änderung', () => {
    const { add, workers, store } = setup();
    add(entity('a', 'x'));
    workers[0].boot([]);
    store.getState().updateEntity('a', { transform: { pos: [5, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
    expect(workers[0].sent.filter((m) => m.type === 'snapshot')[0].snapshot.position).toEqual([5, 0, 0]);
  });

  it('sendet onStart nach ready, vor gepufferten Ereignissen', () => {
    const { add, workers, bus } = setup();
    add(entity('a', 'x'));
    bus.emit('entity.clicked', { entityId: 'a', avatar: { id: 'u', name: 'U' }, point: [0, 0, 0] });
    workers[0].boot(['onStart', 'onClick']);
    expect(workers[0].events().map((e) => e.name)).toEqual(['onStart', 'onClick']);
  });
});

describe('ScriptHost mit Logik-Graph', () => {
  const graph = (text = 'A') =>
    compactToGraph({ nodes: [{ id: 'k', type: 'on_click' }, { id: 's', type: 'say', params: { text } }], connections: ['k.then -> s.in'] });
  const noScript = (id: string, extra: Partial<EntitySpec>): EntitySpec => ({ ...entity(id, ''), script: undefined, ...extra });

  it('ein Entity nur mit Graph läuft', () => {
    const { add, workers, host } = setup();
    add(noScript('g', { graph: graph() }));
    expect(workers).toHaveLength(1);
    expect(host.getStatus('g')).toBe('running');
    workers[0].emit({ type: 'booted' });
    expect(workers[0].sent.find((m) => m.type === 'init').source).toContain('function onClick');
  });

  it('eine Änderung des Graphen startet das Skript neu, gleiche Werte nicht', () => {
    const { add, workers, store } = setup();
    add(noScript('g', { graph: graph('A') }));
    store.getState().updateEntity('g', { graph: graph('A') });
    expect(workers).toHaveLength(1);
    store.getState().updateEntity('g', { graph: graph('B') });
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    workers[1].emit({ type: 'booted' });
    expect(workers[1].sent.find((m) => m.type === 'init').source).toContain('"B"');
  });

  it('ein fehlerhafter Graph meldet Fehler und fällt auf das Skript zurück', () => {
    const { add, workers, log, host } = setup();
    const broken = { ...graph(), edges: [{ from: { node: 'k', port: 'name' }, to: { node: 's', port: 'in' } }] };
    add(entity('g', 'function onStart(){}', { graph: broken }));
    const errors = log.filter((l) => l.type === 'script.log' && l.payload.level === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].payload.message).toMatch(/Logik-Graph: .*Beim Anklicken/);
    expect(log.filter((l) => l.type === 'script.status' && l.payload.status === 'error')).toHaveLength(1);
    expect(workers).toHaveLength(1);
    expect(host.getStatus('g')).toBe('running');
  });

  it('ein fehlerhafter Graph ohne Skript endet im Status error; Reparatur startet', () => {
    const { add, workers, log, host, store } = setup();
    const broken = { ...graph(), edges: [{ from: { node: 'k', port: 'name' }, to: { node: 's', port: 'in' } }] };
    add(noScript('g', { graph: broken }));
    expect(workers).toHaveLength(0);
    expect(host.getStatus('g')).toBe('error');
    expect(log.some((l) => l.type === 'script.log' && l.payload.level === 'error')).toBe(true);
    store.getState().updateEntity('g', { graph: graph() });
    expect(workers).toHaveLength(1);
    expect(host.getStatus('g')).toBe('running');
  });

  it('ein deaktivierter Graph fällt auf entity.script zurück', () => {
    const { add, workers, store, log } = setup();
    add(entity('g', 'function onStart(){}', { graph: graph() }));
    workers[0].emit({ type: 'booted' });
    expect(workers[0].sent.find((m) => m.type === 'init').source).toContain('onClick');
    store.getState().updateEntity('g', { graph: { ...graph(), enabled: false } });
    expect(workers).toHaveLength(2);
    workers[1].emit({ type: 'booted' });
    expect(workers[1].sent.find((m) => m.type === 'init').source).toBe('function onStart(){}');
    expect(log.some((l) => l.type === 'script.log')).toBe(false);
  });
});


describe('ScriptHost: Weltsicht, Spawn, Test-Ereignisse', () => {
  const rect = (id: string, name: string, x: number, extra: Partial<EntitySpec> = {}): EntitySpec => ({ id, ref: 'EntitySpec.box', name, transform: { pos: [x, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, ...extra });

  it('schickt die Weltsicht nur an Skripte, die sie nutzen, und bei Änderungen erneut', () => {
    const { add, workers, host } = setup();
    add(rect('tuer', 'Tür', 3));
    add(entity('a', "function onTick(){ const t = world.find('Tür'); }"));
    add(entity('b', 'function onClick(){ self.say(1); }'));
    workers[0].boot(['onTick']);
    workers[1].boot(['onClick']);
    const view = workers[0].sent.filter((m) => m.type === 'world');
    expect(view).toHaveLength(1);
    expect(view[0].view.objects.map((o: { id: string }) => o.id)).toContain('tuer');
    expect(view[0].view.avatars).toEqual([{ id: 'me', name: 'Ich', p: [1, 0, 2] }]);
    expect(workers[1].sent.filter((m) => m.type === 'world')).toHaveLength(0);
    // Änderung → nach dem nächsten Takt neue Objektliste; ohne Änderung nur Avatare
    vi.advanceTimersByTime(260);
    expect(workers[0].sent.filter((m) => m.type === 'world').at(-1).view.objects).toBeUndefined();
    host.getStatus('a');
  });

  it('Spawn: legt Objekte an, begrenzt sie, räumt sie beim Beenden auf, Lebensdauer entfernt sie', () => {
    const { add, workers, store, bus } = setup();
    add(entity('a', "function onClick(){ world.spawn('EntitySpec.sphere', {}); }"));
    workers[0].boot(['onClick']);
    const cmd = (id: string, lifetime?: number) => workers[0].emit({ type: 'cmd', cmd: { c: 'spawn', id, ref: 'EntitySpec.sphere', v: [0, 5, 0], opts: lifetime ? { lifetime } : {} } });
    cmd('sp_a_1_x');
    cmd('sp_a_2_x', 2);
    expect(Object.keys(store.getState().entities).filter((i) => i.startsWith('sp_'))).toHaveLength(2);
    vi.advanceTimersByTime(2100);
    expect(store.getState().entities.sp_a_2_x).toBeUndefined();
    expect(store.getState().entities.sp_a_1_x).toBeDefined();
    bus.emit('mode.changed', { mode: 'build' }); // Spielmodus verlassen → Aufräumen
    expect(store.getState().entities.sp_a_1_x).toBeUndefined();
  });

  it('script.test.dispatch stellt ein Ereignis zu', () => {
    const { add, workers, bus } = setup();
    add(entity('a', 'function onClick(){}'));
    workers[0].boot(['onClick']);
    bus.emit('script.test.dispatch', { entityId: 'a', name: 'onClick', args: [{ id: 't', name: 'Tester' }] });
    expect(workers[0].events('onClick')).toHaveLength(1);
  });

  it('Gruppenbefehle sind auf 30 pro Sekunde begrenzt', () => {
    const { add, workers, store } = setup();
    add(rect('m1', 'M1', 0, { group: 'g', groupName: 'Rad' }));
    add(entity('a', 'function onClick(){}'));
    workers[0].boot(['onClick']);
    for (let i = 0; i < 40; i++) workers[0].emit({ type: 'cmd', cmd: { c: 'group', name: 'Rad', op: 'move', v: [1, 0, 0], seconds: 0, ease: 'inOut' } });
    expect(store.getState().entities.m1.transform.pos[0]).toBe(30);
  });
});
