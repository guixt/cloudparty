import { describe, expect, it } from 'vitest';
import { AI_LIMITS } from '../../../shared/aiTools';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { frontDirection } from '../../../shared/front';
import { executeTool, type RunCounters, type ToolContext } from './tools';

function setup(canBuild = true) {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().setCanBuild(canBuild);
  const ctx: ToolContext = { store, bus, getAvatar: () => ({ position: [0, 0, 6], yaw: 0 }), confirm: async () => true };
  const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  const run = (name: string, input: unknown) => executeTool(name, input, ctx, counters);
  const all = () => {
    const s = store.getState();
    return s.order.map((id) => s.entities[id]);
  };
  return { store, ctx, counters, run, all, base: store.getState().order.length };
}

describe('add_wall', () => {
  it('legt eine Wand mit Tür als Gruppe an, ein Aufruf', async () => {
    const t = setup();
    const r = await t.run('add_wall', { from: [0, 0], to: [8, 0], height: 3, thickness: 0.3, openings: [{ at: 3, width: 2, height: 2.2 }], material: { color: '#c0a080' }, name: 'Südwand' });
    expect(r.ok).toBe(true);
    const parts = t.all().filter((e) => e.groupName === 'Südwand');
    expect(parts).toHaveLength(3);
    expect(new Set(parts.map((p) => p.group)).size).toBe(1);
    expect(parts.every((p) => p.physics?.mode === 'static' && p.material?.color === '#c0a080')).toBe(true);
    expect(t.counters.newEntities).toBe(3);
  });

  it('prüft Eingaben und Limits', async () => {
    const t = setup();
    expect((await t.run('add_wall', { from: [0, 0], to: [0.01, 0], height: 3 })).ok).toBe(false);
    expect((await t.run('add_wall', { from: [0, 0], to: [8, 0], height: 3, openings: [{ at: 7, width: 3, height: 2 }] })).content).toContain('nicht auf der Wand');
    expect((await t.run('add_wall', { from: [0], to: [8, 0], height: 3 })).ok).toBe(false);
    expect((await t.run('add_wall', { from: [0, 0], to: [900, 0], height: 3 })).ok).toBe(false);
    t.counters.newEntities = AI_LIMITS.maxNewEntities - 1;
    const over = await t.run('add_wall', { from: [0, 0], to: [8, 0], height: 3, openings: [{ at: 3, width: 2, height: 2 }] });
    expect(over.ok).toBe(false);
    expect(over.content).toContain('Limit');
    expect(t.all()).toHaveLength(t.base);
  });

  it('ohne Baurecht wird nichts angelegt', async () => {
    const t = setup(false);
    expect((await t.run('add_wall', { from: [0, 0], to: [8, 0], height: 3 })).ok).toBe(false);
    expect(t.all()).toHaveLength(t.base);
  });
});

describe('add_beam', () => {
  it('Balken zwischen zwei Punkten', async () => {
    const t = setup();
    const r = await t.run('add_beam', { from: [0, 0, 0], to: [0, 4, 0], thickness: 0.2 });
    expect(r.ok).toBe(true);
    const beam = t.all().at(-1)!;
    expect(beam.ref).toBe('EntitySpec.cylinder');
    expect(beam.transform.pos).toEqual([0, 2, 0]);
    expect(beam.transform.scale).toEqual([0.2, 4, 0.2]);
    expect((await t.run('add_beam', { from: [0, 0, 0], to: [0, 0.01, 0], thickness: 0.2 })).ok).toBe(false);
    expect((await t.run('add_beam', { from: [0, 0, 0], to: [0, 100, 0], thickness: 0.2 })).ok).toBe(false);
    expect((await t.run('add_beam', { from: [0, 0, 0], to: [1, 1, 1], thickness: 0.2, shape: 'kugel' })).ok).toBe(false);
  });
});

