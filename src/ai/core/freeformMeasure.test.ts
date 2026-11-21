import { describe, expect, it } from 'vitest';
import { freeformBounds, sanitizeFreeformState } from '../../../shared/freeform';
import type { EntitySpec } from '../../../shared/types';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { yawQuat } from './buildGeometry';
import { entityBox } from './buildTools';
import { findOverlaps, obbOf } from './overlap';
import { executeTool, type RunCounters, type ToolContext } from './tools';

const state = { kind: 'sweep', path: [{ p: [0, 0] }, { p: [4, 0] }], height: 2.4, thickness: 0.2 };
const ff = (id: string, pos: [number, number, number], extra: Partial<EntitySpec> = {}): EntitySpec => ({
  id,
  ref: 'EntitySpec.freeform',
  transform: { pos, rot: [0, 0, 0, 1], scale: [1, 1, 1] },
  state,
  ...extra,
});
const box = (id: string, pos: [number, number, number]): EntitySpec => ({ id, ref: 'EntitySpec.box', transform: { pos, rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
const world = (list: EntitySpec[]) => ({ entities: Object.fromEntries(list.map((e) => [e.id, e])), order: list.map((e) => e.id) });

function setup() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().setCanBuild(true);
  const ctx: ToolContext = { store, bus, getAvatar: () => ({ position: [0, 0, 6], yaw: 0 }), confirm: async () => true };
  const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  return { store, run: (name: string, input: unknown) => executeTool(name, input, ctx, counters) };
}

describe('Freiform: Maße und Überschneidungen', () => {
  const b = freeformBounds(sanitizeFreeformState(state));
  it('entityBox skaliert', () => {
    const e = ff('f', [1, 0, 2], { transform: { pos: [1, 0, 2], rot: [0, 0, 0, 1], scale: [1, 2, 1] } });
    const r = entityBox(e);
    expect(r.approx).toBe(false);
    expect(r.box.max[1] - r.box.min[1]).toBeCloseTo((b.max[1] - b.min[1]) * 2);
    expect(r.box.min[0]).toBeCloseTo(1 + b.min[0]);
  });
  it('entityBox gedreht um 90 Grad vertauscht x und z', () => {
    const e = ff('f', [0, 0, 0], { transform: { pos: [0, 0, 0], rot: yawQuat(90), scale: [2, 1, 3] } });
    const r = entityBox(e).box;
    expect(r.max[2] - r.min[2]).toBeCloseTo((b.max[0] - b.min[0]) * 2);
    expect(r.max[0] - r.min[0]).toBeCloseTo((b.max[2] - b.min[2]) * 3);
  });
  it('OBB hat die halbe Hüllgröße', () => {
    const o = obbOf(ff('f', [0, 0, 0]))!;
    expect(o.half[0]).toBeCloseTo((b.max[0] - b.min[0]) / 2);
  });
  it('Freiform und Box: erst ab 0,15 m Tiefe', () => {
    const a = ff('a', [0, 0, 0]);
    const at = (depth: number) => box('b', [b.max[0] + 0.5 - depth, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
    const shallow = world([a, at(0.1)]);
    const deep = world([a, at(0.3)]);
    expect(findOverlaps(shallow.entities, shallow.order, ['a']).total).toBe(0);
    expect(findOverlaps(deep.entities, deep.order, ['a']).total).toBe(1);
  });
  it('zwei Freiformen überschneiden sich, in derselben Gruppe nicht', () => {
    const w = world([ff('a', [0, 0, 0]), ff('b', [b.max[0] - b.min[0] - 0.3, 0, 0])]);
    expect(findOverlaps(w.entities, w.order, ['a']).total).toBe(1);
    const g = world([ff('a', [0, 0, 0], { group: 'g' }), ff('b', [1, 0, 0], { group: 'g' })]);
    expect(findOverlaps(g.entities, g.order, ['a']).total).toBe(0);
  });
  it('Werkzeuge: get_bounds, check_overlaps, place_relative', async () => {
    const t = setup();
    t.store.getState().addEntity(ff('ff1', [1, 0, 2]));
    t.store.getState().addEntity(box('bx', [20, 0.5, 20]));
    const r = await t.run('get_bounds', { id: 'ff1' });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).toMatch(/ungefaehr[^,]*false|ungefähr[^,]*false/);
    expect((await t.run('check_overlaps', {})).ok).toBe(true);
    const p = await t.run('place_relative', { id: 'bx', relative_to: 'ff1', where: 'east' });
    expect(p.ok).toBe(true);
    const size: [number, number, number] = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const v = await t.run('verify', { checks: [{ type: 'size', id: 'ff1', size }, { type: 'touching', a: 'bx', b: 'ff1' }] });
    expect(v.ok).toBe(true);
    expect(v.content).not.toMatch(/FEHLER|✗/);
  });
});
