import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit';

describe('RateLimiter', () => {
  it('erlaubt Burst bis max und blockiert danach', () => {
    const l = new RateLimiter(5, 5000);
    for (let i = 0; i < 5; i++) expect(l.allow(1000)).toBe(true);
    expect(l.allow(1000)).toBe(false);
  });
  it('füllt über die Zeit wieder auf', () => {
    const l = new RateLimiter(5, 5000);
    for (let i = 0; i < 5; i++) l.allow(0);
    expect(l.allow(500)).toBe(false);
    expect(l.allow(1000)).toBe(true);
    expect(l.allow(1000)).toBe(false);
    expect(l.allow(100000)).toBe(true);
  });
  it('überschreitet nie die Kapazität', () => {
    const l = new RateLimiter(2, 1000);
    l.allow(0);
    let n = 0;
    while (l.allow(1_000_000) && n < 10) n++;
    expect(n).toBe(2);
  });
});
