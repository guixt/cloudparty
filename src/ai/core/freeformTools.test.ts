import { describe, expect, it } from 'vitest';
import { FREEFORM_LIMITS, FREEFORM_REF } from '../../../shared/freeform';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { openingsOfGroup } from './anchors';
import { executeTool, type RunCounters, type ToolContext } from './tools';

function setup(canBuild = true) {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().setCanBuild(canBuild);
  const ctx: ToolContext = { store, bus, getAvatar: () => null, confirm: async () => true, autoApprove: true };
  const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  const run = (name: string, input: unknown) => executeTool(name, input, ctx, counters);
  const freeforms = () => Object.values(store.getState().entities).filter((e) => e.ref === FREEFORM_REF);
  return { store, ctx, counters, run, freeforms };
}

const ARC = [{ p: [0, 0], bulge: 1.5 }, { p: [6, 0] }];

describe('add_curved_wall', () => {
  it('legt eine Bogenwand mit Gruppe, Name und Material an', async () => {
    const { run, freeforms, counters } = setup();
    const r = await run('add_curved_wall', { path: ARC, height: 3, name: 'Kopfwand', material: { color: '#aa5522' } });
    expect(r.ok).toBe(true);
    const list = freeforms();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Kopfwand');
    expect(list[0].groupName).toBe('Kopfwand');
    expect(list[0].group).toMatch(/^grp_/);
    expect(list[0].material?.color).toBe('#aa5522');
    expect(list[0].physics?.mode).toBe('static');
    expect((list[0].state as { kind: string; thickness: number }).kind).toBe('sweep');
    expect((list[0].state as { thickness: number }).thickness).toBe(0.3);
    expect(counters.newEntities).toBe(1);
  });

  it('speichert Öffnungen als Schnitte und Öffnungsdaten', async () => {
    const { run, freeforms, ctx } = setup();
    const r = await run('add_curved_wall', { path: [{ p: [0, 0] }, { p: [10, 0] }], height: 3, openings: [{ at: 2, width: 1, height: 2.1 }, { at: 6, width: 1.5, height: 1, sill: 1 }] });
    expect(r.ok).toBe(true);
    const e = freeforms()[0];
    const cuts = (e.state as { cuts: Array<{ pos: number[]; size: number[] }> }).cuts;
    expect(cuts).toHaveLength(2);
    // gerade Wand von x = 0 bis 10, Mitte verschoben auf x = 5: erste Öffnung bei Pfadmeter 2,5 = lokal -2,5
    expect(cuts[0].pos[0]).toBeCloseTo(-2.5, 1);
    expect(cuts[0].pos[1]).toBeCloseTo(1.05, 2);
    const infos = openingsOfGroup(ctx, e.group);
    expect(infos.map((o) => o.kind)).toEqual(['Tür', 'Fenster']);
    expect(infos[0].center[0]).toBeCloseTo(2.5, 2);
    expect(r.ok && r.content).toContain('Öffnungen gespeichert');
  });

  it('rechnet Öffnungen auf einem Bogen entlang des Bogens', async () => {
    const { run, freeforms, ctx } = setup();
    // Halbkreis von (0,0) nach (6,0) mit Pfeilhöhe 3 (= Radius), Länge = 3π
    const r = await run('add_curved_wall', { path: [{ p: [0, 0], bulge: 3 }, { p: [6, 0] }], height: 3, openings: [{ at: (3 * Math.PI) / 2 - 0.5, width: 1, height: 2 }] });
    expect(r.ok).toBe(true);
    const info = openingsOfGroup(ctx, freeforms()[0].group)[0];
    // Scheitel des Bogens: |z| = 3, x = 3
    expect(info.center[0]).toBeCloseTo(3, 1);
    expect(Math.abs(info.center[2])).toBeCloseTo(3, 1);
    expect(Math.abs(info.u[0])).toBeCloseTo(1, 1);
  });

  it('lehnt Fehler ab', async () => {
    const { run, freeforms, counters } = setup();
    const many = Array.from({ length: FREEFORM_LIMITS.maxPoints + 1 }, (_, i) => ({ p: [i, 0] }));
    for (const input of [
      { path: many, height: 3 },
      { path: ARC, height: 3, thickness: -1 },
      { path: ARC, height: NaN },
      { path: [{ p: [0, 0] }], height: 3 },
      { path: [{ p: [0, 'x'] }, { p: [1, 0] }], height: 3 },
      { path: ARC, height: 3, openings: [{ at: 5.5, width: 2, height: 2 }] },
      { path: ARC, height: 3, openings: [{ at: 1, width: 1, height: 5 }] },
      { path: ARC, height: 3, closed: true },
    ]) {
      const r = await run('add_curved_wall', input);
      expect(r.ok, JSON.stringify(input).slice(0, 60)).toBe(false);
    }
    expect(freeforms()).toHaveLength(0);
    expect(counters.newEntities).toBe(0);
  });

  it('braucht Baurecht', async () => {
    const { run, freeforms } = setup(false);
    const r = await run('add_curved_wall', { path: ARC, height: 3 });
    expect(r.ok).toBe(false);
    expect(freeforms()).toHaveLength(0);
  });
});

