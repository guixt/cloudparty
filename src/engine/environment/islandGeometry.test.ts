import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { describe, expect, it } from 'vitest';
import { buildIslandGeometry } from './islandGeometry';
import { createOutline, mulberry32 } from './outline';

const island = { radius: 40, depth: 18, seed: 7 };

describe('Inselgeometrie', () => {
  const g = buildIslandGeometry(island);
  it('hat eine überschaubare Größe', () => {
    expect(g.positions.length / 3).toBeLessThan(4000);
    expect(g.indices.length % 3).toBe(0);
    expect(Math.max(...g.indices)).toBeLessThan(g.positions.length / 3);
  });
  it('ist innerhalb von 85 % des Radius exakt flach bei y = 0', () => {
    for (let i = 0; i < g.positions.length; i += 3) {
      const r = Math.hypot(g.positions[i], g.positions[i + 2]);
      if (r <= 0.85 * 40 && g.positions[i + 1] > -0.0001) expect(g.positions[i + 1]).toBeLessThan(1e-9);
    }
  });
  it('Hügel höchstens 0,6 m, Spitze bei -depth', () => {
    expect(g.maxTopHeight).toBeLessThanOrEqual(0.6);
    const ys = g.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-18, 3);
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.6);
  });
  it('Oberseite zeigt nach oben', () => {
    const normals: number[] = [];
    VertexData.ComputeNormals(g.positions, g.indices, normals);
    expect(normals[1]).toBeGreaterThan(0.9);
    const ring = (1 + 3 * 112) * 3; // Vertex auf einem inneren Ring
    expect(normals[ring + 1]).toBeGreaterThan(0.9);
  });
  it('ist deterministisch je Seed', () => {
    expect(buildIslandGeometry(island).positions).toEqual(g.positions);
    expect(buildIslandGeometry({ ...island, seed: 8 }).positions).not.toEqual(g.positions);
  });
});

describe('Umriss', () => {
  it('bleibt in Grenzen, ist periodisch und deterministisch', () => {
    const f = createOutline(5);
    const h = createOutline(5);
    for (let i = 0; i < 200; i++) {
      const t = (i / 200) * Math.PI * 2;
      expect(f(t)).toBeGreaterThanOrEqual(0.88);
      expect(f(t)).toBeLessThanOrEqual(1.1);
      expect(f(t)).toBeCloseTo(h(t), 12);
    }
    expect(f(0)).toBeCloseTo(f(Math.PI * 2), 9);
  });
  it('rng liefert Werte in [0,1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) expect(r()).toBeLessThan(1);
  });
});
