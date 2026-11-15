import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { applyMaterialSpec, createMainMaterial } from './materials';

function scene() {
  const engine = new NullEngine();
  return { engine, scene: new Scene(engine) };
}

describe('applyMaterialSpec', () => {
  it('Chrom: metallisch, glatt, starke Umgebung', () => {
    const { scene: s, engine } = scene();
    const m = createMainMaterial(s, 'm', { preset: 'chrom' }, { color: '#cccccc' });
    expect(m.metallic).toBe(1);
    expect(m.roughness).toBeCloseTo(0.05);
    expect(m.environmentIntensity).toBeGreaterThan(1.2);
    s.dispose();
    engine.dispose();
  });
  it('Lack: Klarlack; ausdrückliche Rauheit gewinnt', () => {
    const { scene: s, engine } = scene();
    const m = createMainMaterial(s, 'm', { preset: 'lack', roughness: 0.1 }, { color: '#cccccc' });
    expect(m.clearCoat.isEnabled).toBe(true);
    expect(m.roughness).toBeCloseTo(0.1);
    applyMaterialSpec(m, { color: '#ffffff' }, { color: '#cccccc' });
    expect(m.clearCoat.isEnabled).toBe(false);
    s.dispose();
    engine.dispose();
  });
  it('Glas: durchscheinend, Brechungsindex; Neon: Leuchtstärke skaliert', () => {
    const { scene: s, engine } = scene();
    const g = createMainMaterial(s, 'g', { preset: 'glas' }, { color: '#cccccc' });
    expect(g.alpha).toBeLessThan(0.4);
    expect(g.indexOfRefraction).toBeCloseTo(1.5);
    const n = createMainMaterial(s, 'n', { preset: 'neon' }, { color: '#cccccc' });
    expect(n.emissiveColor.g).toBeCloseTo(1.2);
    s.dispose();
    engine.dispose();
  });
  it('Spiegel-Rückgriff: mirror macht glatt und metallisch', () => {
    const { scene: s, engine } = scene();
    const m = createMainMaterial(s, 'm', { color: '#ff0000', mirror: true }, { color: '#cccccc' });
    expect(m.metallic).toBeGreaterThanOrEqual(0.9);
    expect(m.roughness).toBeLessThanOrEqual(0.05);
    s.dispose();
    engine.dispose();
  });
});
