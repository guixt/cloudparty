import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import type { EntitySpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { TweenManager, easeValue } from './tween';

function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const entityNodes = new Map<string, TransformNode>();
  const ids = ['a', 'b'];
  ids.forEach((id, i) => {
    const e: EntitySpec = { id, ref: 'EntitySpec.box', transform: { pos: [i * 4, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } };
    store.getState().addEntity(e);
    const node = new TransformNode(id, scene);
    node.position.set(i * 4, 0, 0);
    entityNodes.set(id, node);
  });
  let clock = 0;
  const ctx = { scene, bus, store, entityNodes } as unknown as GameContext;
  const tw = new TweenManager(ctx, () => clock);
  const at = (ms: number) => {
    clock = ms;
    tw.step();
  };
  return { tw, bus, store, entityNodes, at };
}

describe('Kurven', () => {
  it('Anfang, Ende und Mitte', () => {
    for (const ease of ['linear', 'inOut', 'out'] as const) {
      expect(easeValue(ease, 0)).toBe(0);
      expect(easeValue(ease, 1)).toBe(1);
    }
    expect(easeValue('linear', 0.5)).toBe(0.5);
    expect(easeValue('inOut', 0.5)).toBe(0.5);
    expect(easeValue('out', 0.5)).toBeGreaterThan(0.5);
  });
});

describe('TweenManager', () => {
  it('gleitet von der alten Darstellung zum neuen Zustand im Store und endet genau dort', () => {
    const t = setup();
    t.bus.emit('entity.tween', { ids: ['a'], duration: 2, ease: 'linear' });
    t.store.getState().updateEntity('a', { transform: { pos: [10, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
    t.at(0);
    t.at(1000);
    expect(t.entityNodes.get('a')!.position.x).toBeCloseTo(5);
    t.at(2500);
    expect(t.entityNodes.get('a')!.position.x).toBeCloseTo(10);
    expect(t.tw.activeCount).toBe(0);
  });

  it('Bahn: Gruppe dreht sich als starrer Körper um den Drehpunkt (Abstand bleibt, Viertel ergibt Quadranten)', () => {
    const t = setup();
    t.bus.emit('entity.tween', { ids: ['a', 'b'], duration: 4, ease: 'linear', orbit: { pivot: [2, 0, 0], axis: [0, 1, 0], angleDeg: 360 } });
    t.at(1000); // Viertel
    const a = t.entityNodes.get('a')!.position;
    const b = t.entityNodes.get('b')!.position;
    expect(Math.hypot(a.x - 2, a.z)).toBeCloseTo(2);
    expect(Math.hypot(b.x - 2, b.z)).toBeCloseTo(2);
    expect(a.x + b.x).toBeCloseTo(4);
    expect(Math.abs(a.z)).toBeCloseTo(2); // Viertelkreis: von der x-Achse auf die z-Achse
    t.at(2000); // halber Kreis: a und b getauscht
    expect(t.entityNodes.get('a')!.position.x).toBeCloseTo(4);
    t.at(5000);
    expect(t.entityNodes.get('a')!.position.x).toBeCloseTo(0); // Ziel: Store = Ausgangslage (360° ändern nichts)
  });

  it('eine neue Bewegung startet von der aktuellen Darstellung; entfernte Knoten brechen nichts', () => {
    const t = setup();
    t.bus.emit('entity.tween', { ids: ['a'], duration: 2, ease: 'linear' });
    t.store.getState().updateEntity('a', { transform: { pos: [10, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
    t.at(0);
    t.at(1000);
    t.bus.emit('entity.tween', { ids: ['a'], duration: 1, ease: 'linear' });
    t.store.getState().updateEntity('a', { transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
    t.at(1000);
    t.at(1500);
    expect(t.entityNodes.get('a')!.position.x).toBeCloseTo(2.5); // halbe Strecke von 5 nach 0
    t.store.getState().removeEntity('a');
    expect(() => t.at(1600)).not.toThrow();
  });
});
