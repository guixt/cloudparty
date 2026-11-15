import { describe, expect, it, vi } from 'vitest';
import { QUALITY_LEVELS, QUALITY_PRESETS, createQualityController } from './quality';

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
});
