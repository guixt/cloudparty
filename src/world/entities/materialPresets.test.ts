import { describe, expect, it } from 'vitest';
import { MATERIAL_PRESETS, type MaterialSpec } from '../../../shared/types';
import { createDefaultWorld } from '../../../shared/defaultWorld';
import { validateWorldSpec } from '../../../shared/worldspec';
import { PATTERN_LABELS, PRESET_LABELS, PRESET_VALUES, presetMaterial, resolveMaterial } from './materialPresets';
import { defaultPatternColor, heightToNormals, patternKey } from './patterns';
import { textureSignature } from './materials';

const world = (material: MaterialSpec) => {
  const w = createDefaultWorld();
  w.entities = [{ id: 'a', ref: 'EntitySpec.box', transform: { pos: [0, 0.5, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, material }];
  return w;
};

describe('Material-Voreinstellungen', () => {
  it('jede Voreinstellung hat Werte und Namen', () => {
    for (const p of MATERIAL_PRESETS) {
      expect(PRESET_VALUES[p]).toBeTruthy();
      expect(PRESET_LABELS[p]).toBeTruthy();
    }
  });
  it('Welt-Validierung akzeptiert alle Voreinstellungen (Werte und konkrete Form)', () => {
    for (const p of MATERIAL_PRESETS) {
      expect(validateWorldSpec(world(PRESET_VALUES[p])).ok, p).toBe(true);
      expect(validateWorldSpec(world(presetMaterial(p))).ok, p).toBe(true);
      expect(validateWorldSpec(world({ preset: p })).ok, p).toBe(true);
    }
  });
  it('Muster haben Namen', () => {
    expect(Object.keys(PATTERN_LABELS)).toHaveLength(7);
  });
  it('resolveMaterial: Voreinstellung liefert Vorgaben, ausdrückliche Felder gewinnen', () => {
    const r = resolveMaterial({ preset: 'gold', roughness: 0.6 });
    expect(r.metallic).toBe(1);
    expect(r.roughness).toBe(0.6);
    expect(r.color).toBe('#d4af37');
    expect(resolveMaterial(undefined)).toEqual({});
    expect(resolveMaterial({ color: '#112233' })).toEqual({ color: '#112233' });
  });
  it('presetMaterial behält preset und mirror', () => {
    const m = presetMaterial('chrom', { mirror: true });
    expect(m.preset).toBe('chrom');
    expect(m.mirror).toBe(true);
    expect(presetMaterial('chrom').mirror).toBeUndefined();
  });
  it('Neon leuchtet stärker als 1, Glas hat ior', () => {
    expect(PRESET_VALUES.neon.emissiveIntensity).toBeGreaterThan(1);
    expect(PRESET_VALUES.glas.ior).toBe(1.5);
  });
});

describe('Muster-Hilfen', () => {
  it('Cache-Schlüssel unterscheidet Muster, Farben, Größe, Normalen und Wiederholung', () => {
    const base = patternKey('karo', '#ffffff', '#000000');
    expect(patternKey('karo', '#FFFFFF', '#000000')).toBe(base);
    expect(patternKey('streifen', '#ffffff', '#000000')).not.toBe(base);
    expect(patternKey('karo', '#ffffff', '#111111')).not.toBe(base);
    expect(patternKey('karo', '#ffffff', '#000000', 128)).not.toBe(base);
    expect(patternKey('karo', '#ffffff', '#000000', 256, true)).not.toBe(base);
    expect(patternKey('karo', '#ffffff', '#000000', 256, false, 4)).not.toBe(base);
  });
  it('Texturunterschrift ändert sich nur bei relevanten Feldern', () => {
    const a = textureSignature({ pattern: 'karo', color: '#ff0000' });
    expect(textureSignature({ pattern: 'karo', color: '#ff0000', metallic: 1 })).toBe(a);
    expect(textureSignature({ pattern: 'karo', color: '#00ff00' })).not.toBe(a);
    expect(textureSignature({ pattern: 'karo', color: '#ff0000', uvScale: 3 })).not.toBe(a);
    expect(textureSignature({})).toBe('');
    expect(textureSignature({ pattern: 'none' })).toBe('');
  });
  it('defaultPatternColor dunkelt ab', () => {
    expect(defaultPatternColor('#ffffff')).toBe('#737373');
    expect(defaultPatternColor('xx')).toBe('#444444');
  });
  it('heightToNormals: flache Fläche ergibt senkrechte Normalen', () => {
    const size = 4;
    const src = new Uint8ClampedArray(size * size * 4).fill(128);
    const dst = new Uint8ClampedArray(size * size * 4);
    heightToNormals(src, dst, size);
    expect([dst[0], dst[1], dst[3]]).toEqual([128, 128, 255]);
    expect(dst[2]).toBeGreaterThan(250);
  });
});
