import { describe, expect, it, vi } from 'vitest';
import { QUALITY_LEVELS, QUALITY_OVERRIDES_KEY, QUALITY_PRESETS, createQualityController } from './quality';

describe('Qualitätsstufen', () => {
  it('jede Stufe hat alle Merkmale, und höhere Stufen sind nie schlechter', () => {
    const keys = Object.keys(QUALITY_PRESETS.high) as (keyof typeof QUALITY_PRESETS.high)[];
    for (const level of QUALITY_LEVELS) expect(Object.keys(QUALITY_PRESETS[level]).sort()).toEqual([...keys].sort());
    const numeric = ['shadowMapSize', 'probeSize', 'mirrorSize', 'waterReflectionSize', 'grassDensity', 'particleScale', 'maxPointLights'] as const;
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      const lo = QUALITY_PRESETS[QUALITY_LEVELS[i - 1]];
      const hi = QUALITY_PRESETS[QUALITY_LEVELS[i]];
      for (const key of numeric) expect(hi[key]).toBeGreaterThanOrEqual(lo[key]);
      expect(hi.hardwareScaling).toBeLessThanOrEqual(lo.hardwareScaling);
    }
  });

  it('Controller meldet Änderungen und merkt sich manuelle Wahl', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    const q = createQualityController();
    expect(q.get()).toBe('high');
    expect(q.isAuto()).toBe(true);
    const seen: string[] = [];
    q.onChange((l) => seen.push(l));
    q.set('low');
    q.set('low');
    q.set('ultra', { manual: true });
    expect(seen).toEqual(['low', 'ultra']);
    expect(q.isAuto()).toBe(false);
    expect(createQualityController().get()).toBe('ultra');
    expect(createQualityController().isAuto()).toBe(false);
    q.setAuto();
    expect(q.isAuto()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('Overrides: mischen, melden, speichern, prüfen', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    const q = createQualityController('medium');
    const seen: [string, number, boolean][] = [];
    q.onChange((l, f) => seen.push([l, f.grassDensity, f.ssao]));
    q.setOverrides({ ssao: true, grassDensity: 5 }); // 5 wird auf 1 begrenzt
    expect(q.features().ssao).toBe(true);
    expect(q.features().grassDensity).toBe(1);
    expect(q.features().bloom).toBe(QUALITY_PRESETS.medium.bloom);
    expect(seen).toEqual([['medium', 1, true]]);
    q.setOverrides({ ssao: true });
    expect(seen.length).toBe(1);
    q.set('low');
    expect(q.features().ssao).toBe(true);
    expect(JSON.parse(store.get(QUALITY_OVERRIDES_KEY)!)).toEqual({ ssao: true, grassDensity: 1 });
    q.setOverrides({ ssao: undefined });
    expect(q.getOverrides()).toEqual({ grassDensity: 1 });
    q.setOverrides({ bogus: 1, bloom: 'ja' } as never);
    expect(q.getOverrides()).toEqual({ grassDensity: 1 });
    expect(createQualityController('low').features().grassDensity).toBe(1);
    q.setOverrides(null);
    expect(q.getOverrides()).toEqual({});
    expect(store.has(QUALITY_OVERRIDES_KEY)).toBe(false);
    expect(q.features()).toEqual(QUALITY_PRESETS.low);
    vi.unstubAllGlobals();
  });

  it('ungültig gespeicherte Overrides werden beim Laden verworfen', () => {
    const store = new Map<string, string>([[QUALITY_OVERRIDES_KEY, JSON.stringify({ shadowMapSize: 1e9, ssao: 'x', fxaa: false, grassDensity: 0.5, evil: true })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    expect(createQualityController('high').getOverrides()).toEqual({ fxaa: false, grassDensity: 0.5 });
    store.set(QUALITY_OVERRIDES_KEY, '{kaputt');
    expect(createQualityController('high').getOverrides()).toEqual({});
    vi.unstubAllGlobals();
  });
});
