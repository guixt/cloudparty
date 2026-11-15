import { describe, expect, it } from 'vitest';
import {
  bedColor,
  daylightFromHorizon,
  generateBumpData,
  generateStreakData,
  insideWater,
  readFallParams,
  readSea,
  readWaterParams,
  reflectionOptions,
  scaledCount,
  selectNearest,
  tintByDaylight,
  uvRepeat,
  waterSize,
  waveSettings,
} from './helpers';

describe('Größe und Form', () => {
  it('waterSize nimmt x/z und begrenzt nach unten', () => {
    expect(waterSize([8, 1, 6])).toEqual({ x: 8, z: 6 });
    expect(waterSize([0, 1, -3])).toEqual({ x: 0.2, z: 3 });
    expect(waterSize([])).toEqual({ x: 8, z: 8 });
  });
  it('uvRepeat skaliert mit der Größe', () => {
    expect(uvRepeat({ x: 4.8, z: 2.4 }, 2.4)).toEqual([2, 1]);
  });
  it('insideWater: rund ist eine Ellipse, rechteckig ein Rechteck, mit Drehung', () => {
    const size = { x: 10, z: 4 };
    expect(insideWater([4, 0], [0, 0], 0, size, 'round')).toBe(true);
    expect(insideWater([4.9, 1.9], [0, 0], 0, size, 'round')).toBe(false);
    expect(insideWater([4.9, 1.9], [0, 0], 0, size, 'rect')).toBe(true);
    expect(insideWater([0, 4], [0, 0], 0, size, 'rect')).toBe(false);
    // um 90° gedreht: lange Achse zeigt entlang z
    expect(insideWater([0, 4], [0, 0], Math.PI / 2, size, 'rect')).toBe(true);
    expect(insideWater([4, 0], [0, 0], Math.PI / 2, size, 'rect')).toBe(false);
  });
});

describe('Parameter', () => {
  it('readWaterParams: Vorgaben und Begrenzung', () => {
    const p = readWaterParams({});
    expect(p.shape).toBe('round');
    expect(p.waves).toBeCloseTo(0.4);
    expect(p.flow).toBeCloseTo(0.3);
    const q = readWaterParams({ state: { shape: 'rect', waves: 7, depth: -1, flow: 'x' }, material: { color: '#ff0000' } });
    expect(q.shape).toBe('rect');
    expect(q.waves).toBe(1);
    expect(q.depth).toBe(0);
    expect(q.flow).toBeCloseTo(0.3);
    expect(q.color).toEqual([1, 0, 0]);
  });
  it('readFallParams: Breite/Höhe mal scale', () => {
    expect(readFallParams({}, [1, 1, 1])).toMatchObject({ width: 2, height: 12 });
    expect(readFallParams({ state: { width: 3, height: 8 } }, [2, 0.5, 1])).toMatchObject({ width: 6, height: 4 });
  });
  it('readSea: Vorgaben', () => {
    expect(readSea(undefined)).toMatchObject({ water: false, waves: 0.5 });
    const s = readSea({ mode: 'water', color: '#000000', waves: 2 });
    expect(s.water).toBe(true);
    expect(s.waves).toBe(1);
    expect(s.color).toEqual([0, 0, 0]);
  });
  it('waveSettings wächst mit Wellen und Strömung', () => {
    const calm = waveSettings(0, 0);
    const wild = waveSettings(1, 1);
    expect(Math.abs(wild.windForce)).toBeGreaterThan(Math.abs(calm.windForce));
    expect(wild.bumpHeight).toBeGreaterThan(calm.bumpHeight);
    expect(waveSettings(0.5, 0.5, true).waveHeight).toBe(0);
  });
});

describe('Qualität', () => {
  it('reflectionOptions', () => {
    expect(reflectionOptions({ waterReflectionSize: 0, waterRefraction: false })).toMatchObject({ reflect: false, maxActive: 0, refract: false });
    expect(reflectionOptions({ waterReflectionSize: 256, waterRefraction: false })).toMatchObject({ reflect: true, size: 256, refract: false, maxActive: 2 });
    expect(reflectionOptions({ waterReflectionSize: 512, waterRefraction: true })).toMatchObject({ refract: true, maxActive: 2 });
    expect(reflectionOptions({ waterReflectionSize: 1024, waterRefraction: true }).maxActive).toBe(3);
    // Brechung nie ohne Spiegelung
    expect(reflectionOptions({ waterReflectionSize: 0, waterRefraction: true }).refract).toBe(false);
  });
  it('scaledCount', () => {
    expect(scaledCount(100, 0.4)).toBe(40);
    expect(scaledCount(100, 0)).toBe(0);
    expect(scaledCount(100, 5)).toBe(100);
  });
  it('selectNearest wählt die nächsten n, stabil bei Gleichstand', () => {
    const items = [
      { id: 'a', x: 10, y: 0, z: 0 },
      { id: 'b', x: 2, y: 0, z: 0 },
      { id: 'c', x: -2, y: 0, z: 0 },
      { id: 'd', x: 50, y: 0, z: 0 },
    ];
    expect([...selectNearest(items, [0, 0, 0], 2)]).toEqual(['b', 'c']);
    expect([...selectNearest(items, [100, 0, 0], 1)]).toEqual(['d']);
    expect(selectNearest(items, [0, 0, 0], 0).size).toBe(0);
    expect(selectNearest(items, [0, 0, 0], 9).size).toBe(4);
  });
});

describe('Licht und Farbe', () => {
  it('Tageslicht: Nacht dunkel, Tag hell', () => {
    const day = daylightFromHorizon([0.53, 0.75, 0.96]);
    const night = daylightFromHorizon([0.005, 0.013, 0.07]);
    expect(day).toBeGreaterThan(0.9);
    expect(night).toBeLessThan(0.3);
    expect(tintByDaylight([1, 1, 1], 0)[0]).toBeLessThan(tintByDaylight([1, 1, 1], 1)[0]);
    expect(tintByDaylight([1, 1, 1], 1)[1]).toBeCloseTo(1);
  });
  it('bedColor wird mit der Tiefe dunkler', () => {
    expect(bedColor([1, 1, 1], 1)[0]).toBeLessThan(bedColor([1, 1, 1], 0)[0]);
  });
});

describe('Texturen', () => {
  it('Normalenkarte ist deterministisch, kachelbar-groß und leicht gewellt', () => {
    const a = generateBumpData(64, 7);
    const b = generateBumpData(64, 7);
    expect(a.length).toBe(64 * 64 * 4);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(generateBumpData(64, 8))).not.toEqual(Array.from(a));
    let sum = 0;
    let sum2 = 0;
    const n = 64 * 64;
    for (let i = 0; i < n; i++) {
      sum += a[i * 4];
      sum2 += a[i * 4] ** 2;
      expect(a[i * 4 + 2]).toBe(255);
      expect(a[i * 4 + 3]).toBe(255);
    }
    const mean = sum / n;
    const std = Math.sqrt(sum2 / n - mean * mean);
    expect(mean).toBeGreaterThan(110);
    expect(mean).toBeLessThan(145);
    expect(std).toBeGreaterThan(5);
    expect(std).toBeLessThan(60);
  });
  it('Schlierenkarte ist deterministisch und hat Alpha', () => {
    const a = generateStreakData(16, 32, 3);
    expect(Array.from(a)).toEqual(Array.from(generateStreakData(16, 32, 3)));
    expect(a.length).toBe(16 * 32 * 4);
    expect(Math.max(...Array.from(a).filter((_, i) => i % 4 === 3))).toBeGreaterThan(40);
  });
});
