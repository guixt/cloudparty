import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../../shared/avatar';
import { loadAppearance, sanitizeAppearance, sanitizeName, saveAppearance } from './appearance';
import { maxBetaAboveGround } from './camera';

describe('appearance', () => {
  it('keeps only valid hex colours', () => {
    const a = sanitizeAppearance({ skin: '#FFAA00', hair: 'red', shirt: 5, pants: '#123456' });
    expect(a).toEqual({ ...DEFAULT_APPEARANCE, skin: '#ffaa00', pants: '#123456' });
  });
  it('round-trips through storage and survives garbage', () => {
    const mem: Record<string, string> = {};
    const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
    saveAppearance({ ...DEFAULT_APPEARANCE, shirt: '#112233' }, store);
    expect(loadAppearance(store).shirt).toBe('#112233');
    mem['cloudparty.appearance'] = '{kaputt';
    expect(loadAppearance(store)).toEqual(DEFAULT_APPEARANCE);
  });
  it('cleans names', () => {
    expect(sanitizeName('   ')).toBe('Gast');
    expect(sanitizeName('  Max   Muster ')).toBe('Max Muster');
    expect(sanitizeName('x'.repeat(50)).length).toBe(24);
  });
});

describe('camera ground guard', () => {
  it('limits beta so the camera stays above the ground', () => {
    const beta = maxBetaAboveGround(1.4, 6, 0.35);
    const y = 1.4 + 6 * Math.cos(beta);
    expect(y).toBeGreaterThanOrEqual(0.349);
    expect(maxBetaAboveGround(10, 2, 0.35)).toBeGreaterThan(1.5);
  });
});
