import { describe, expect, it } from 'vitest';
import type { EntitySpec } from '../../shared/types';
import { EventBus } from '../core/events';
import { createWorldStore } from '../core/store';
import { History, HISTORY_LIMIT } from './history';

const box = (id: string, x = 0): EntitySpec => ({
  id,
  ref: 'EntitySpec.box',
  transform: { pos: [x, 0.5, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
});

function setup() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().loadWorld({ ...store.getState().toWorldSpec(), entities: [] });
  let t = 1000;
  const history = new History(store, bus, () => t);
  history.attach();
  const events: string[] = [];
  bus.on('entity.added', (e) => events.push(`add:${e.source}`));
  bus.on('entity.changed', (e) => events.push(`chg:${e.source}`));
  bus.on('entity.removed', (e) => events.push(`rem:${e.source}`));
  return { bus, store, history, events, advance: (ms: number) => (t += ms) };
}

describe('History', () => {
  it('macht add/remove rückgängig und stellt sie wieder her', () => {
    const { store, history } = setup();
    store.getState().addEntity(box('a'));
    expect(history.undoCount).toBe(1);
    history.undo();
    expect(store.getState().entities.a).toBeUndefined();
    history.redo();
    expect(store.getState().entities.a).toBeDefined();
    store.getState().removeEntity('a');
    history.undo();
    expect(store.getState().entities.a).toBeDefined();
    history.redo();
    expect(store.getState().entities.a).toBeUndefined();
  });

  it('stellt Felder inklusive entfernter Felder wieder her', () => {
    const { store, history, advance } = setup();
    store.getState().addEntity(box('a'));
    advance(5000);
    store.getState().updateEntity('a', { physics: { mode: 'static' } });
    advance(5000);
    store.getState().updateEntity('a', { name: 'X' });
    history.undo();
    expect(store.getState().entities.a.name).toBeUndefined();
    history.undo();
    expect(store.getState().entities.a.physics).toBeUndefined();
    history.redo();
    expect(store.getState().entities.a.physics?.mode).toBe('static');
  });

  it('fasst schnelle Änderungen desselben Feldes zusammen', () => {
    const { store, history, advance } = setup();
    store.getState().addEntity(box('a'));
    advance(5000);
    for (const n of ['A', 'AB', 'ABC']) {
      store.getState().updateEntity('a', { name: n });
      advance(100);
    }
    expect(history.undoCount).toBe(2);
    history.undo();
    expect(store.getState().entities.a.name).toBeUndefined();
    advance(5000);
    store.getState().updateEntity('a', { name: 'Q' });
    advance(100);
    store.getState().updateEntity('a', { material: { color: '#ff0000' } });
    expect(history.undoCount).toBe(3);
  });

  it('zeichnet transiente und fremde Änderungen nicht auf, Undo wird gesendet aber nicht aufgezeichnet', () => {
    const { store, history, events } = setup();
    store.getState().addEntity(box('a'));
    store.getState().updateEntity('a', { name: 'T' }, { transient: true });
    store.getState().updateEntity('a', { name: 'R' }, { source: 'remote' });
    store.getState().addEntity(box('b'), { source: 'script' });
    expect(history.undoCount).toBe(1);
    events.length = 0;
    history.undo();
    expect(events).toEqual(['rem:local']);
    expect(history.undoCount).toBe(0);
    expect(history.redoCount).toBe(1);
  });

  it('Neue Änderung leert den Redo-Stapel', () => {
    const { store, history } = setup();
    store.getState().addEntity(box('a'));
    history.undo();
    expect(history.state.getState().canRedo).toBe(true);
    store.getState().addEntity(box('b'));
    expect(history.state.getState().canRedo).toBe(false);
  });

  it('Gizmo-Geste: Rückgängig stellt den Stand vor dem Ziehen wieder her', () => {
    const { store, history } = setup();
    store.getState().addEntity(box('a', 1));
    history.pin('a');
    for (const x of [2, 3, 4]) {
      store.getState().updateEntity('a', { transform: { ...box('a').transform, pos: [x, 0.5, 0] } }, { transient: true });
    }
    store.getState().updateEntity('a', { transform: { ...box('a').transform, pos: [4, 0.5, 0] } });
    expect(history.undoCount).toBe(2);
    history.undo();
    expect(store.getState().entities.a.transform.pos).toEqual([1, 0.5, 0]);
  });

  it('begrenzt auf 200 Schritte und leert bei world.loaded', () => {
    const { store, history, bus, advance } = setup();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      advance(5000);
      store.getState().addEntity(box(`e${i}`));
    }
    expect(history.undoCount).toBe(HISTORY_LIMIT);
    store.getState().loadWorld({ ...store.getState().toWorldSpec(), entities: [] });
    bus.emit('world.loaded', { world: store.getState().toWorldSpec() });
    expect(history.undoCount).toBe(0);
    expect(history.state.getState().canUndo).toBe(false);
  });
});
