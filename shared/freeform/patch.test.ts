import { describe, expect, it } from 'vitest';
import { buildPatch } from './patch';
import { FREEFORM_LIMITS, type PatchParams, type Vec3 } from './types';
import { meshBounds } from './util';

function grid(nx: number, nz: number, h: (x: number, z: number) => number = () => 0): Vec3[][] {
  const g: Vec3[][] = [];
  for (let r = 0; r < nz; r++) {
    const row: Vec3[] = [];
    for (let c = 0; c < nx; c++) row.push([c, h(c, r), r]);
    g.push(row);
  }
  return g;
}
const P = (g: Vec3[][], extra: Partial<PatchParams> = {}): PatchParams => ({ kind: 'patch', grid: g, ...extra });

function triNormals(m: ReturnType<typeof buildPatch>): Vec3[] {
  const out: Vec3[] = [];
  const p = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const u = [0, 1, 2].map((k) => p[b * 3 + k] - p[a * 3 + k]);
    const v = [0, 1, 2].map((k) => p[c * 3 + k] - p[a * 3 + k]);
    out.push([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
  }
  return out;
}

describe('buildPatch', () => {
  it('flache Fläche: Normalen und Dreiecke zeigen nach +y', () => {
    const m = buildPatch(P(grid(4, 4)));
    for (let i = 0; i < m.normals.length; i += 3) {
      expect(m.normals[i]).toBeCloseTo(0);
      expect(m.normals[i + 1]).toBeCloseTo(1);
      expect(m.normals[i + 2]).toBeCloseTo(0);
    }
    for (const n of triNormals(m)) expect(n[1]).toBeGreaterThan(0);
  });

  it('Standardunterteilung 24×24 ergibt 625 Vertices und 1152 Dreiecke', () => {
    const m = buildPatch(P(grid(3, 3)));
    expect(m.positions.length / 3).toBe(625);
    expect(m.indices.length / 3).toBe(24 * 24 * 2);
  });

  it('gewölbte Mitte: Bounds liegen unter dem Kontrollpunkt-Maximum', () => {
    const g = grid(3, 3, (x, z) => (x === 1 && z === 1 ? 2 : 0));
    const b = meshBounds(buildPatch(P(g, { degree: 2 })));
    expect(b.min[0]).toBeCloseTo(0);
    expect(b.max[0]).toBeCloseTo(2);
    expect(b.max[1]).toBeCloseTo(0.5);
    expect(b.max[1]).toBeLessThan(2);
  });

  it('Grad 1 trifft die Eckpunkte exakt', () => {
    const g = grid(3, 3, (x, z) => x * 0.3 + z * 0.7);
    const m = buildPatch(P(g, { degree: 1, subdivisions: [4, 4] }));
    const corner = (k: number): Vec3 => [m.positions[k * 3], m.positions[k * 3 + 1], m.positions[k * 3 + 2]];
    expect(corner(0)).toEqual(g[0][0]);
    expect(corner(4)).toEqual(g[0][2]);
    expect(corner(20)).toEqual(g[2][0]);
    expect(corner(24)).toEqual(g[2][2]);
  });

  it('Grad 3 bleibt in der konvexen Hülle (Box) der Kontrollpunkte', () => {
    const g = grid(5, 5, (x, z) => Math.sin(x * 1.3) * Math.cos(z) * 2);
    const ys = g.flat().map((p) => p[1]);
    const b = meshBounds(buildPatch(P(g)));
    expect(b.min[1]).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-9);
    expect(b.max[1]).toBeLessThanOrEqual(Math.max(...ys) + 1e-9);
    expect(b.min[0]).toBeGreaterThanOrEqual(-1e-9);
    expect(b.max[0]).toBeLessThanOrEqual(4 + 1e-9);
  });

  it('Grad wird auf Gittergröße−1 begrenzt (2×2 mit Grad 3 = bilinear)', () => {
    const m = buildPatch(P(grid(2, 2), { subdivisions: [2, 2] }));
    expect(m.positions[4 * 3]).toBeCloseTo(0.5);
    expect(m.positions[4 * 3 + 2]).toBeCloseTo(0.5);
  });

  it('Dicke: doppelte Fläche plus Randstreifen, Rückseite nach unten, Normalen nach außen', () => {
    const flat = buildPatch(P(grid(3, 3), { subdivisions: [4, 4] }));
    const m = buildPatch(P(grid(3, 3), { subdivisions: [4, 4], thickness: 0.2 }));
    expect(m.positions.length / 3).toBe(25 * 2 + 4 * 2 * 5);
    expect(m.indices.length / 3).toBe((flat.indices.length / 3) * 2 + 4 * 4 * 2);
    const b = meshBounds(m);
    expect(b.min[1]).toBeCloseTo(-0.2);
    expect(b.max[1]).toBeCloseTo(0);
    triNormals(m).forEach((n, t) => {
      const i = m.indices[t * 3];
      const d = n[0] * m.normals[i * 3] + n[1] * m.normals[i * 3 + 1] + n[2] * m.normals[i * 3 + 2];
      expect(d).toBeGreaterThan(0);
    });
  });

  it('UVs in Metern: Ausdehnung entspricht der Gittergröße', () => {
    const g = grid(3, 3).map((r) => r.map((p) => [p[0] * 2, p[1], p[2]] as Vec3));
    const m = buildPatch(P(g, { degree: 1 }));
    const us = m.uvs.filter((_, i) => i % 2 === 0);
    const vs = m.uvs.filter((_, i) => i % 2 === 1);
    expect(Math.min(...us)).toBe(0);
    expect(Math.max(...us)).toBeCloseTo(4);
    expect(Math.max(...vs)).toBeCloseTo(2);
  });

  it('Fehlerfälle', () => {
    expect(() => buildPatch(P([[[0, 0, 0]]]))).toThrow(/2×2/);
    expect(() => buildPatch(P([[[0, 0, 0], [1, 0, 0]], [[0, 0, 1]]]))).toThrow(/gleich lang/);
    expect(() => buildPatch(P(grid(2, 2).map((r) => r.map((p) => [p[0], NaN, p[2]] as Vec3))))).toThrow(/endliche/);
    expect(() => buildPatch(P(grid(FREEFORM_LIMITS.maxGrid + 1, 2)))).toThrow(/höchstens/);
  });

  it('Unterteilung wird begrenzt, Vertex-Limit gilt', () => {
    const big = buildPatch(P(grid(3, 3), { subdivisions: [500, 500], thickness: 0.1 }));
    expect(big.positions.length / 3).toBeLessThanOrEqual(FREEFORM_LIMITS.maxVertices);
    expect(big.positions.length / 3).toBeGreaterThan(65 * 65);
    const tiny = buildPatch(P(grid(3, 3), { subdivisions: [0, -3] }));
    expect(tiny.positions.length / 3).toBe(4);
  });
});
