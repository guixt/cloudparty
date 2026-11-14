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
});