describe('add_lathe', () => {
  it('legt einen Drehkörper an der Position an', async () => {
    const { run, freeforms, counters } = setup();
    const r = await run('add_lathe', { profile: [[0, 0], [1.5, 0], [1.5, 0.5], [1.7, 0.5]], ellipse: 1.5, sweep_degrees: 180, position: [2, 0.1, 3], name: 'Wanne', material: { color: '#ffffff' } });
    expect(r.ok).toBe(true);
    const e = freeforms()[0];
    expect(e.transform.pos).toEqual([2, 0.1, 3]);
    expect(e.name).toBe('Wanne');
    expect(e.material?.color).toBe('#ffffff');
    expect(e.state).toMatchObject({ kind: 'lathe', ellipse: 1.5, sweepDeg: 180 });
    expect(counters.newEntities).toBe(1);
  });
  it('lehnt zu viele Punkte, negative Radien und kaputte Zahlen ab', async () => {
    const { run, freeforms } = setup();
    const many = Array.from({ length: FREEFORM_LIMITS.maxPoints + 1 }, (_, i) => [1, i * 0.01]);
    expect((await run('add_lathe', { profile: many, position: [0, 0, 0] })).ok).toBe(false);
    expect((await run('add_lathe', { profile: [[-1, 0], [1, 1]], position: [0, 0, 0] })).ok).toBe(false);
    expect((await run('add_lathe', { profile: [[0, 0], [1, Infinity]], position: [0, 0, 0] })).ok).toBe(false);
    expect((await run('add_lathe', { profile: [[0, 0]], position: [0, 0, 0] })).ok).toBe(false);
    expect((await run('add_lathe', { profile: [[0, 0], [1, 1]] })).ok).toBe(false);
    expect(freeforms()).toHaveLength(0);
  });
});

describe('add_surface', () => {
  const grid = [[[0, 3, 0], [3, 3.8, 0], [6, 3, 0]], [[0, 3.4, 3], [3, 4.4, 3], [6, 3.4, 3]], [[0, 3, 6], [3, 3.8, 6], [6, 3, 6]]];
  it('legt eine Fläche an', async () => {
    const { run, freeforms } = setup();
    const r = await run('add_surface', { grid, degree: 2, thickness: 0.1, position: [1, 0, 1], name: 'Decke' });
    expect(r.ok).toBe(true);
    expect(freeforms()[0].state).toMatchObject({ kind: 'patch', degree: 2, thickness: 0.1 });
    expect(freeforms()[0].name).toBe('Decke');
  });
  it('lehnt unregelmäßige und zu große Gitter ab', async () => {
    const { run } = setup();
    expect((await run('add_surface', { grid: [grid[0], grid[1].slice(0, 2)], position: [0, 0, 0] })).ok).toBe(false);
    const big = Array.from({ length: FREEFORM_LIMITS.maxGrid + 1 }, () => grid[0]);
    expect((await run('add_surface', { grid: big, position: [0, 0, 0] })).ok).toBe(false);
    expect((await run('add_surface', { grid: [[[0, 0, 0]], [[0, 0, 0]]], position: [0, 0, 0] })).ok).toBe(false);
    expect((await run('add_surface', { grid, degree: 5, position: [0, 0, 0] })).ok).toBe(false);
  });
});

