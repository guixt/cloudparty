import { describe, expect, it } from 'vitest';
import { customSkyLook, DEFAULT_LIGHT_DIRECTION, kelvinToRgb, parseLightDirection, resolveSkyLook, SKY_PRESETS, sunIntensityFrom, sunVector } from './presets';

describe('Lichtrichtung', () => {
  it('liest Objekt und Text', () => {
    expect(parseLightDirection({ azimuth: 10, elevation: 30 })).toEqual({ azimuth: 10, elevation: 30 });
    expect(parseLightDirection('370, 45')).toEqual({ azimuth: 10, elevation: 45 });
    expect(parseLightDirection('90 20')).toEqual({ azimuth: 90, elevation: 20 });
  });
  it('fällt bei Unsinn auf den Standard zurück', () => {
    expect(parseLightDirection('abc')).toEqual(DEFAULT_LIGHT_DIRECTION);
    expect(parseLightDirection(undefined)).toEqual(DEFAULT_LIGHT_DIRECTION);
  });
  it('liefert Einheitsvektoren', () => {
    const v = sunVector({ azimuth: 40, elevation: 50 });
    expect(Math.hypot(...v)).toBeCloseTo(1, 9);
    expect(sunVector({ azimuth: 0, elevation: 90 })[1]).toBeCloseTo(1, 9);
    expect(sunVector({ azimuth: 90, elevation: 0 })[0]).toBeCloseTo(1, 9);
  });
});

describe('Farbtemperatur und Intensität', () => {
  it('warm ist rötlicher, kalt bläulicher', () => {
    const warm = kelvinToRgb(3000);
    const cold = kelvinToRgb(10000);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cold[2]).toBeGreaterThan(cold[0]);
    expect(kelvinToRgb(6600).every((c) => c > 0.95)).toBe(true);
  });
  it('bildet 3 auf einen hellen Tag ab und klemmt', () => {
    expect(sunIntensityFrom(3)).toBeGreaterThan(0.9);
    expect(sunIntensityFrom(3)).toBeLessThan(2.2);
    expect(sunIntensityFrom(100)).toBe(sunIntensityFrom(10));
    expect(sunIntensityFrom(-1)).toBe(0);
  });
});

describe('Himmel-Presets', () => {
  it('kennt alle Presets', () => {
    for (const preset of ['clear', 'dusk', 'night'] as const) {
      expect(resolveSkyLook({ preset })).toBe(SKY_PRESETS[preset]);
    }
    expect(resolveSkyLook({ preset: 'custom', color: '#ff0000' }).top[0]).toBeCloseTo(1, 5);
  });
  it('Nacht ist dunkler als Tag und hat Sterne', () => {
    expect(SKY_PRESETS.night.top[2]).toBeLessThan(SKY_PRESETS.clear.top[2]);
    expect(SKY_PRESETS.night.stars).toBe(1);
    expect(SKY_PRESETS.clear.stars).toBe(0);
  });
  it('eigene Farbe wird aufgehellt zum Horizont', () => {
    const look = customSkyLook('#204080');
    expect(look.horizon[0]).toBeGreaterThan(look.top[0]);
    expect(customSkyLook('kaputt').top).toEqual(SKY_PRESETS.clear.top);
  });
});
