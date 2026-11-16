import { describe, expect, it } from 'vitest';
import { AI_LIMITS } from '../../../shared/aiTools';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { executeTool, type RunCounters, type ToolContext } from './tools';

function setup() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().setCanBuild(true);
  const ctx: ToolContext = { store, bus, getAvatar: () => ({ position: [0, 0, 6], yaw: 0 }), confirm: async () => true };
  const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  const run = (name: string, input: unknown) => executeTool(name, input, ctx, counters);
  const all = () => store.getState().order.map((id) => store.getState().entities[id]);
  return { run, all, counters };
}

describe('add_bricks', () => {
  it('stapelt automatisch auf den Stein darunter', async () => {
    const t = setup();
    const r = await t.run('add_bricks', { bricks: [{ x: 0, z: 0, w: 2, d: 4 }, { x: 0, z: 0, w: 2, d: 2, color: '#2f6fd9' }, { x: 8, z: 0, w: 1, d: 1, kind: 'platte' }] });
    expect(r.ok).toBe(true);
    const [a, b, c] = t.all().filter((e) => e.ref === 'EntitySpec.brick');
    expect(a.transform.pos[1]).toBeCloseTo(0);
    expect(b.transform.pos[1]).toBeCloseTo(0.3);
    expect(b.material?.color).toBe('#2f6fd9');
    expect(c.transform.pos[1]).toBeCloseTo(0);
    expect(a.transform.pos[0]).toBeCloseTo(0.25);
    expect(a.transform.pos[2]).toBeCloseTo(0.5);
    expect(t.counters.newEntities).toBe(3);
    expect(new Set([a, b, c].map((e) => e.group)).size).toBe(1);
  });
  it('rot90 vertauscht die Grundfläche, Ungültiges wird abgewiesen', async () => {
    const t = setup();
    await t.run('add_bricks', { bricks: [{ x: 0, z: 0, w: 2, d: 4, rot90: true }, { x: 0, z: 0, w: 1, d: 1 }] });
    const [a, b] = t.all().filter((e) => e.ref === 'EntitySpec.brick');
    expect(a.transform.pos[0]).toBeCloseTo(0.5); // 4 Noppen breit nach Drehung
    expect(b.transform.pos[1]).toBeCloseTo(0.3);
    expect((await t.run('add_bricks', { bricks: [{ x: 0.5, z: 0, w: 2, d: 4 }] })).ok).toBe(false);
    expect((await t.run('add_bricks', { bricks: [{ x: 0, z: 0, w: 99, d: 4 }] })).ok).toBe(false);
    expect((await t.run('add_bricks', { bricks: [{ x: 0, z: 0, w: 2, d: 4, kind: 'riese' }] })).ok).toBe(false);
  });
});

describe('fill_bricks', () => {
  it('mauert eine Wand mit Tür und versetzten Fugen', async () => {
    const t = setup();
    const r = await t.run('fill_bricks', { mode: 'wall', x: 0, z: 0, cols: 8, rows: 6, layers: 4, openings: [{ side: 'south', at: 2, width: 3, layers: 3 }] });
    expect(r.ok).toBe(true);
    const bricks = t.all().filter((e) => e.ref === 'EntitySpec.brick');
    expect(bricks.length).toBeGreaterThan(10);
    // Tür: im Süden (z = 5), Schichten 0–2, Noppen 2–4 bleibt frei.
    const inDoor = bricks.filter((e) => e.transform.pos[2] > 5 * 0.25 && e.transform.pos[1] < 0.9 && e.transform.pos[0] > 2 * 0.25 && e.transform.pos[0] < 5 * 0.25);
    expect(inDoor).toHaveLength(0);
    expect(Math.max(...bricks.map((e) => e.transform.pos[1]))).toBeCloseTo(0.9);
  });
  it('Boden aus Platten, Limits und Eingabeprüfung', async () => {
    const t = setup();
    expect((await t.run('fill_bricks', { mode: 'floor', x: 0, z: 0, cols: 8, rows: 8, layers: 1 })).ok).toBe(true);
    expect(t.all().filter((e) => e.ref === 'EntitySpec.brick').every((e) => e.state?.kind === 'platte')).toBe(true);
    expect((await t.run('fill_bricks', { mode: 'wall', x: 0, z: 0, cols: 2, rows: 6, layers: 2 })).ok).toBe(false);
    expect((await t.run('fill_bricks', { mode: 'wall', x: 0, z: 0, cols: 40, rows: 40, layers: 20 })).ok).toBe(false);
    t.counters.newEntities = AI_LIMITS.maxNewEntities - 1;
    expect((await t.run('fill_bricks', { mode: 'floor', x: 0, z: 0, cols: 40, rows: 40, layers: 1 })).ok).toBe(false);
  });
});

describe('Großer Boden', () => {
  it('40 × 40 Noppen sind wenige große Platten', async () => {
    const t = setup();
    const r = await t.run('fill_bricks', { mode: 'floor', x: -20, z: -20, cols: 40, rows: 40, layers: 1 });
    expect(r.ok).toBe(true);
    const bricks = t.all().filter((e) => e.ref === 'EntitySpec.brick');
    expect(bricks.length).toBeLessThanOrEqual(9);
    const area = bricks.reduce((a, e) => a + Number(e.state?.w) * Number(e.state?.d), 0);
    expect(area).toBe(1600);
  });
});
