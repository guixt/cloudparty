import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCRIPT_EVENT_TIMEOUT_MS } from '../../../shared/scriptApi';
import type { EntitySpec } from '../../../shared/types';
import { EventBus, type GameEvents } from '../../core/events';
import { createWorldStore } from '../../core/store';
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
    { store, bus, localAvatarId: () => 'me', audio: { playSound() {}, playTone() {} } },
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