describe('array', () => {
  it('Zinnen im Kreis, gruppiert, mit gemeinsamer Größe', async () => {
    const t = setup();
    const r = await t.run('array', { ref: 'EntitySpec.box', pattern: 'circle', count: 12, radius: 6, center: [0, 4, 0], face_center: true, scale: [1, 1, 0.5], name: 'Zinne', material: { color: '#999999' } });
    expect(r.ok).toBe(true);
    const parts = t.all().filter((e) => e.groupName === 'Zinne');
    expect(parts).toHaveLength(12);
    expect(parts.every((p) => p.transform.scale[2] === 0.5 && Math.abs(Math.hypot(p.transform.pos[0], p.transform.pos[2]) - 6) < 1e-6)).toBe(true);
    expect(t.counters.newEntities).toBe(12);
  });

  it('Linie, Raster und Fehler', async () => {
    const t = setup();
    expect((await t.run('array', { ref: 'EntitySpec.cylinder', pattern: 'line', count: 5, start: [0, 1, 0], step: [2, 0, 0] })).ok).toBe(true);
    expect((await t.run('array', { ref: 'EntitySpec.box', pattern: 'grid', rows: 3, cols: 4, spacing: [2, 2], origin: [0, 0.5, 10] })).ok).toBe(true);
    expect(t.all()).toHaveLength(t.base + 5 + 12);
    expect((await t.run('array', { ref: 'EntitySpec.nix', pattern: 'line', count: 2, start: [0, 0, 0], step: [1, 0, 0] })).ok).toBe(false);
    expect((await t.run('array', { ref: 'EntitySpec.box', pattern: 'kreis' })).ok).toBe(false);
    expect((await t.run('array', { ref: 'EntitySpec.box', pattern: 'grid', rows: 50, cols: 50, spacing: [1, 1], origin: [0, 0, 0] })).ok).toBe(false);
    expect((await t.run('array', { ref: 'EntitySpec.box', pattern: 'line', count: 2, start: [0, 0, 0] })).ok).toBe(false);
  });
});

describe('clone_group', () => {
  async function tower(t: ReturnType<typeof setup>) {
    // Zwei Wände mit Tür = zwei Gruppen; die zweite Gruppe (Seitenwand mit Tür) hat 3 Teile.
    await t.run('add_wall', { from: [4, 0], to: [4, 8], height: 3, name: 'Turm', openings: [{ at: 3, width: 2, height: 2 }] });
    return t.all().find((e) => e.groupName === 'Turm')!;
  }

  it('kopiert die ganze Gruppe mit Offset als neue Gruppe', async () => {
    const t = setup();
    await t.run('add_wall', { from: [0, 0], to: [4, 0], height: 3, openings: [{ at: 1, width: 1, height: 2 }], name: 'Wand' });
    const src = t.all().find((e) => e.groupName === 'Wand')!;
    const before = t.all().length;
    const r = await t.run('clone_group', { id: src.id, offset: [10, 0, 0] });
    expect(r.ok).toBe(true);
    const added = t.all().slice(before);
    expect(added).toHaveLength(3);
    expect(new Set(added.map((e) => e.group)).size).toBe(1);
    expect(added[0].group).not.toBe(src.group);
    expect(added.map((e) => e.transform.pos[0]).sort()).toEqual(t.all().filter((e) => e.group === src.group).map((e) => e.transform.pos[0] + 10).sort());
    expect(added.every((e) => !t.all().some((o) => o.id === e.id && o.group === src.group))).toBe(true);
  });

  it('Drehen, Spiegeln, mehrere Kopien, Fehler', async () => {
    const t = setup();
    const src = await tower(t);
    const before = t.all().length;
    expect((await t.run('clone_group', { id: src.id })).ok).toBe(false); // nichts angegeben
    expect((await t.run('clone_group', { id: src.id, mirror: 'y' })).ok).toBe(false);
    expect((await t.run('clone_group', { id: 'nix', offset: [1, 0, 0] })).ok).toBe(false);
    expect((await t.run('clone_group', { id: src.id, rotate_y_degrees: 90, pivot: [0, 0], count: 3 })).ok).toBe(true);
    expect(t.all().length - before).toBe(9); // 3 Kopien × 3 Teile
    expect((await t.run('clone_group', { id: src.id, mirror: 'x', pivot: [0, 0] })).ok).toBe(true);
    const mirrored = t.all().slice(-3);
    expect(mirrored.every((e) => e.transform.pos[0] <= 0)).toBe(true);
  });

  it('beachtet das Objektlimit', async () => {
    const t = setup();
    const src = await tower(t);
    t.counters.newEntities = AI_LIMITS.maxNewEntities - 2; // die Gruppe hat 3 Teile
    const r = await t.run('clone_group', { id: src.id, offset: [5, 0, 0] });
    expect(r.ok).toBe(false);
    expect(r.content).toContain('Limit');
  });
});

