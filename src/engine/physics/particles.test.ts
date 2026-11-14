import { describe, expect, it } from 'vitest';
import { DEFAULT_RATES, needsNewSystem, particleRate } from './particles';

describe('Partikel', () => {
  it('nutzt Standardraten je Preset und begrenzt Werte', () => {
    expect(particleRate({ preset: 'fire', enabled: true })).toBe(DEFAULT_RATES.fire);
    expect(particleRate({ preset: 'fire', enabled: true, rate: 10 })).toBe(10);
    expect(particleRate({ preset: 'fire', enabled: true, rate: -5 })).toBe(0);
    expect(particleRate({ preset: 'fire', enabled: true, rate: 1e9 })).toBe(2000);
  });
  it('neues System nur beim Preset-Wechsel', () => {
    expect(needsNewSystem({ preset: 'fire', enabled: true }, { preset: 'fire', enabled: false })).toBe(false);
    expect(needsNewSystem({ preset: 'fire', enabled: true }, { preset: 'smoke', enabled: true })).toBe(true);
    expect(needsNewSystem(undefined, { preset: 'fire', enabled: true })).toBe(true);
  });
});
