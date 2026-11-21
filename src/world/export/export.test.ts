import { describe, expect, it } from 'vitest';
import { DEFAULT_ISLAND, type EntitySpec, type WorldSpec } from '../../../shared/types';
import { buildBlenderScript, skyColors } from './blenderScript';
import { entityExtras, exportGroups, exportLabel, selectExportEntities } from './gltf';
import { exportMaterialPlan } from './materialPlan';

const ent = (id: string, ref: string, extra: Partial<EntitySpec> = {}): EntitySpec => ({ id, ref, transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, ...extra });

describe('Material-Zuordnung für Blender', () => {
  it('Glas wird zu Transmission mit Alpha 1, Standard bleibt', () => {
    const glass = exportMaterialPlan({ preset: 'glas' });
    expect(glass.transmission).toBeGreaterThan(0.5);
    expect(glass.alpha).toBe(1);
    expect(glass.ior).toBeGreaterThanOrEqual(1);
    const plain = exportMaterialPlan({ color: '#ff0000', alpha: 0.5 });
    expect(plain).toMatchObject({ alpha: 0.5, transmission: 0, clearcoat: 0 });
    expect(exportMaterialPlan({ preset: 'lack' }).clearcoat).toBeGreaterThan(0);
    expect(exportMaterialPlan(undefined)).toMatchObject({ alpha: 1, transmission: 0 });
    expect(exportMaterialPlan({ glass: 1, ior: 9 }).ior).toBe(2.5);
  });
});

describe('Auswahl und Zusatzdaten', () => {
  it('Licht, Wasser und Startpunkt werden ausgelassen, Auswahl begrenzt', () => {
    const all = [ent('a', 'EntitySpec.box'), ent('b', 'EntitySpec.light'), ent('c', 'EntitySpec.water', { name: 'Teich' }), ent('d', 'EntitySpec.brick')];
    const r = selectExportEntities(all);
    expect(r.chosen.map((e) => e.id)).toEqual(['a', 'd']);
    expect(r.skipped.map((e) => e.id)).toEqual(['b', 'c']);
    expect(selectExportEntities(all, ['d', 'b']).chosen.map((e) => e.id)).toEqual(['d']);
  });
  it('Extras tragen Gruppe, Name und Typ', () => {
    expect(entityExtras(ent('x', 'EntitySpec.brick', { name: 'Wand 1', group: 'grp_1', groupName: 'Mauer', material: { preset: 'lack' } }))).toMatchObject({ cp_id: 'x', cp_ref: 'EntitySpec.brick', cp_name: 'Wand 1', cp_group: 'grp_1', cp_group_name: 'Mauer', cp_preset: 'lack' });
  });
});

describe('Namen und Gruppen im Export', () => {
  it('Objektname bzw. Art als Knotenname, Gruppen mit Namen', () => {
    const a = { id: 'e_1', ref: 'EntitySpec.box', name: 'Matratze', group: 'g1', groupName: 'Bett', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } } as never;
    const b = { id: 'e_2', ref: 'EntitySpec.bench', group: 'g1', groupName: 'Bett', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } } as never;
    expect(exportLabel(a)).toBe('Matratze');
    expect(exportLabel(b)).toBe('bench');
    const g = exportGroups([a, b]);
    expect(g.get('g1')).toEqual({ name: 'Bett', ids: ['e_1', 'e_2'] });
  });
});

describe('Blender-Skript', () => {
  const world = { version: 1, metadata: { name: 'Test Insel', id: 'w1' }, island: { ...DEFAULT_ISLAND, radius: 30, depth: 12 }, environment: { sky: { preset: 'clear' }, light: { intensity: 1.5, temperatureK: 6000, direction: { azimuth: 90, elevation: 30 } }, audio: { volume: 0.5 } }, entities: [] } as unknown as WorldSpec;
  it('enthält Dateiname, Sonnenrichtung (Blender-Achsen) und Inselmaße', () => {
    const py = buildBlenderScript({ glbFile: 'Test-Insel.glb', world });
    expect(py).toContain('GLB_NAME = "Test-Insel.glb"');
    expect(py).toContain('bpy.ops.import_scene.gltf');
    expect(py).toContain('ISLAND_RADIUS = 30');
    expect(py).toContain('ISLAND_DEPTH = 12');
    // Azimut 90 = +X, Elevation 30: Babylon (0.866, 0.5, 0) → Blender (−x, −z, y) = (−0.866, 0, 0.5)
    expect(py).toContain('SUN_DIRECTION = (-0.866, 0, 0.5)');
    expect(py).toContain('cp_group_name');
    expect(py.trim().endsWith('main()')).toBe(true);
    // Robuster Import: mehrere Aufrufarten, Hinweis zum manuellen Import, Erkennung schon importierter Objekte
    expect(py).toContain('def import_glb(path)');
    expect(py).toContain('"directory": folder + os.sep');
    expect(py).toContain('o.get("cp_id") is not None');
    expect(py).toContain('Importiere die Datei von Hand');
  });
  it('Dateinamen mit Anführungszeichen brechen das Skript nicht', () => {
    const py = buildBlenderScript({ glbFile: 'a"b.glb', world });
    expect(py).toContain('GLB_NAME = "a\\"b.glb"');
  });
  it('Himmelsfarben je Voreinstellung', () => {
    const c = skyColors(world);
    expect(c.top[2]).toBeGreaterThan(c.top[0]);
  });
});
