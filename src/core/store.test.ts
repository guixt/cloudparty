import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '../../shared/defaultWorld';
import { EventBus } from './events';
import { createWorldStore } from './store';

describe('WorldStore', () => {
  it('lädt eine Welt und exportiert sie unverändert', () => {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    const world = createDefaultWorld('Test', 't');
    store.getState().loadWorld(world);
    expect(store.getState().toWorldSpec()).toEqual(world);
  });

  it('meldet Hinzufügen, Ändern und Entfernen über den Bus', () => {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    const seen: string[] = [];
    bus.on('entity.added', (e) => seen.push(`add:${e.entity.id}:${e.source}`));
    bus.on('entity.changed', (e) => seen.push(`chg:${e.entity.material?.color}:${e.prev.material?.color}`));
    bus.on('entity.removed', (e) => seen.push(`del:${e.entity.id}`));
    const s = store.getState();
    s.addEntity({ id: 'a', ref: 'EntitySpec.box', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } }, { source: 'remote' });
    s.updateEntity('a', { material: { color: '#ff0000' } });
    s.updateEntity('a', { material: undefined });
    s.removeEntity('a');
    expect(seen).toEqual(['add:a:remote', 'chg:#ff0000:undefined', 'chg:undefined:#ff0000', 'del:a']);
    expect('material' in (store.getState().entities.a ?? {})).toBe(false);
  });

  it('verweigert den Baumodus ohne Baurecht', () => {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    store.getState().setCanBuild(false);
    store.getState().setMode('build');
    expect(store.getState().mode).toBe('play');
  });
  it('Mehrfachauswahl: primär ist das zuletzt gewählte Objekt', () => {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    const s = store.getState();
    for (const id of ['a', 'b', 'c']) s.addEntity({ id, ref: 'EntitySpec.box', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
    const primary: (string | null)[] = [];
    const multi: string[][] = [];
    bus.on('selection.changed', (e) => primary.push(e.id));
    bus.on('selection.multi.changed', (e) => multi.push(e.ids));
    s.selectMany(['a', 'zzz', 'b', 'a']);
    expect(store.getState().selectedIds).toEqual(['a', 'b']);
    expect(store.getState().selection).toBe('b');
    s.toggleSelect('c');
    expect(store.getState().selectedIds).toEqual(['a', 'b', 'c']);
    s.toggleSelect('c');
    expect(store.getState().selection).toBe('b');
    s.select('a');
    expect(store.getState().selectedIds).toEqual(['a']);
    s.removeEntity('a');
    expect(store.getState().selectedIds).toEqual([]);
    expect(store.getState().selection).toBeNull();
    expect(primary.at(-1)).toBeNull();
    expect(multi.at(-1)).toEqual([]);
    s.selectMany(['b', 'c']);
    s.setMode('build');
    s.setMode('play');
    expect(store.getState().selectedIds).toEqual([]);
  });
});