describe('get_bounds und surface_height_at', () => {
  it('Maße eines Würfels und einer Gruppe', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [2, 1.5, 3], scale: [2, 3, 4], name: 'Klotz' });
    const box = t.all().find((e) => e.name === 'Klotz')!;
    const r = await t.run('get_bounds', { id: box.id });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('"min":[1,0,1]');
    expect(r.content).toContain('"max":[3,3,5]');
    expect(r.content).toContain('"groesse":[2,3,4]');
    expect(r.content).toContain('welt_daten');
    await t.run('add_wall', { from: [0, 0], to: [4, 0], height: 3, thickness: 0.4, name: 'Wand' });
    const wall = t.all().find((e) => e.groupName === 'Wand')!;
    const g = await t.run('get_bounds', { id: wall.id });
    expect(g.content).toContain('"max":[4,3,0.2]');
    expect((await t.run('get_bounds', { id: 'nix' })).ok).toBe(false);
  });

  it('Höhe: Boden, auf einem Klotz, außerhalb der Insel', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [20, 1.5, 20], scale: [4, 3, 4] });
    const ground = await t.run('surface_height_at', { x: 0, z: 30 });
    expect(ground.content).toContain('"hoehe":0');
    expect(ground.content).toContain('"aufDerInsel":true');
    const on = await t.run('surface_height_at', { x: 21, z: 21 });
    expect(on.content).toContain('"hoehe":3');
    const off = await t.run('surface_height_at', { x: 100, z: 0 });
    expect(off.content).toContain('"aufDerInsel":false');
    expect((await t.run('surface_height_at', { x: 'a', z: 0 })).ok).toBe(false);
  });

  it('Lesewerkzeuge gehen auch ohne Baurecht', async () => {
    const t = setup(false);
    expect((await t.run('surface_height_at', { x: 0, z: 0 })).ok).toBe(true);
  });
});

describe('Gruppen-ids', () => {
  it('get_bounds und clone_group akzeptieren die group-id aus dem Ergebnis von add_wall', async () => {
    const t = setup();
    const r = await t.run('add_wall', { from: [0, 0], to: [4, 0], height: 3, name: 'W' });
    const group = /group="(grp_[^"]+)"/.exec(r.content)![1];
    const b = await t.run('get_bounds', { id: group });
    expect(b.ok).toBe(true);
    expect((await t.run('clone_group', { id: group, offset: [0, 0, 5] })).ok).toBe(true);
    // update_entity mit Gruppen-id: verständliche Meldung statt „nicht gefunden“
    const bad = await t.run('update_entity', { id: group, position: [0, 0, 0] });
    expect(bad.ok).toBe(false);
    expect(bad.content).toContain('Gruppen-id');
  });
});

describe('Gruppen entfernen, ändern, Weltübersicht', () => {
  async function wall(t: ReturnType<typeof setup>) {
    const r = await t.run('add_wall', { from: [0, 0], to: [8, 0], height: 3, openings: [{ at: 3, width: 2, height: 2 }, { at: 6, width: 1, height: 1, sill: 1 }], name: 'W' });
    return /group="(grp_[^"]+)"/.exec(r.content)![1];
  }

  it('Ergebnis nennt Maße', async () => {
    const t = setup();
    const r = await t.run('add_wall', { from: [0, 0], to: [8, 0], height: 3, name: 'W' });
    expect(r.content).toContain('Maße: min');
  });

  it('remove_entity mit Gruppen-id entfernt alle Mitglieder als eine Aktion', async () => {
    const t = setup();
    const g = await wall(t);
    const before = t.all().length;
    const n = t.all().filter((e) => e.group === g).length;
    expect(n).toBeGreaterThan(2);
    const r = await t.run('remove_entity', { id: g });
    expect(r.ok).toBe(true);
    expect(t.all().length).toBe(before - n);
    expect(t.counters.removals).toBe(1);
  });

  it('update_entity mit Gruppen-id: Material und move_by für alle, absolute Position abgelehnt', async () => {
    const t = setup();
    const g = await wall(t);
    const y0 = t.all().filter((e) => e.group === g).map((e) => e.transform.pos[2]);
    expect((await t.run('update_entity', { id: g, material: { color: '#112233' }, move_by: [0, 0, 2] })).ok).toBe(true);
    const parts = t.all().filter((e) => e.group === g);
    expect(parts.every((e) => e.material?.color === '#112233')).toBe(true);
    expect(parts.map((e) => e.transform.pos[2])).toEqual(y0.map((z) => z + 2));
    const bad = await t.run('update_entity', { id: g, position: [0, 0, 0] });
    expect(bad.ok).toBe(false);
    expect(bad.content).toContain('move_by');
  });

  it('get_world fasst Gruppen zusammen und filtert', async () => {
    const t = setup();
    const g = await wall(t);
    const w = JSON.parse(/<welt_daten>\n([\s\S]*)\n<\/welt_daten>/.exec((await t.run('get_world', {})).content)![1]);
    const row = w.objekte.find((o: { gruppe?: string }) => o.gruppe === g);
    expect(row.anzahl).toBeGreaterThan(2);
    expect(w.objekte.filter((o: { gruppe?: string }) => o.gruppe === g)).toHaveLength(1);
    const detail = JSON.parse(/<welt_daten>\n([\s\S]*)\n<\/welt_daten>/.exec((await t.run('get_world', { group: g })).content)![1]);
    expect(detail.objekte).toHaveLength(row.anzahl);
  });
});

