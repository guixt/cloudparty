import { describe, expect, it } from 'vitest';
import type { EntitySpec, Transform } from '../../shared/types';
import {
  alignDeltas, cloneEntities, distributeDeltas, expandToGroups, groupPatches, marqueeHit, moveTransforms, nextGroupName,
  pivotOf, quatFromAxisAngle, rotateTransforms, scaleTransforms, ungroupPatches, type Box,
} from './multi';

const t = (x: number, y = 0, z = 0): Transform => ({ pos: [x, y, z], rot: [0, 0, 0, 1], scale: [1, 1, 1] });
const e = (id: string, x: number, group?: string): EntitySpec => ({ id, ref: 'EntitySpec.box', transform: t(x), ...(group ? { group, groupName: 'G' } : {}) });
const box = (min: number, max: number, z0 = 0, z1 = 1): Box => ({ min: [min, 0, z0], max: [max, 1, z1] });
const world = (list: EntitySpec[]) => ({ entities: Object.fromEntries(list.map((x) => [x.id, x])), order: list.map((x) => x.id) });

describe('multi', () => {
  it('pivot ist Mitte der Gesamtbox', () => {
    expect(pivotOf([box(0, 2), box(4, 6)])).toEqual([3, 0.5, 0.5]);
  });
  it('moveTransforms verschiebt alle gleich', () => {
    expect(moveTransforms([t(0), t(2)], [1, 0, 3]).map((x) => x.pos)).toEqual([[1, 0, 3], [3, 0, 3]]);
  });
  it('rotateTransforms dreht um Y 90° um den Pivot', () => {
    const [a] = rotateTransforms([t(2)], [0, 0, 0], quatFromAxisAngle([0, 1, 0], Math.PI / 2));
    expect(a.pos[0]).toBeCloseTo(0);
    expect(a.pos[2]).toBeCloseTo(-2);
    expect(a.rot[1]).toBeCloseTo(Math.SQRT1_2);
  });
  it('scaleTransforms skaliert Positionen und Größen', () => {
    const [a] = scaleTransforms([t(2)], [1, 0, 0], 2);
    expect(a.pos).toEqual([3, 0, 0]);
    expect(a.scale).toEqual([2, 2, 2]);
  });
  it('alignDeltas links/Mitte/rechts/Boden', () => {
    const b = [box(0, 2), box(4, 5)];
    expect(alignDeltas(b, 'x-min').map((d) => d[0])).toEqual([0, -4]);
    expect(alignDeltas(b, 'x-max').map((d) => d[0])).toEqual([3, 0]);
    expect(alignDeltas(b, 'x-mid').map((d) => d[0])).toEqual([1.5, -2]);
    const g: Box[] = [{ min: [0, 0, 0], max: [1, 1, 1] }, { min: [0, 3, 0], max: [1, 4, 1] }];
    expect(alignDeltas(g, 'ground').map((d) => d[1])).toEqual([0, -3]);
  });
  it('distributeDeltas verteilt gleichmäßig', () => {
    const d = distributeDeltas([box(0, 1), box(1, 2), box(9, 10)], 'x');
    expect(d.map((v) => v[0])).toEqual([0, 3.5, 0]);
  });
  it('nextGroupName', () => {
    expect(nextGroupName([])).toBe('Gruppe 1');
    expect(nextGroupName(['Gruppe 1', 'Gruppe 3', undefined])).toBe('Gruppe 2');
  });
  it('marqueeHit', () => {
    expect(marqueeHit({ x0: 10, y0: 10, x1: 0, y1: 0 }, [{ id: 'a', x: 5, y: 5 }, { id: 'b', x: 11, y: 5 }])).toEqual(['a']);
  });
  it('expandToGroups holt alle Mitglieder', () => {
    const w = world([e('a', 0, 'g'), e('b', 1, 'g'), e('c', 2)]);
    expect(expandToGroups(['a'], w.entities, w.order)).toEqual(['a', 'b']);
    expect(expandToGroups(['c'], w.entities, w.order)).toEqual(['c']);
  });
  it('groupPatches verschiebt in neue Gruppe und löst Reste auf', () => {
    const w = world([e('a', 0, 'old'), e('b', 1, 'old'), e('c', 2), e('d', 3)]);
    const p = groupPatches(['a', 'c', 'd'], w.entities, w.order, 'new', 'Gruppe 1');
    expect(p.a).toEqual({ group: 'new', groupName: 'Gruppe 1' });
    expect(p.b).toEqual({ group: undefined, groupName: undefined });
    expect(groupPatches(['a'], w.entities, w.order, 'n', 'x')).toEqual({});
  });
  it('ungroupPatches löst ganze Gruppe', () => {
    const w = world([e('a', 0, 'g'), e('b', 1, 'g'), e('c', 2)]);
    expect(Object.keys(ungroupPatches(['a'], w.entities, w.order)).sort()).toEqual(['a', 'b']);
  });
  it('cloneEntities vergibt neue IDs und Gruppen-IDs', () => {
    let n = 0;
    const clones = cloneEntities([e('a', 0, 'g'), e('b', 1, 'g'), e('c', 2, 'h')], [1, 0, 0], (p) => `${p ?? 'e'}${++n}`);
    expect(clones[0].group).toBe(clones[1].group);
    expect(clones[0].group).not.toBe('g');
    expect(clones[2].group).toBeUndefined();
    expect(clones.map((c) => c.id)).not.toContain('a');
    expect(clones[0].transform.pos[0]).toBe(1);
  });
});
