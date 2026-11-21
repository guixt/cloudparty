import { describe, expect, it } from 'vitest';
import { SKY_PRESETS, toLinear, type Rgb } from '../presets';
import { changeScore, hemiFactor, modeForQuality, shouldRefresh, signature, type SkySample } from './logic';
import { buildProceduralCube, encodeFaceRgba8, skyColorAt } from './proceduralSky';

const lin = (c: Rgb): Rgb => toLinear(c);
function sample(name: 'clear' | 'dusk' | 'night', sunDir: [number, number, number] = [0, Math.SQRT1_2, Math.SQRT1_2]): SkySample {
  const l = SKY_PRESETS[name];
  return { top: lin(l.top), mid: lin(l.mid), horizon: lin(l.horizon), below: lin(l.below), sunDisc: lin(l.sunDisc), sunGlow: lin(l.sunGlow), sunDir, sunVisible: 1, stars: l.stars };
}

describe('modeForQuality', () => {
  it('0 = prozedural, sonst Zweierpotenz im Bereich', () => {
    expect(modeForQuality(0).kind).toBe('procedural');
    expect(modeForQuality(Number.NaN).kind).toBe('procedural');
    expect(modeForQuality(128)).toEqual({ kind: 'probe', size: 128 });
    expect(modeForQuality(100)).toEqual({ kind: 'probe', size: 128 });
    expect(modeForQuality(8)).toEqual({ kind: 'probe', size: 32 });
    expect(modeForQuality(4096)).toEqual({ kind: 'probe', size: 512 });
  });
});

describe('shouldRefresh', () => {
  it('erstes Mal immer', () => expect(shouldRefresh({ score: Infinity, sinceLast: 0, updateSeconds: 4, periodic: true })).toBe(true));
  it('ohne Änderung nichts (updateSeconds 0)', () => expect(shouldRefresh({ score: 0, sinceLast: 100, updateSeconds: 0, periodic: true })).toBe(false));
  it('starke Änderung nach 0,5 s', () => {
    expect(shouldRefresh({ score: 0.5, sinceLast: 0.2, updateSeconds: 4, periodic: true })).toBe(false);
    expect(shouldRefresh({ score: 0.5, sinceLast: 0.6, updateSeconds: 4, periodic: true })).toBe(true);
  });
  it('kleine Änderung wird gedrosselt', () => {
    expect(shouldRefresh({ score: 0.05, sinceLast: 1, updateSeconds: 4, periodic: true })).toBe(false);
    expect(shouldRefresh({ score: 0.05, sinceLast: 4.1, updateSeconds: 4, periodic: true })).toBe(true);
    expect(shouldRefresh({ score: 0.05, sinceLast: 0.6, updateSeconds: 0, periodic: false })).toBe(true);
    expect(shouldRefresh({ score: 0.05, sinceLast: 0.3, updateSeconds: 0, periodic: false })).toBe(false);
  });
  it('periodisch nur bei echter Sonde', () => {
    expect(shouldRefresh({ score: 0, sinceLast: 2.1, updateSeconds: 2, periodic: true })).toBe(true);
    expect(shouldRefresh({ score: 0, sinceLast: 2.1, updateSeconds: 2, periodic: false })).toBe(false);
  });
});

describe('changeScore', () => {
  const a = signature(sample('clear'), 3);
  it('gleich = 0, anderer Himmel = groß', () => {
    expect(changeScore(a, [...a])).toBeLessThan(1e-3);
    expect(changeScore(a, signature(sample('night'), 3))).toBeGreaterThan(0.15);
    expect(changeScore(null, a)).toBe(Infinity);
  });
  it('Sonnenwinkel zählt', () => {
    expect(changeScore(a, signature(sample('clear', [Math.SQRT1_2, Math.SQRT1_2, 0]), 3))).toBeGreaterThan(0.15);
  });
});

describe('hemiFactor', () => {
  it('begrenzt und monoton', () => {
    expect(hemiFactor(0, 1, 1)).toBe(1);
    expect(hemiFactor(0.5, 0, 1)).toBe(1);
    const f1 = hemiFactor(0.5, 0.2, 1);
    const f2 = hemiFactor(0.5, 0.6, 1);
    expect(f2).toBeLessThan(f1);
    expect(hemiFactor(0.1, 50, 1)).toBe(0.3);
    expect(f1).toBeLessThanOrEqual(1);
  });
});

describe('prozeduraler Himmel', () => {
  it('oben blauer Himmel, unten Bodenfarbe, Sonne hell', () => {
    const s = sample('clear');
    const up = skyColorAt(s, [0, 1, 0]);
    expect(up[2]).toBeGreaterThan(up[0]);
    const sun = skyColorAt(s, s.sunDir);
    expect(sun[0]).toBeGreaterThan(1.5);
    const dark = skyColorAt({ ...s, sunVisible: 0 }, s.sunDir);
    expect(dark[0]).toBeLessThan(1);
  });
  it('Würfel hat sechs Flächen, Nacht dunkler als Tag', () => {
    const day = buildProceduralCube(sample('clear'), 8);
    const night = buildProceduralCube(sample('night'), 8);
    expect(day.faces).toHaveLength(6);
    expect(day.faces[0]).toHaveLength(8 * 8 * 3);
    expect(night.meanLuminance).toBeLessThan(day.meanLuminance * 0.2);
  });
  it('Kodierung bleibt in 8 Bit', () => {
    const out = encodeFaceRgba8(new Float32Array([0, 2, 100]));
    expect(Array.from(out.slice(0, 4))).toEqual([0, expect.any(Number), 255, 255]);
  });
});