describe('Namen als Ziel', () => {
  it('get_bounds und look-Auflösung akzeptieren eindeutige Namen, mehrdeutige werden gemeldet', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [0, 0.5, 0], name: 'Kiste Alpha' });
    expect((await t.run('get_bounds', { id: 'kiste alpha' })).ok).toBe(true);
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [3, 0.5, 0], name: 'Doppelt' });
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [6, 0.5, 0], name: 'Doppelt' });
    const r = await t.run('get_bounds', { id: 'Doppelt' });
    expect(r.ok).toBe(false);
    expect(r.content).toContain('nicht eindeutig');
    const w = await t.run('add_wall', { from: [0, 5], to: [4, 5], height: 2, name: 'Mauer Nord' });
    expect(w.ok).toBe(true);
    expect((await t.run('get_bounds', { id: 'Mauer Nord' })).ok).toBe(true);
  });
  it('group_entities und library_save nehmen Gruppen-ids', async () => {
    const t = setup();
    const w = await t.run('add_wall', { from: [0, 5], to: [4, 5], height: 2, name: 'Q', openings: [{ at: 1, width: 1, height: 1 }] });
    const g = /group="(grp_[^"]+)"/.exec(w.content)![1];
    const b = await t.run('add_entity', { ref: 'EntitySpec.box', position: [9, 0.5, 9] });
    const bid = /id="([^"]+)"/.exec(b.content)![1];
    const r = await t.run('group_entities', { ids: [g, bid], name: 'Alles' });
    expect(r.ok).toBe(true);
    const members = t.all().filter((e) => e.groupName === 'Alles');
    expect(members.length).toBeGreaterThan(3);
  });
});

describe('Material-Voreinstellung und get_world-Details', () => {
  it('preset gold ohne eigene Farbe: Standardfarbe der Kugel entfällt', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.sphere', position: [0, 0.5, 0], material: { preset: 'gold' }, name: 'Goldkugel' });
    const e = t.all().find((x) => x.name === 'Goldkugel')!;
    expect(e.material?.preset).toBe('gold');
    expect(e.material?.color).toBeUndefined();
    await t.run('add_entity', { ref: 'EntitySpec.sphere', position: [3, 0.5, 0], material: { preset: 'lack', color: '#3366ff' }, name: 'Blau' });
    expect(t.all().find((x) => x.name === 'Blau')!.material?.color).toBe('#3366ff');
  });
  it('get_world zeigt Materialwerte, Folien und Gruppennamen-Filter', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [0, 0.5, 0], name: 'M', material: { metallic: 0.7, roughness: 0.2, uv_scale: 4, pattern: 'karo' } });
    const id = t.all().find((x) => x.name === 'M')!.id;
    t.store.getState().updateEntity(id, { media: { kind: 'slides', urls: ['data:image/png;base64,AA', 'data:image/png;base64,BB'], slide: 1 } }, { source: 'local' });
    const w = JSON.parse(/<welt_daten>\n([\s\S]*)\n<\/welt_daten>/.exec((await t.run('get_world', { name_contains: 'M' })).content)![1]);
    const row = w.objekte.find((o: { id: string }) => o.id === id);
    expect(row.material_werte).toMatchObject({ metallic: 0.7, roughness: 0.2, uvScale: 4 });
    expect(row.medien_details).toEqual({ folien: 2, aktuelle_folie: 1 });
    const wall = await t.run('add_wall', { from: [0, 5], to: [6, 5], height: 3, name: 'Gartenmauer', openings: [{ at: 2, width: 1, height: 2 }] });
    expect(wall.ok).toBe(true);
    const byName = JSON.parse(/<welt_daten>\n([\s\S]*)\n<\/welt_daten>/.exec((await t.run('get_world', { group: 'gartenmauer' })).content)![1]);
    expect(byName.objekte.length).toBeGreaterThan(2);
  });
});


