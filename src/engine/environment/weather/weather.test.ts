import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS } from '../../quality';
import { FOG_MULTIPLIER, approach, fireflyShare, fogFactor, nightness, normalizeWeather, particleBrightness, weatherOptions } from './options';

describe('Wetter-Tabellen', () => {
  it('skaliert Partikel mit der Qualität', () => {
    for (const kind of ['rain', 'snow', 'fireflies'] as const) {
      const low = weatherOptions(kind, QUALITY_PRESETS.low.particleScale)!;
      const high = weatherOptions(kind, QUALITY_PRESETS.ultra.particleScale)!;
      expect(low.capacity).toBeLessThan(high.capacity);
      expect(low.emitRate).toBeLessThan(high.emitRate);
      expect(high.emitRate * high.maxLife).toBeGreaterThan(high.capacity * 0.8);
    }
    expect(weatherOptions('rain', 0)).toBeNull();
    expect(weatherOptions('fog', 1)).toBeNull();
    expect(weatherOptions('none', 1)).toBeNull();
  });
  it('normalisiert Eingaben', () => {
    expect(normalizeWeather(undefined)).toBe('none');
    expect(normalizeWeather('hagel')).toBe('none');
    expect(normalizeWeather('snow')).toBe('snow');
  });
  it('Nebelfaktor und Überblendung', () => {
    expect(fogFactor([])).toBe(1);
    expect(fogFactor([{ kind: 'fog', fade: 1 }])).toBe(FOG_MULTIPLIER.fog);
    expect(fogFactor([{ kind: 'fog', fade: 0.5 }])).toBeCloseTo(1 + (FOG_MULTIPLIER.fog - 1) / 2);
    expect(approach(0, 1, 1, 2)).toBeCloseTo(0.5);
    expect(approach(0.9, 1, 5, 2)).toBe(1);
    expect(approach(0.1, 0, 5, 2)).toBe(0);
  });
  it('Helligkeit und Nacht', () => {
    expect(particleBrightness(0.5, 0.5, 0.5)).toBe(1);
    expect(particleBrightness(0, 0.01, 0.05)).toBeLessThan(0.6);
    expect(nightness(60, 0.5)).toBe(0);
    expect(nightness(-20, 0.01)).toBe(1);
    expect(fireflyShare(0)).toBeGreaterThan(0);
    expect(fireflyShare(1)).toBe(1);
  });
});
