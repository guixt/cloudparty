import { describe, expect, it } from 'vitest';
import { eulerDegFromQuat, fallbackPoint, placementY, quatFromEulerDeg, snapValue, snapVec3 } from './logic';

describe('snap', () => {
  it('rastet auf Vielfache ein', () => {
    expect(snapValue(0.37, 0.25)).toBe(0.25);
    expect(snapValue(0.38, 0.25)).toBe(0.5);
    expect(snapValue(-1.12, 0.25)).toBe(-1.0);
    expect(snapValue(17, 15)).toBe(15);
    expect(snapValue(1.234, 0)).toBe(1.234);
    expect(snapVec3([0.1, 0.6, -0.3], 0.25)).toEqual([0, 0.5, -0.25]);
  });
});

describe('euler/quaternion', () => {
  it('Identität', () => {
    expect(quatFromEulerDeg(0, 0, 0)).toEqual([0, 0, 0, 1]);
    expect(eulerDegFromQuat([0, 0, 0, 1])).toEqual([0, 0, 0]);
  });
  it('90° um Y', () => {
    const q = quatFromEulerDeg(0, 90, 0);
    expect(q[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 6);
  });
  it('Rundreise', () => {
    for (const e of [[30, 45, 10], [-20, 170, 5], [80, -90, 60], [0, 15, 0], [45, 0, -45]] as const) {
      const back = eulerDegFromQuat(quatFromEulerDeg(e[0], e[1], e[2]));
      expect(back[0]).toBeCloseTo(e[0], 3);
      expect(back[1]).toBeCloseTo(e[1], 3);
      expect(back[2]).toBeCloseTo(e[2], 3);
    }
  });
});

describe('Platzierung', () => {
  it('zentrierte Formen liegen mit Halbhöhe auf', () => {
    expect(placementY(0, 'center', 1)).toBe(0.5);
    expect(placementY(1, 'center', 2)).toBe(2);
    expect(placementY(0, 'center', 1, 0.1)).toBeCloseTo(0.05);
  });
  it('Prefabs mit Bodenursprung', () => {
    expect(placementY(0.3, 'ground', 3)).toBe(0.3);
  });
  it('Ersatzpunkt 6 m voraus bei y = 0', () => {
    const p = fallbackPoint([1, 5, 1], [0, -0.5, 1]);
    expect(p[0]).toBeCloseTo(1);
    expect(p[1]).toBe(0);
    expect(p[2]).toBeCloseTo(7);
  });
});
