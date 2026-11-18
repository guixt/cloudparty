import { describe, expect, it } from 'vitest';
import type { EntitySpec } from '../../../shared/types';
import { OVERLAP_MIN_DEPTH, belowSurface, findOverlaps, obbOf, penetration } from './overlap';
import { yawQuat } from './buildGeometry';

const box = (id: string, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], extra: Partial<EntitySpec> = {}): EntitySpec => ({
  id,
  ref: 'EntitySpec.box',
  name: id,
  transform: { pos, rot: [0, 0, 0, 1], scale },
  ...extra,
});
const world = (list: EntitySpec[]) => ({ entities: Object.fromEntries(list.map((e) => [e.id, e])), order: list.map((e) => e.id) });

describe('Überschneidungen (SAT)', () => {
  it('Tiefe zweier achsenparalleler Quader und Berührung ohne Überschneidung', () => {
    const a = obbOf(box('a', [0, 0.5, 0]))!;
    expect(penetration(a, obbOf(box('b', [0.7, 0.5, 0]))!)!.depth).toBeCloseTo(0.3);
    expect(penetration(a, obbOf(box('c', [1.0, 0.5, 0]))!)).toBeNull(); // berührt genau
    expect(penetration(a, obbOf(box('d', [3, 0.5, 0]))!)).toBeNull();
    const p = penetration(a, obbOf(box('e', [0.2, 0.5, 0.9]))!)!;
    expect(p.depth).toBeCloseTo(0.1); // kleinste Verschiebung in z
    expect(Math.abs(p.axis[2])).toBeCloseTo(1);
  });

  it('gedrehte Quader: Balken quer durch eine Wand', () => {
    const wall = box('wand', [0, 1.5, 0], [6, 3, 0.3]);
    const beam = box('balken', [0, 1.5, 0], [0.2, 0.2, 4], { transform: { pos: [0, 1.5, 0], rot: yawQuat(90), scale: [0.2, 0.2, 4] } });
    expect(penetration(obbOf(wall)!, obbOf(beam)!)).not.toBeNull();
    const far = box('weit', [0, 1.5, 5], [0.2, 0.2, 4], { transform: { pos: [0, 1.5, 5], rot: yawQuat(45), scale: [0.2, 0.2, 4] } });
    expect(penetration(obbOf(wall)!, obbOf(far)!)).toBeNull();
    // Gedrehter Quader, dessen Hüllquader die Wand schneiden würde, die echte Form aber nicht
    const diag = { ...box('diag', [1.9, 0.5, 1.4], [1, 1, 1]), transform: { pos: [1.9, 0.5, 1.4] as [number, number, number], rot: yawQuat(45), scale: [1, 1, 1] as [number, number, number] } };
    expect(penetration(obbOf(box('w2', [0, 0.5, 0], [4, 1, 1]))!, obbOf(diag)!)).toBeNull();
  });

  it('findOverlaps: meldet tiefe Überschneidungen, keine kleinen Berührungen, keine Paare derselben Gruppe', () => {
    const w = world([box('a', [0, 0.5, 0]), box('b', [0.5, 0.5, 0]), box('c', [0.97, 0.5, 3]), box('d', [4, 0.5, 3]), box('g1', [10, 0.5, 0], [1, 1, 1], { group: 'g' }), box('g2', [10.5, 0.5, 0], [1, 1, 1], { group: 'g' })]);
    const r = findOverlaps(w.entities, w.order, w.order);
    expect(r.total).toBe(1);
    expect(r.overlaps[0]).toMatchObject({ a: 'a', b: 'b' });
    expect(r.overlaps[0].depth).toBeCloseTo(0.5);
    // Teil einer Gruppe gegen ein Fremdes zählt
    const w2 = world([box('g1', [10, 0.5, 0], [1, 1, 1], { group: 'g' }), box('x', [10.5, 0.5, 0])]);
    expect(findOverlaps(w2.entities, w2.order, ['g1']).total).toBe(1);
    expect(OVERLAP_MIN_DEPTH).toBeGreaterThan(0);
  });

  it('Wandecken (Überlappung um die halbe Dicke) sind keine Überschneidung, zu tiefes Eindringen schon', () => {
    const w = world([box('w1', [0, 1.5, 0], [6, 3, 0.3]), box('w2', [2.85, 1.5, 3], [0.3, 3, 6]), box('w3', [-2.5, 1.5, 0.2], [0.3, 3, 6])]);
    const r = findOverlaps(w.entities, w.order, w.order);
    const pairs = r.overlaps.map((o) => `${o.a}|${o.b}`);
    expect(pairs).not.toContain('w1|w2');
    expect(pairs).toContain('w1|w3'); // w3 steckt 0,5 m tief in w1
  });

  it('Objekte ohne bekannte Maße, Zonen und Lichter werden übersprungen', () => {
    const w = world([box('a', [0, 0.5, 0]), box('zone', [0, 0.5, 0], [3, 3, 3], { physics: { mode: 'trigger' } }), { ...box('bank', [0, 0, 0]), ref: 'EntitySpec.bench' }, { ...box('licht', [0, 0.5, 0]), ref: 'EntitySpec.light' }]);
    expect(findOverlaps(w.entities, w.order, w.order).total).toBe(0);
  });

  it('Teile unter der Inseloberfläche', () => {
    const w = world([box('tief', [0, 0.2, 0]), box('gut', [0, 0.5, 0]), { ...box('boden', [0, -0.02, 0], [4, 1, 4]), ref: 'EntitySpec.plane' }]);
    expect(belowSurface(w.entities, w.order).map((x) => x.id)).toEqual(['tief']);
  });
});
