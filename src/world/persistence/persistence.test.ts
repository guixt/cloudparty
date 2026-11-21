// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultWorld } from '../../../shared/defaultWorld';
import type { GameContext, WorldPersistence } from '../../core/context';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { createIndexedDbPersistence, openDatabase } from './db';
import { startAutosave } from './index';
import { importWorldFromFile, importWorldFromText, worldFileName } from './io';
import { serializeWorldSpec } from '../../../shared/worldspec';

describe('IndexedDB-Speicherung', () => {
  let persistence: WorldPersistence;
  beforeEach(async () => {
    persistence = createIndexedDbPersistence(await openDatabase());
  });
  afterEach(async () => {
    for (const info of await persistence.list()) await persistence.remove(info.id);
  });

  it('speichert, lädt, listet und löscht Welten', async () => {
    expect(await persistence.list()).toEqual([]);
    const a = createDefaultWorld('Alpha', 'a');
    const b = createDefaultWorld('Beta', 'b');
    await persistence.save('a', a);
    await new Promise((r) => setTimeout(r, 5));
    await persistence.save('b', b);
    expect(await persistence.load('a')).toEqual(a);
    const list = await persistence.list();
    expect(list.map((i) => i.id)).toEqual(['b', 'a']); // neueste zuerst
    expect(list[0].name).toBe('Beta');
    await persistence.remove('a');
    expect(await persistence.load('a')).toBeUndefined();
    expect((await persistence.list()).map((i) => i.id)).toEqual(['b']);
  });

  it('überschreibt beim erneuten Speichern', async () => {
    const world = createDefaultWorld('Alt', 'x');
    await persistence.save('x', world);
    await persistence.save('x', { ...world, metadata: { ...world.metadata, name: 'Neu' } });
    expect((await persistence.list()).map((i) => i.name)).toEqual(['Neu']);
  });
});

function makeCtx() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const saved = new Map<string, unknown>();
  const persistence: WorldPersistence = {
    list: async () => [],
    load: async (id) => saved.get(id) as never,
    save: async (id, world) => void saved.set(id, JSON.parse(JSON.stringify(world))),
    remove: async (id) => void saved.delete(id),
  };
  const ctx = { bus, store, persistence } as unknown as GameContext;
  return { ctx, bus, store, saved };
}
const box = (id: string) => ({ id, ref: 'EntitySpec.box', transform: { pos: [0, 0.5, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } }) as never;

describe('Autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('speichert entprellt nach Änderungen', async () => {
    const { ctx, store, saved } = makeCtx();
    const stop = startAutosave(ctx);
    store.getState().addEntity(box('n1'));
    store.getState().addEntity(box('n2'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(saved.size).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    const world = saved.get('willkommen') as { entities: { id: string }[] };
    expect(world.entities.map((e) => e.id)).toContain('n2');
    stop();
  });

  it('vergibt eine ID, wenn sie fehlt', async () => {
    const { ctx, store, saved } = makeCtx();
    const world = createDefaultWorld('Ohne ID');
    delete world.metadata.id;
    store.getState().loadWorld(world);
    const stop = startAutosave(ctx);
    store.getState().addEntity(box('n1'));
    const id = store.getState().world.metadata.id;
    expect(id).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved.has(id!)).toBe(true);
    stop();
  });

  it('ignoriert Zwischenstände und speichert nicht, solange online', async () => {
    const { ctx, store, bus, saved } = makeCtx();
    const stop = startAutosave(ctx);
    store.getState().addEntity(box('t1'), { transient: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved.size).toBe(0);
    bus.emit('net.status', { online: true, island: 'x', avatars: 1, canBuild: true });
    store.getState().addEntity(box('n1'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved.size).toBe(0);
    bus.emit('net.status', { online: false, island: null, avatars: 0, canBuild: true });
    store.getState().addEntity(box('n2'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved.size).toBe(1);
    stop();
  });

  it('sichert ausstehende Änderungen beim Laden einer anderen Welt und beim Ausblenden', async () => {
    const { ctx, store, saved } = makeCtx();
    const stop = startAutosave(ctx);
    store.getState().addEntity(box('n1'));
    store.getState().loadWorld(createDefaultWorld('Andere', 'andere'));
    expect((saved.get('willkommen') as { entities: { id: string }[] }).entities.map((e) => e.id)).toContain('n1');
    expect(saved.has('andere')).toBe(false); // unverändert geladen: nicht speichern
    store.getState().addEntity(box('n2'));
    window.dispatchEvent(new Event('pagehide'));
    expect(saved.has('andere')).toBe(true);
    stop();
  });
});

describe('Datei-Import', () => {
  it('importiert gültige Dateien und meldet Fehler', async () => {
    const world = createDefaultWorld('Datei', 'datei');
    const ok = await importWorldFromFile(new File([serializeWorldSpec(world)], 'x.json'));
    expect(ok.ok && ok.world.metadata.name).toBe('Datei');
    const bad = importWorldFromText('{"metadata":{"name":"","version":"1"}}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(1);
    const broken = await importWorldFromFile(new File(['nope'], 'y.json'));
    expect(broken.ok).toBe(false);
  });

  it('bildet sichere Dateinamen', () => {
    expect(worldFileName(createDefaultWorld('A/B: "C"'))).toBe('A B C.cloudparty.json');
    expect(worldFileName(createDefaultWorld('Spontane Gespräche'))).toBe('Spontane Gespräche.cloudparty.json');
  });
});
