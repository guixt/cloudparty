import { describe, expect, it } from 'vitest';
import { PLATE_H, STUD, brickSize, brickState, brickWorldPos, layerFootprints, restLevel, tile1D } from './bricks';

describe('Klemmbaustein-Maße', () => {
  it('Stein 2×4 ist 0,5 × 0,3 × 1,0 m', () => {
    const s = brickSize(brickState({ w: 2, d: 4, kind: 'stein' }));
    expect(s[0]).toBeCloseTo(0.5);
    expect(s[1]).toBeCloseTo(0.3);
    expect(s[2]).toBeCloseTo(1);
  });
  it('ungültiger state wird zu Standardwerten', () => {
    expect(brickState({ w: -3, d: 99, kind: 'x' })).toEqual({ w: 1, d: 16, kind: 'stein' });
    expect(brickState(undefined)).toEqual({ w: 2, d: 4, kind: 'stein' });
  });
  it('Weltposition: Mitte der Grundfläche, Unterkante', () => {
    const p = brickWorldPos({ gx: 2, gz: 0, w: 2, d: 4, level: 3, plates: 3 }, [1, 0.5, -1]);
    expect(p[0]).toBeCloseTo(1 + 3 * STUD);
    expect(p[1]).toBeCloseTo(0.5 + 3 * PLATE_H);
    expect(p[2]).toBeCloseTo(-1 + 2 * STUD);
  });
  it('restLevel: liegt auf dem höchsten überlappenden Stein', () => {
    const below = [
      { gx: 0, gz: 0, w: 2, d: 2, level: 0, plates: 3 },
      { gx: 4, gz: 0, w: 2, d: 2, level: 0, plates: 1 },
    ];
    expect(restLevel({ gx: 1, gz: 1, w: 2, d: 2 }, below)).toBe(3);
    expect(restLevel({ gx: 4, gz: 0, w: 1, d: 1 }, below)).toBe(1);
    expect(restLevel({ gx: 10, gz: 10, w: 1, d: 1 }, below)).toBe(0);
  });
  it('tile1D deckt die Länge ohne Lücke ab, Versatz verschiebt die Fugen', () => {
    for (const len of [1, 2, 3, 5, 8, 11]) expect(tile1D(len).reduce((a, b) => a + b, 0)).toBe(len);
    expect(tile1D(8, 2).reduce((a, b) => a + b, 0)).toBe(8);
    const joints = (l: number[]) => l.slice(0, -1).reduce<number[]>((acc, n) => [...acc, (acc.at(-1) ?? 0) + n], []);
    expect(joints(tile1D(12))).not.toEqual(joints(tile1D(12, 2)));
  });
  it('Wandschicht: Rand ohne Überlappung, Fläche genau abgedeckt', () => {
    const fps = layerFootprints(6, 5, 0, true);
    const cells = new Set<string>();
    for (const f of fps) for (let x = f.gx; x < f.gx + f.w; x++) for (let z = f.gz; z < f.gz + f.d; z++) {
      const k = `${x},${z}`;
      expect(cells.has(k)).toBe(false);
      cells.add(k);
    }
    expect(cells.size).toBe(2 * 6 + 2 * 3);
    const floor = layerFootprints(6, 5, 0, false);
    expect(floor.reduce((a, f) => a + f.w * f.d, 0)).toBe(30);
  });
});
