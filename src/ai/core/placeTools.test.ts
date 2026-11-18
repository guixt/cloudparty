import { describe, expect, it } from 'vitest';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { entityBox } from './buildTools';
import { mediaScreen } from './placeTools';
import { executeTool, type RunCounters, type ToolContext } from './tools';
import { diffEntities, type ChangeSet } from './placeTools';

function setup() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().setCanBuild(true);
  const start = new Map(Object.entries(store.getState().entities));
  const ctx: ToolContext = {
    store,
    bus,
    getAvatar: () => ({ position: [0, 0, 6], yaw: 0 }),
    confirm: async () => true,
    createdSince: () => store.getState().order.filter((id) => !start.has(id)),
    changedSince: (): ChangeSet => {
      const { entities } = store.getState();
      const modified: ChangeSet['modified'] = [];
      for (const [id, before] of start) {
        const after = entities[id];
        if (after && after !== before) {
          const fields = diffEntities(before, after);
          if (fields.length) modified.push({ id, fields });
        }
      }
      return { created: store.getState().order.filter((id) => !start.has(id)), removed: [], modified };
    },
  };
  const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  const run = (name: string, input: unknown) => executeTool(name, input, ctx, counters);
  const get = (id: string) => store.getState().entities[id];
  return { store, ctx, run, get };
}
const idOf = (text: string) => /id="([^"]+)"/.exec(text)![1];

async function wallWithWindow(t: ReturnType<typeof setup>) {
  // Wand entlang x bei z = 0: Fenster bei 3–5 m, Höhe 1–2,5 m
  const wall = await t.run('add_wall', { from: [0, 0], to: [8, 0], height: 3, thickness: 0.3, openings: [{ at: 3, width: 2, height: 1.5, sill: 1, name: 'Südfenster' }], name: 'Hauswand' });
  const board = await t.run('add_entity', { ref: 'EntitySpec.media-image', position: [0, 0, 4] });
  return { wall, boardId: idOf(board.content) };
}

describe('Öffnungen als Metadaten', () => {
  it('add_wall speichert Öffnungen und nennt sie im Ergebnis und in get_bounds', async () => {
    const t = setup();
    const { wall } = await wallWithWindow(t);
    expect(wall.content).toContain('Südfenster');
    expect(wall.content).toContain('2 m breit × 1.5 m hoch');
    const group = /group="([^"]+)"/.exec(wall.content)![1];
    const b = await t.run('get_bounds', { id: group });
    expect(b.content).toContain('Südfenster');
  });

  it('fill_bricks speichert Öffnungen mit Welt-Maßen', async () => {
    const t = setup();
    const r = await t.run('fill_bricks', { mode: 'wall', x: 0, z: 0, cols: 12, rows: 8, layers: 6, openings: [{ side: 'south', at: 4, width: 4, layers: 3, sill_layers: 2 }] });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('Fenster 1');
    expect(r.content).toContain('1 m breit × 0.9 m hoch');
  });
});

describe('fit_to_opening', () => {
  it('setzt eine Tafel exakt in das Fenster (Mitte, Größe, Blick)', async () => {
    const t = setup();
    const { wall, boardId } = await wallWithWindow(t);
    const group = /group="([^"]+)"/.exec(wall.content)![1];
    const r = await t.run('fit_to_opening', { id: boardId, wall: group, face: 'south' });
    expect(r.ok).toBe(true);
    const e = t.get(boardId);
    const s = mediaScreen(e)!;
    // Öffnungsmitte: x = 4, y = 1,75; Bildfläche liegt fast bündig an der Südfläche (z = +0,13)
    expect(s.center[0]).toBeCloseTo(4, 2);
    expect(s.center[1]).toBeCloseTo(1.75, 2);
    expect(s.center[2]).toBeCloseTo(0.13, 2);
    expect(s.width).toBeLessThanOrEqual(2.001);
    expect(s.height).toBeLessThanOrEqual(1.501);
    expect(s.front[2]).toBeGreaterThan(0.99); // schaut nach +z (south)
    expect(e.state?.stand).toBe(false);
    const v = await t.run('verify', { checks: [{ type: 'in_opening', id: boardId, wall: group }] });
    expect(v.content).toContain('✓');
  });

  it('stretch füllt die Öffnung ganz, face north dreht die Tafel um', async () => {
    const t = setup();
    const { wall, boardId } = await wallWithWindow(t);
    const group = /group="([^"]+)"/.exec(wall.content)![1];
    await t.run('fit_to_opening', { id: boardId, wall: group, fit: 'stretch', face: 'north' });
    const s = mediaScreen(t.get(boardId))!;
    expect(s.width).toBeCloseTo(2, 2);
    expect(s.height).toBeCloseTo(1.5, 2);
    expect(s.front[2]).toBeLessThan(-0.99);
  });

  it('falsch platzierte Tafel fällt bei verify mit Korrekturhinweis durch', async () => {
    const t = setup();
    const { wall, boardId } = await wallWithWindow(t);
    const group = /group="([^"]+)"/.exec(wall.content)![1];
    const v = await t.run('verify', { checks: [{ type: 'in_opening', id: boardId, wall: group, opening: 'Südfenster' }] });
    expect(v.content).toContain('✗');
    expect(v.content).toContain('fit_to_opening');
  });

  it('Fehler ohne gespeicherte Öffnungen, Gruppe als id und unbekannte Öffnung', async () => {
    const t = setup();
    const { wall, boardId } = await wallWithWindow(t);
    const group = /group="([^"]+)"/.exec(wall.content)![1];
    expect((await t.run('fit_to_opening', { id: group, wall: group })).ok).toBe(false);
    expect((await t.run('fit_to_opening', { id: boardId, wall: group, opening: 'Nordtür' })).content).toContain('Südfenster');
    const plain = await t.run('add_entity', { ref: 'EntitySpec.box', position: [10, 0.5, 10] });
    expect((await t.run('fit_to_opening', { id: boardId, wall: idOf(plain.content) })).content).toContain('keine Öffnungen');
  });

  it('Quader füllt die Öffnung als Scheibe', async () => {
    const t = setup();
    const { wall } = await wallWithWindow(t);
    const group = /group="([^"]+)"/.exec(wall.content)![1];
    const pane = await t.run('add_entity', { ref: 'EntitySpec.box', position: [0, 0.5, 5] });
    await t.run('fit_to_opening', { id: idOf(pane.content), wall: group });
    const box = entityBox(t.get(idOf(pane.content))).box;
    expect(box.max[0] - box.min[0]).toBeCloseTo(2, 2);
    expect(box.max[1] - box.min[1]).toBeCloseTo(1.5, 2);
    expect((box.min[2] + box.max[2]) / 2).toBeCloseTo(0, 2);
  });
});

