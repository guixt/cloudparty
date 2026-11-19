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

describe('Mengengrenzen', () => {
  function setupAsk(answer: boolean) {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    store.getState().setCanBuild(true);
    const asked: string[] = [];
    const ctx: ToolContext = { store, bus, getAvatar: () => null, confirm: async (q) => (asked.push(q), answer) };
    const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
    return { store, asked, counters, run: (n: string, i: unknown) => executeTool(n, i, ctx, counters) };
  }
  const bricks = (n: number) => Array.from({ length: n }, (_, i) => ({ x: (i % 200) * 2, z: Math.floor(i / 200) * 2, w: 2, d: 2 }));

  it('große Aufträge (≥ 300 Objekte) fragen einmal nach; Ablehnung baut nichts', async () => {
    const t = setupAsk(true);
    expect((await t.run('add_bricks', { bricks: bricks(250) })).ok).toBe(true);
    expect(t.asked).toHaveLength(0);
    expect((await t.run('add_bricks', { bricks: bricks(100) })).ok).toBe(true);
    expect(t.asked).toHaveLength(1);
    expect((await t.run('add_bricks', { bricks: bricks(50) })).ok).toBe(true);
    expect(t.asked).toHaveLength(1); // nur einmal pro Auftrag
    const no = setupAsk(false);
    const r = await no.run('add_bricks', { bricks: bricks(400) });
    expect(r.ok).toBe(false);
    expect(no.store.getState().order.filter((i) => no.store.getState().entities[i].ref === 'EntitySpec.brick')).toHaveLength(0);
  });

  it('harte Grenzen: je Aufruf 500, je Auftrag 1000, je Welt 2000', async () => {
    const t = setupAsk(true);
    expect((await t.run('add_bricks', { bricks: bricks(501) })).ok).toBe(false);
    for (let i = 0; i < 2; i++) expect((await t.run('add_bricks', { bricks: bricks(500) })).ok).toBe(true);
    const over = await t.run('add_bricks', { bricks: bricks(1) });
    expect(over.ok).toBe(false);
    expect(over.content).toContain(`${AI_LIMITS.maxNewEntities}`);
    const w = setupAsk(true);
    for (let i = 0; i < 3; i++) {
      w.counters.newEntities = 0; // neue „Aufträge“
      expect((await w.run('add_bricks', { bricks: bricks(500) })).ok).toBe(true);
    }
    // Es gibt keine Obergrenze je Welt mehr: auch jenseits von 2000 Objekten geht es weiter.
    for (let i = 0; i < 2; i++) {
      w.counters.newEntities = 0;
      expect((await w.run('add_bricks', { bricks: bricks(500) })).ok).toBe(true);
    }
    expect(w.store.getState().order.length).toBeGreaterThan(2000);
  });
});

describe('Maße und Öffnungen von Klemmbaustein-Wänden', () => {
  it('get_bounds kennt die echten Maße; die Tür steht mit Weltkoordinaten im Ergebnis', async () => {
    const t = setup();
    const r = await t.run('fill_bricks', { mode: 'wall', x: 20, z: 20, cols: 10, rows: 6, layers: 6, openings: [{ side: 'south', at: 4, width: 2, layers: 4 }] });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('south: x 6');
    expect(r.content).toContain('z = 6.5');
    const g = /group="(grp_[^"]+)"/.exec(r.content)![1];
    const b = JSON.parse(/<welt_daten>\n([\s\S]*)\n<\/welt_daten>/.exec((await t.run('get_bounds', { id: g })).content)![1]);
    expect(b.groesse[0]).toBeCloseTo(2.5);
    expect(b.groesse[1]).toBeCloseTo(1.8);
    expect(b.groesse[2]).toBeCloseTo(1.5);
    expect(b.ungefaehr).not.toBe(true);
    // in der Türlücke (south = größeres z, x 6.0–6.5, y < 1.2) steht kein Stein
    const bricks = t.all().filter((e) => e.ref === 'EntitySpec.brick' && e.transform.pos[2] > 6.2);
    expect(bricks.filter((e) => e.transform.pos[0] > 6 && e.transform.pos[0] < 6.5 && e.transform.pos[1] < 1.1)).toHaveLength(0);
  });
});

describe('Drehungen und Profil', () => {
  it('rot 180 und 270: Schrägen fallen nach −z und −x, Grundfläche vertauscht bei 270', async () => {
    const t = setup();
    const r = await t.run('add_bricks', { bricks: [{ x: 0, z: 0, w: 2, d: 3, kind: 'bogen', rot: 180 }, { x: 10, z: 0, w: 2, d: 3, kind: 'schraeg', rot: 270 }] });
    expect(r.ok).toBe(true);
    const [a, b] = t.all().filter((e) => e.ref === 'EntitySpec.brick');
    expect(a.transform.rot[1]).toBeCloseTo(1, 5); // 180° um Y
    expect(a.transform.pos[0]).toBeCloseTo(0.25); // 2 breit: Mitte x = 1 Noppe
    expect(a.transform.pos[2]).toBeCloseTo(0.375); // 3 tief
    expect(b.transform.pos[0]).toBeCloseTo((10 + 1.5) * 0.25); // 270° vertauscht: 3 breit
    expect((await t.run('add_bricks', { bricks: [{ x: 0, z: 0, w: 2, d: 2, rot: 45 }] })).ok).toBe(false);
    expect((await t.run('add_bricks', { bricks: [{ x: 20, z: 0, w: 2, d: 2, kind: 'bogenlauf' }, { x: 30, z: 0, w: 4, d: 4, kind: 'kuppel' }, { x: 40, z: 0, w: 2, d: 2, kind: 'viertel' }, { x: 50, z: 0, w: 2, d: 2, kind: 'rundplatte' }] })).ok).toBe(true);
  });
  it('bricks_profile baut Rumpf mit Rändern in einem Aufruf', async () => {
    const t = setup();
    const r = await t.run('bricks_profile', { x: 0, z: 0, width: 8, segments: [{ len: 6, h: 5, edge_before: 'curve' }, { len: 8, h: 9 }, { len: 6, h: 6, edge_after: 'slope' }] });
    expect(r.ok).toBe(true);
    const bricks = t.all().filter((e) => e.ref === 'EntitySpec.brick');
    expect(bricks.some((e) => e.state?.kind === 'bogen')).toBe(true);
    expect(bricks.some((e) => e.state?.kind === 'schraeg')).toBe(true);
    expect(bricks.some((e) => e.state?.studs === false)).toBe(true);
    expect(r.content).toContain('Maße: min');
    expect((await t.run('bricks_profile', { x: 0, z: 0, width: 8, segments: [] })).ok).toBe(false);
    expect((await t.run('bricks_profile', { x: 0, z: 0, width: 8, segments: [{ len: 4, h: 3, edge_after: 'wild' }] })).ok).toBe(false);
  });
});