describe('face_toward und Blickrichtung', () => {
  const front = (rot: readonly number[]) => frontDirection(rot);
  it('Tafel schaut nach dem Anlegen zum Zielpunkt; get_world nennt die Blickrichtung', async () => {
    const t = setup();
    const r = await t.run('add_entity', { ref: 'EntitySpec.media-image', position: [10, 0, 0], face_toward: [0, 0], name: 'Bildtafel' });
    expect(r.ok).toBe(true);
    const e = t.all().find((x) => x.name === 'Bildtafel')!;
    const d = front(e.transform.rot);
    expect(d[0]).toBeCloseTo(-1, 3); // von x = 10 zur Mitte: nach −x
    expect(Math.abs(d[2])).toBeLessThan(0.001);
    const w = JSON.parse(/<welt_daten>\n([\s\S]*)\n<\/welt_daten>/.exec((await t.run('get_world', { name_contains: 'Bildtafel' })).content)![1]);
    const row = w.objekte.find((o: { name: string }) => o.name === 'Bildtafel');
    expect(row.vorderseite).toContain('−x');
    expect(row.vorderseite_zur_inselmitte).toBe(true);
  });
  it('update_entity dreht nachträglich; face_toward mit Position [x, y, z]; ungültig wird abgelehnt', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.media-text', position: [0, 0, 8], name: 'Schild' });
    const id = t.all().find((x) => x.name === 'Schild')!.id;
    expect((await t.run('update_entity', { id, face_toward: [0, 1.5, 20] })).ok).toBe(true);
    expect(front(t.store.getState().entities[id].transform.rot)[2]).toBeCloseTo(1, 3); // zu +z
    expect((await t.run('update_entity', { id, face_toward: [0, 0, 0] })).ok).toBe(true);
    expect(front(t.store.getState().entities[id].transform.rot)[2]).toBeCloseTo(-1, 3); // zurück zur Mitte (−z)
    expect((await t.run('update_entity', { id, face_toward: 'mitte' })).ok).toBe(false);
  });
});

describe('Überschneidungsmeldung nach dem Bauen', () => {
  it('add_entity meldet ein Objekt, das in ein anderes ragt, und ein Teil unter dem Boden', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [20, 0.5, 20], name: 'Kasten' });
    const r = await t.run('add_entity', { ref: 'EntitySpec.box', position: [20.4, 0.5, 20], name: 'Nachbar' });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('ACHTUNG – Überschneidungen');
    expect(r.content).toContain('Kasten');
    expect(r.summary).toContain('Überschneidung');
    const low = await t.run('add_entity', { ref: 'EntitySpec.box', position: [30, 0, 30], name: 'Halbversunken' });
    expect(low.content).toContain('unter der Inseloberfläche');
    const fine = await t.run('add_entity', { ref: 'EntitySpec.box', position: [40, 0.5, 40], name: 'Frei' });
    expect(fine.content).not.toContain('ACHTUNG');
  });

  it('Verschieben auf ein anderes Objekt wird gemeldet; check_overlaps findet es in der Welt', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [50, 0.5, 50], name: 'A' });
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [55, 0.5, 50], name: 'B' });
    const moved = await t.run('update_entity', { id: 'B', position: [50.3, 0.5, 50] });
    expect(moved.content).toContain('ACHTUNG');
    const all = await t.run('check_overlaps', {});
    expect(all.content).toContain('„A“');
    const none = await t.run('check_overlaps', { id: 'A' });
    expect(none.content).toContain('„B“');
    await t.run('update_entity', { id: 'B', position: [55, 0.5, 50] });
    expect((await t.run('check_overlaps', { id: 'A' })).content).toContain('Keine Überschneidungen');
  });

  it('exakt gemauerte Klemmbaustein-Wände melden nichts', async () => {
    const t = setup();
    const r = await t.run('fill_bricks', { mode: 'wall', x: 100, z: 100, cols: 8, rows: 6, layers: 3 });
    expect(r.content).not.toContain('ACHTUNG');
    const b = await t.run('add_bricks', { bricks: [{ x: 200, z: 200, w: 2, d: 4 }, { x: 200, z: 200, w: 2, d: 2 }] });
    expect(b.content).not.toContain('ACHTUNG');
  });
});