describe('add_wavy_wall', () => {
  it('legt eine Wellenwand mit wave an', async () => {
    const { run, freeforms } = setup();
    const r = await run('add_wavy_wall', { from: [0, 0], to: [8, 0], height: 3, amplitude: 0.4, wave_length: 2 });
    expect(r.ok).toBe(true);
    const e = freeforms()[0];
    expect(e.transform.pos).toEqual([4, 0, 0]);
    expect(e.state).toMatchObject({ kind: 'sweep', wave: { amplitude: 0.4, length: 2 }, thickness: 0.2 });
  });
  it('lehnt zu kurze Wand und fehlende Welle ab', async () => {
    const { run } = setup();
    expect((await run('add_wavy_wall', { from: [0, 0], to: [0.1, 0], height: 3, amplitude: 0.4, wave_length: 2 })).ok).toBe(false);
    expect((await run('add_wavy_wall', { from: [0, 0], to: [8, 0], height: 3, wave_length: 2 })).ok).toBe(false);
    expect((await run('add_wavy_wall', { from: [0, 0], to: [8, 0], height: 3, amplitude: 0.4, wave_length: 0 })).ok).toBe(false);
  });
});

describe('update_freeform', () => {
  it('führt Änderungen mit dem State zusammen', async () => {
    const { run, freeforms } = setup();
    await run('add_curved_wall', { path: ARC, height: 3 });
    const id = freeforms()[0].id;
    const r = await run('update_freeform', { id, changes: { height: 4.5 } });
    expect(r.ok).toBe(true);
    const state = freeforms()[0].state as { height: number; thickness: number; path: unknown[] };
    expect(state.height).toBe(4.5);
    expect(state.thickness).toBe(0.3);
    expect(state.path).toHaveLength(2);
  });
  it('wirkt bei Gruppen-ids nur auf Freiformen und meldet Fehler', async () => {
    const { run, freeforms, store } = setup();
    await run('add_curved_wall', { path: ARC, height: 3 });
    const group = freeforms()[0].group!;
    expect((await run('update_freeform', { id: group, changes: { height: 5 } })).ok).toBe(true);
    expect((freeforms()[0].state as { height: number }).height).toBe(5);
    expect((await run('update_freeform', { id: group, changes: { kind: 'lathe' } })).ok).toBe(false);
    expect((await run('update_freeform', { id: group, changes: {} })).ok).toBe(false);
    expect((await run('update_freeform', { id: 'gibt_es_nicht', changes: { height: 1 } })).ok).toBe(false);
    const box = await run('add_entity', { ref: 'EntitySpec.box', position: [0, 1, 0] });
    expect(box.ok).toBe(true);
    const boxId = store.getState().order.find((id) => store.getState().entities[id].ref === 'EntitySpec.box')!;
    expect((await run('update_freeform', { id: boxId, changes: { height: 1 } })).ok).toBe(false);
  });
  it('lehnt unbrauchbare Werte ab und lässt die Form unverändert', async () => {
    const { run, freeforms } = setup();
    await run('add_curved_wall', { path: ARC, height: 3 });
    const before = JSON.stringify(freeforms()[0].state);
    const r = await run('update_freeform', { id: freeforms()[0].id, changes: { path: 'kaputt' } });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(freeforms()[0].state)).toBe(before);
  });
  it('verwirft gespeicherte Öffnungen nach einer Formänderung', async () => {
    const { run, freeforms, ctx } = setup();
    await run('add_curved_wall', { path: ARC, height: 3, openings: [{ at: 1, width: 1, height: 2 }] });
    const e = freeforms()[0];
    expect(openingsOfGroup(ctx, e.group)).toHaveLength(1);
    const r = await run('update_freeform', { id: e.id, changes: { height: 4 } });
    expect(r.ok && r.content).toContain('Öffnungen sind verworfen');
    expect(openingsOfGroup(ctx, e.group)).toHaveLength(0);
  });
  it('braucht Baurecht', async () => {
    const { run, store, freeforms } = setup();
    await run('add_curved_wall', { path: ARC, height: 3 });
    store.getState().setCanBuild(false);
    expect((await run('update_freeform', { id: freeforms()[0].id, changes: { height: 4 } })).ok).toBe(false);
  });
});