describe('place_relative und align_entities', () => {
  it('setzt auf, neben und mit Abstand', async () => {
    const t = setup();
    const a = idOf((await t.run('add_entity', { ref: 'EntitySpec.box', position: [0, 0.5, 0] })).content);
    const b = idOf((await t.run('add_entity', { ref: 'EntitySpec.box', position: [9, 7, 9], scale: [2, 1, 2] })).content);
    await t.run('place_relative', { id: b, relative_to: a, where: 'on_top' });
    const eb = entityBox(t.get(b)).box;
    expect(eb.min[1]).toBeCloseTo(1, 3); // Oberkante des ersten Würfels
    expect((eb.min[0] + eb.max[0]) / 2).toBeCloseTo(0, 3);
    await t.run('place_relative', { id: b, relative_to: a, where: 'east', gap: 0.5 });
    const eb2 = entityBox(t.get(b)).box;
    expect(eb2.min[0]).toBeCloseTo(0.5 + 0.5, 3);
    expect(eb2.min[1]).toBeCloseTo(0, 3); // gleiche Standhöhe wie a
    expect((await t.run('place_relative', { id: a, relative_to: a, where: 'east' })).ok).toBe(false);
    expect((await t.run('place_relative', { id: a, relative_to: b, where: 'oben' })).ok).toBe(false);
  });

  it('bewegt ganze Gruppen und verteilt gleichmäßig', async () => {
    const t = setup();
    const ids = [] as string[];
    for (const x of [0, 3, 10]) ids.push(idOf((await t.run('add_entity', { ref: 'EntitySpec.box', position: [x, 0.5, 2 + x / 10] })).content));
    await t.run('align_entities', { ids, axis: 'z', to: 'min', distribute_axis: 'x' });
    const boxes = ids.map((id) => entityBox(t.get(id)).box);
    expect(boxes[0].min[2]).toBeCloseTo(boxes[2].min[2], 3);
    const gap1 = boxes[1].min[0] - boxes[0].max[0];
    const gap2 = boxes[2].min[0] - boxes[1].max[0];
    expect(gap1).toBeCloseTo(gap2, 3);
    expect((await t.run('align_entities', { ids, distribute_axis: 'x', gap: 0.2 })).ok).toBe(true);
    expect((await t.run('align_entities', { ids })).ok).toBe(false);
  });
});

describe('verify', () => {
  it('on_ground, touching, size, inside und no_overlap', async () => {
    const t = setup();
    const a = idOf((await t.run('add_entity', { ref: 'EntitySpec.box', position: [20, 2, 20] })).content);
    const b = idOf((await t.run('add_entity', { ref: 'EntitySpec.box', position: [20, 3, 20] })).content);
    const v = await t.run('verify', { checks: [{ type: 'on_ground', id: a }, { type: 'touching', a, b }, { type: 'size', id: a, size: [1, 1, 1] }, { type: 'inside', id: a, container: b }, { type: 'no_overlap', id: a }] });
    expect(v.content).toContain('✗ 1. on_ground');
    expect(v.content).toContain('schwebt');
    expect(v.content).toContain('✓ 3. size');
    expect(v.content).toContain('✓ 2. touching');
    expect(v.summary).toContain('nicht bestanden');
    expect((await t.run('verify', { checks: [{ type: 'quatsch' }] })).ok).toBe(false);
    expect((await t.run('verify', { checks: [] })).ok).toBe(false);
  });
});

describe('find_free_spot', () => {
  it('findet einen freien Platz neben Hindernissen, nicht auf ihnen', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [0, 1, 0], scale: [4, 2, 4] });
    const r = await t.run('find_free_spot', { size: [2, 2], center: [0, 0], radius: 8, count: 2 });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('1. x');
    const [x, z] = /1\. x (-?[\d.]+), z (-?[\d.]+)/.exec(r.content)!.slice(1).map(Number);
    expect(Math.max(Math.abs(x), Math.abs(z))).toBeGreaterThan(2 + 1 + 0.3 - 0.01);
    const none = await t.run('find_free_spot', { size: [30, 30], center: [0, 0], radius: 3 });
    expect(none.content).toContain('Kein freier Platz');
  });
});

describe('what_changed', () => {
  it('meldet neue Gruppen, geänderte Objekte', async () => {
    const t = setup();
    const before = Object.keys(t.store.getState().entities);
    expect(before.length).toBeGreaterThanOrEqual(0);
    await t.run('add_wall', { from: [0, 0], to: [4, 0], height: 2, name: 'Mauer' });
    const r = await t.run('what_changed', {});
    expect(r.content).toContain('Gruppe „Mauer“');
    expect((await t.run('what_changed', {})).ok).toBe(true);
  });
});
