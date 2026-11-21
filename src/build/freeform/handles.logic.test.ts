import { describe, expect, it } from 'vitest';
import type { FreeformState } from '../../../shared/freeform';
import type { Transform } from '../../../shared/types';
import { applyHandle, dragPlaneNormal, handlesOf, localToWorld, rayPlane, worldToLocal } from './handles.logic';

const s = Math.SQRT1_2;
const T: Transform = { pos: [1, 2, 3], rot: [0, s, 0, s], scale: [2, 1, 3] }; // 90 Grad um Y
const sweep: FreeformState = { kind: 'sweep', path: [{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], height: 2, thickness: 0.2 };
const lathe: FreeformState = { kind: 'lathe', profile: [[1, 0], [0.5, 2]] };
const patch: FreeformState = { kind: 'patch', grid: [[[0, 0, 0], [1, 0, 0]], [[0, 0, 1], [1, 1, 1]]] };

describe('Punkt-Transformation', () => {
  it('lokal -> Welt -> lokal ist umkehrbar', () => {
    const w = localToWorld(T, [1, 1, 1]);
    // skaliert (2,1,3), um Y um 90 Grad gedreht (x -> -z, z -> x), plus Position
    expect(w[0]).toBeCloseTo(1 + 3);
    expect(w[1]).toBeCloseTo(3);
    expect(w[2]).toBeCloseTo(3 - 2);
    const l = worldToLocal(T, w);
    [1, 1, 1].forEach((v, i) => expect(l[i]).toBeCloseTo(v));
  });
});

describe('Griffe', () => {
  it('Anzahl und Lage je Art', () => {
    expect(handlesOf(sweep)).toHaveLength(2);
    expect(handlesOf(sweep)[1].local).toEqual([4, 1, 0]);
    expect(handlesOf(lathe).map((h) => h.local)).toEqual([[1, 0, 0], [0.5, 2, 0]]);
    expect(handlesOf(patch)).toHaveLength(4);
  });
  it('Ebenen', () => {
    expect(dragPlaneNormal(sweep, T, [0, 0, 1], false).plane).toBe('horizontal');
    expect(dragPlaneNormal(lathe, T, [0, 0, 1], false).plane).toBe('profile');
    expect(dragPlaneNormal(patch, T, [0, 0, 1], false).plane).toBe('camera');
    expect(dragPlaneNormal(patch, T, [0, 0, 1], true).plane).toBe('horizontal');
  });
  it('Ebenen-Schnitt', () => {
    expect(rayPlane([0, 5, 0], [0, -1, 0], [0, 1, 0], [0, 1, 0])).toEqual([0, 1, 0]);
    expect(rayPlane([0, 5, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0])).toBeNull();
    expect(rayPlane([0, 5, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0])).toBeNull();
  });
});

describe('neuer State', () => {
  it('Sweep-Punkt', () => {
    const n = applyHandle(sweep, { kind: 'sweep', index: 1 }, [5.1, 9, 2.4], 0.25) as typeof sweep;
    expect(n.path[1].p).toEqual([5, 2.5]);
    expect((sweep as typeof n).path[1].p).toEqual([4, 0]);
  });
  it('Profilpunkt', () => {
    const n = applyHandle(lathe, { kind: 'lathe', index: 0 }, [1.5, 0.3, 7]) as typeof lathe;
    expect(n.profile[0]).toEqual([1.5, 0.3]);
  });
  it('negativer Radius wird abgelehnt', () => {
    expect(applyHandle(lathe, { kind: 'lathe', index: 0 }, [-1, 0, 0])).toBeNull();
  });
  it('Gitterpunkt', () => {
    const n = applyHandle(patch, { kind: 'patch', row: 1, col: 1 }, [2, 3, 4]) as typeof patch;
    expect(n.grid[1][1]).toEqual([2, 3, 4]);
  });
  it('ungültig: NaN, falscher Index, Art passt nicht', () => {
    expect(applyHandle(sweep, { kind: 'sweep', index: 1 }, [NaN, 0, 0])).toBeNull();
    expect(applyHandle(sweep, { kind: 'sweep', index: 9 }, [0, 0, 0])).toBeNull();
    expect(applyHandle(sweep, { kind: 'patch', row: 0, col: 0 }, [0, 0, 0])).toBeNull();
  });
});