describe('update_freeform: Schnitte verständlich', () => {
  const wallInput = { path: [{ p: [0, 0] }, { p: [6, 0] }], height: 3, name: 'Wand' };
  const idOf = (t: string) => /id="([^"]+)"/.exec(t)![1];

  it('ein Fehler nennt ALLE Probleme, die Eingabe und ein richtiges Beispiel', async () => {
    const { run } = setup();
    const id = idOf((await run('add_curved_wall', wallInput)).content);
    const r = await run('update_freeform', { id, changes: { cuts: [{ shape: 'kreis', position: 'mitte' }] } });
    expect(r.ok).toBe(false);
    expect(r.content).toContain('shape');
    expect(r.content).toContain('size');
    expect(r.content).toContain('pos');
    expect(r.content).toContain('Erhalten:');
    expect(r.content).toContain('"shape":"box"');
  });

  it('akzeptiert gängige Varianten (deutsche Formnamen, position, width/height/depth)', async () => {
    const { run, freeforms } = setup();
    const id = idOf((await run('add_curved_wall', wallInput)).content);
    const r = await run('update_freeform', { id, add_cuts: [{ shape: 'Quader', position: [1, 1, 0], size: { width: 1, height: 2, depth: 1 } }, { shape: 'zylinder', pos: [3, 1, 0], groesse: [0.5, 2, 0.5] }] });
    expect(r.ok).toBe(true);
    const cuts = (freeforms()[0].state as { cuts: { shape: string; size: number[] }[] }).cuts;
    expect(cuts.map((c) => c.shape)).toEqual(['box', 'cylinder']);
    expect(cuts[0].size).toEqual([1, 2, 1]);
  });

  it('add_cuts hängt an, changes.cuts ersetzt, Welt-Koordinaten werden umgerechnet', async () => {
    const { run, freeforms, store } = setup();
    const id = idOf((await run('add_curved_wall', { ...wallInput, openings: [{ at: 1, width: 1, height: 2 }] })).content);
    const before = (freeforms()[0].state as { cuts: unknown[] }).cuts.length;
    expect(before).toBe(1);
    await run('update_freeform', { id, add_cuts: [{ shape: 'box', pos: [3, 1, 0], size: [1, 1, 1] }] });
    expect((freeforms()[0].state as { cuts: unknown[] }).cuts).toHaveLength(2);
    // Weltkoordinaten: Fußpunkt der Wand liegt bei x = 3 (Mitte des Pfades), z = 0
    const pos = freeforms()[0].transform.pos;
    await run('update_freeform', { id, add_cuts: [{ shape: 'box', pos: [pos[0] + 1, 1.5, pos[2]], size: [1, 1, 1] }], cuts_in_world: true });
    const cuts = (freeforms()[0].state as { cuts: { pos: number[] }[] }).cuts;
    expect(cuts).toHaveLength(3);
    expect(cuts[2].pos[0]).toBeCloseTo(1, 2);
    expect(cuts[2].pos[2]).toBeCloseTo(0, 2);
    await run('update_freeform', { id, changes: { cuts: [{ shape: 'sphere', pos: [0, 1, 0], size: [1, 1, 1] }] } });
    expect((freeforms()[0].state as { cuts: unknown[] }).cuts).toHaveLength(1);
    expect((await run('update_freeform', { id })).content).toContain('nichts zu ändern');
    void store;
  });
});
