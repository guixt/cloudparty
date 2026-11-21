import { describe, expect, it } from 'vitest';
import { buildLathe } from './lathe';
import { arcBetween, arcRadius, buildPolyline } from './path';
import { sanitizeFreeformState } from './sanitize';
import { buildSweep } from './sweep';
import { FREEFORM_LIMITS, type MeshData } from './types';
import { buildFreeformMesh, meshBounds } from './index';

function checkMesh(m: MeshData): void {
  const vc = m.positions.length / 3;
  expect(vc).toBeGreaterThan(0);
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.uvs.length / 2).toBe(vc);
  expect(m.indices.length % 3).toBe(0);
  let badIndex = 0;
  for (const i of m.indices) if (!(i >= 0 && i < vc && Number.isInteger(i))) badIndex++;
  expect(badIndex).toBe(0);
  let badNum = 0;
  for (const arr of [m.positions, m.normals, m.uvs]) for (const v of arr) if (!Number.isFinite(v)) badNum++;
  expect(badNum).toBe(0);
  let badNormal = 0;
  for (let i = 0; i < vc; i++) if (Math.abs(Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]) - 1) > 1e-6) badNormal++;
  expect(badNormal).toBe(0);
  // Umlaufsinn passt zu den Normalen.
  const P = m.positions;
  const N = m.normals;
  let badWinding = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
    const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const v = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const d = cr[0] * (N[a * 3] + N[b * 3] + N[c * 3]) + cr[1] * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + cr[2] * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
    if (!(d > 0)) badWinding++;
  }
  expect(badWinding).toBe(0);
}

describe('Pfad', () => {
  it('Radius aus Sehne und Pfeilhöhe', () => {
    expect(arcRadius(4, 1)).toBeCloseTo(2.5, 9);
    expect(arcRadius(4, 0)).toBe(Infinity);
  });
  it('Bogen mit Pfeilhöhe 1 über 4 m Sehne liegt auf Radius 2,5 und wölbt nach links', () => {
    const pl = buildPolyline([{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], { segments: 16 });
    const arc = arcBetween([0, 0], [4, 0], 1);
    expect(arc.radius).toBeCloseTo(2.5, 9);
    expect(arc.center[0]).toBeCloseTo(2, 9);
    expect(arc.center[1]).toBeCloseTo(-1.5, 9);
    expect(pl.pts).toHaveLength(17);
    for (const p of pl.pts) expect(Math.hypot(p[0] - 2, p[1] + 1.5)).toBeCloseTo(2.5, 9);
    expect(Math.max(...pl.pts.map((p) => p[1]))).toBeCloseTo(1, 9);
    expect(pl.pts[0]).toEqual([0, 0]);
    expect(pl.pts[16][0]).toBeCloseTo(4, 9);
    expect(pl.pts[16][1]).toBeCloseTo(0, 9);
    // Bogenlänge ≈ r·φ
    expect(pl.total).toBeLessThan(arc.length);
    expect(pl.total).toBeGreaterThan(arc.length * 0.99);
  });
  it('negative Pfeilhöhe wölbt nach rechts', () => {
    const pl = buildPolyline([{ p: [0, 0], bulge: -1 }, { p: [4, 0] }]);
    expect(Math.min(...pl.pts.map((p) => p[1]))).toBeCloseTo(-1, 9);
  });
  it('bulge 0 = gerade', () => {
    const pl = buildPolyline([{ p: [0, 0], bulge: 0 }, { p: [3, 4] }]);
    expect(pl.pts).toEqual([[0, 0], [3, 4]]);
    expect(pl.total).toBeCloseTo(5, 9);
    expect(pl.tangents[0][0]).toBeCloseTo(0.6, 9);
    expect(pl.normals[0][0]).toBeCloseTo(-0.8, 9);
    expect(pl.normals[0][1]).toBeCloseTo(0.6, 9);
  });
  it('geschlossener Pfad: Schlusssegment zählt zur Länge, Ecken werden erkannt', () => {
    const pl = buildPolyline([{ p: [0, 0] }, { p: [2, 0] }, { p: [2, 2] }, { p: [0, 2] }], { closed: true });
    expect(pl.pts).toHaveLength(4);
    expect(pl.total).toBeCloseTo(8, 9);
    expect(pl.corner.every(Boolean)).toBe(true);
  });
  it('maxStep verdichtet gerade Stücke', () => {
    const pl = buildPolyline([{ p: [0, 0] }, { p: [4, 0] }], { maxStep: 0.5 });
    expect(pl.pts).toHaveLength(9);
  });
  it('doppelte Punkte entfallen', () => {
    const pl = buildPolyline([{ p: [0, 0] }, { p: [0, 0] }, { p: [1, 0] }]);
    expect(pl.pts).toHaveLength(2);
  });
});

describe('Drehkörper', () => {
  it('Zylinder Radius 0,5 Höhe 1: Hülle, Zahlen, Normalen', () => {
    const m = buildLathe({ kind: 'lathe', profile: [[0.5, 0], [0.5, 1]] });
    checkMesh(m);
    expect(m.positions.length / 3).toBe(2 * 49);
    expect(m.indices.length / 3).toBe(2 * 48);
    const b = meshBounds(m);
    expect(b.min[0]).toBeCloseTo(-0.5, 6);
    expect(b.max[0]).toBeCloseTo(0.5, 6);
    expect(b.min[2]).toBeCloseTo(-0.5, 6);
    expect(b.max[2]).toBeCloseTo(0.5, 6);
    expect(b.min[1]).toBeCloseTo(0, 9);
    expect(b.max[1]).toBeCloseTo(1, 9);
    // Normalen zeigen radial nach außen
    for (let i = 0; i < m.positions.length; i += 3) {
      expect(m.normals[i] * m.positions[i] + m.normals[i + 2] * m.positions[i + 2]).toBeGreaterThan(0.49);
    }
  });
  it('Naht schließt ohne Lücke, u läuft 0–1, v = Profillänge', () => {
    const m = buildLathe({ kind: 'lathe', profile: [[0.5, 0], [0.5, 2]], segments: 12 });
    const last = 12;
    for (let k = 0; k < 2; k++) {
      const a = k * 13;
      expect(m.positions[(a + last) * 3]).toBeCloseTo(m.positions[a * 3], 9);
      expect(m.positions[(a + last) * 3 + 2]).toBeCloseTo(m.positions[a * 3 + 2], 9);
    }
    const us = m.uvs.filter((_, i) => i % 2 === 0);
    const vs = m.uvs.filter((_, i) => i % 2 === 1);
    expect(Math.min(...us)).toBe(0);
    expect(Math.max(...us)).toBe(1);
    expect(Math.max(...vs)).toBeCloseTo(2, 9);
  });
  it('Teilwinkel: halber Kreis liegt auf einer Seite', () => {
    const m = buildLathe({ kind: 'lathe', profile: [[1, 0], [1, 1]], startDeg: 0, sweepDeg: 180, segments: 24 });
    checkMesh(m);
    const b = meshBounds(m);
    expect(b.min[2]).toBeGreaterThanOrEqual(-1e-9);
    expect(b.max[2]).toBeCloseTo(1, 6);
    expect(m.positions.length / 3).toBe(2 * 25);
  });
  it('Ellipse streckt z; Normalen bleiben normiert', () => {
    const m = buildLathe({ kind: 'lathe', profile: [[1, 0], [1, 1]], ellipse: 0.5 });
    checkMesh(m);
    const b = meshBounds(m);
    expect(b.max[0]).toBeCloseTo(1, 6);
    expect(b.max[2]).toBeCloseTo(0.5, 6);
  });
  it('Knick im Profil teilt Vertices (harte Kante), Deckel über Radius 0', () => {
    const m = buildLathe({ kind: 'lathe', profile: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], segments: 8 });
    checkMesh(m);
    expect(m.positions.length / 3).toBe((1 + 2 + 2 + 1) * 9);
    const b = meshBounds(m);
    expect(b.max[1]).toBeCloseTo(1, 9);
  });
  it('begrenzt die Vertexzahl', () => {
    const profile = Array.from({ length: 200 }, (_, i) => [0.5 + 0.1 * Math.sin(i), i * 0.01] as [number, number]);
    const m = buildLathe({ kind: 'lathe', profile, segments: 256 });
    expect(m.positions.length / 3).toBeLessThanOrEqual(FREEFORM_LIMITS.maxVertices);
    checkMesh(m);
  });
});

describe('Sweep', () => {
  it('gerade Wand: Vertex-/Dreieckszahl und Hülle', () => {
    const m = buildSweep({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [4, 0] }], height: 2.4, thickness: 0.2 });
    checkMesh(m);
    expect(m.positions.length / 3).toBe(2 * 8 + 8);
    expect(m.indices.length / 3).toBe(8 + 4);
    const b = meshBounds(m);
    expect(b.min).toEqual([0, 0, -0.1]);
    expect(b.max[0]).toBeCloseTo(4, 9);
    expect(b.max[1]).toBeCloseTo(2.4, 9);
    expect(b.max[2]).toBeCloseTo(0.1, 9);
  });
  it('UVs: u = Länge in Metern, v = Höhe in Metern', () => {
    const m = buildSweep({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [4, 0] }], height: 2.4, thickness: 0.2 });
    // Spalte 1, Vertex "links oben" (Index 8 + 1)
    expect(m.uvs[(8 + 1) * 2]).toBeCloseTo(4, 9);
    expect(m.uvs[(8 + 1) * 2 + 1]).toBeCloseTo(2.4, 9);
    const us = m.uvs.filter((_, i) => i % 2 === 0);
    expect(Math.max(...us)).toBeCloseTo(4, 9);
  });
  it('Bogenwand mit Pfeilhöhe 1 über 4 m Sehne: Mittellinie Radius 2,5', () => {
    const m = buildSweep({ kind: 'sweep', path: [{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], height: 2, thickness: 0.1, segments: 24 });
    checkMesh(m);
    const b = meshBounds(m);
    expect(b.max[2]).toBeCloseTo(1.05, 2); // Außenseite liegt bei 1 + halbe Dicke
    // Alle Seitenvertices liegen bei 2,5 ± 0,05 um die Mitte (2, -1,5)
    for (let i = 0; i < m.positions.length; i += 3) {
      const d = Math.hypot(m.positions[i] - 2, m.positions[i + 2] + 1.5);
      expect(d).toBeGreaterThan(2.45 - 1e-2);
      expect(d).toBeLessThan(2.55 + 1e-2);
    }
  });
  it('Höhenverlauf und Unterkante y0', () => {
    const m = buildSweep({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [4, 0] }], height: 1, heightEnd: 3, thickness: 0.2, y0: 2.5 });
    checkMesh(m);
    const b = meshBounds(m);
    expect(b.min[1]).toBeCloseTo(2.5, 9);
    expect(b.max[1]).toBeCloseTo(5.5, 9);
  });
  it('geschlossener Pfad hat keine Stirnflächen, Ecken sind hart', () => {
    const m = buildSweep({
      kind: 'sweep',
      path: [{ p: [0, 0] }, { p: [2, 0] }, { p: [2, 2] }, { p: [0, 2] }],
      closedPath: true,
      height: 2,
      thickness: 0.2,
    });
    checkMesh(m);
    // 4 Ecken: Spalten 0 (nur Start), 4 (nur Ende) und drei Ecken mit je 2 + eine Ecke ... = 1 + 1 + 3 * 2 = 8 Spalten
    expect(m.positions.length / 3).toBe(8 * 8);
    expect(m.indices.length / 3).toBe(4 * 8);
    const b = meshBounds(m);
    expect(b.min[0]).toBeCloseTo(-0.1, 9);
    expect(b.max[0]).toBeCloseTo(2.1, 9);
    expect(b.max[2]).toBeCloseTo(2.1, 9);
  });
  it('geschlossener Kreis aus Bögen ist glatt', () => {
    const m = buildSweep({
      kind: 'sweep',
      path: [{ p: [-1, 0], bulge: 1 }, { p: [1, 0], bulge: 1 }],
      closedPath: true,
      height: 1,
      thickness: 0.1,
      segments: 16,
    });
    checkMesh(m);
    for (let i = 0; i < m.positions.length; i += 3) {
      const d = Math.hypot(m.positions[i], m.positions[i + 2]);
      expect(d).toBeGreaterThan(0.95 - 1e-2);
      expect(d).toBeLessThan(1.05 + 1e-2);
    }
  });
  it('Welle versetzt seitlich um die Amplitude und verdichtet den Pfad', () => {
    const m = buildSweep({
      kind: 'sweep',
      path: [{ p: [0, 0] }, { p: [4, 0] }],
      height: 2,
      thickness: 0.1,
      wave: { amplitude: 0.2, length: 1 },
    });
    checkMesh(m);
    const b = meshBounds(m);
    expect(b.max[2]).toBeGreaterThan(0.2);
    expect(b.max[2]).toBeLessThanOrEqual(0.25 + 1e-2);
    expect(m.positions.length / 3).toBeGreaterThan(8 * 30);
    expect(b.max[0]).toBeGreaterThan(3.9);
  });
  it('begrenzt die Vertexzahl bei sehr feiner Welle', () => {
    const m = buildSweep({
      kind: 'sweep',
      path: [{ p: [0, 0] }, { p: [200, 0] }],
      height: 2,
      thickness: 0.1,
      wave: { amplitude: 0.05, length: 0.02 },
    });
    expect(m.positions.length / 3).toBeLessThanOrEqual(FREEFORM_LIMITS.maxVertices);
    checkMesh(m);
  });
});

describe('sanitizeFreeformState', () => {
  it('setzt Standardwerte und gibt eine Kopie zurück', () => {
    const raw = { kind: 'lathe', profile: [[0.5, 0], [0.5, 1]] };
    const s = sanitizeFreeformState(raw);
    expect(s).toMatchObject({ kind: 'lathe', sweepDeg: 360, startDeg: 0, segments: 48, ellipse: 1 });
    expect((s as { profile: unknown }).profile).not.toBe(raw.profile);
  });
  it('klemmt Segmente, Winkel und Größen', () => {
    const s = sanitizeFreeformState({ kind: 'lathe', profile: [[1e9, 0], [5, 1]], segments: 9999, sweepDeg: 720 });
    expect(s).toMatchObject({ segments: FREEFORM_LIMITS.maxSegments, sweepDeg: 360 });
    expect((s as { profile: number[][] }).profile[0][0]).toBe(FREEFORM_LIMITS.maxSize);
  });
  it('Fehlermeldungen bei Unbrauchbarem', () => {
    expect(() => sanitizeFreeformState(null)).toThrow(/state fehlt/);
    expect(() => sanitizeFreeformState({ kind: 'lathe' })).toThrow(/Profil/);
    expect(() => sanitizeFreeformState({ kind: 'lathe', profile: [[1, 0]] })).toThrow(/mindestens 2 Punkte/);
    expect(() => sanitizeFreeformState({ kind: 'lathe', profile: [[1, 0], [NaN, 1]] })).toThrow(/endliche Zahl/);
    expect(() => sanitizeFreeformState({ kind: 'sweep', path: [{ p: [0, 0] }], height: 2, thickness: 0.2 })).toThrow(/mindestens 2 Punkte/);
    expect(() => sanitizeFreeformState({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [1, 0] }], closedPath: true, height: 2, thickness: 0.2 })).toThrow(/mindestens 3/);
    expect(() => sanitizeFreeformState({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [1, 0] }], height: 2, thickness: 0 })).toThrow(/Dicke/);
    expect(() => sanitizeFreeformState({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [1, 0] }], height: 0, thickness: 1 })).toThrow(/height/);
    expect(() => sanitizeFreeformState({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [1, 0] }], height: 2 })).toThrow(/thickness fehlt/);
    expect(() => sanitizeFreeformState({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [1, 0] }], height: 2, thickness: 1, wave: { amplitude: 1, length: 0 } })).toThrow(/wave\.length/);
    const many = Array.from({ length: FREEFORM_LIMITS.maxPoints + 1 }, (_, i) => ({ p: [i, 0] }));
    expect(() => sanitizeFreeformState({ kind: 'sweep', path: many, height: 2, thickness: 1 })).toThrow(/höchstens/);
  });
  it('Sweep-Standardwerte', () => {
    const s = sanitizeFreeformState({ kind: 'sweep', path: [{ p: [0, 0] }, { p: [1, 0] }], height: 2, thickness: 0.2 });
    expect(s).toMatchObject({ closedPath: false, heightEnd: 2, y0: 0, segments: 12 });
  });
  it('Gitter bei patch: Größe und Gleichmäßigkeit', () => {
    const row = (n: number, z: number) => Array.from({ length: n }, (_, i) => [i, 0, z]);
    expect(() => sanitizeFreeformState({ kind: 'patch', grid: [row(3, 0)] })).toThrow(/2 Zeilen/);
    expect(() => sanitizeFreeformState({ kind: 'patch', grid: [row(3, 0), row(2, 1)] })).toThrow(/gleich viele/);
    const big = Array.from({ length: FREEFORM_LIMITS.maxGrid + 1 }, (_, z) => row(3, z));
    expect(() => sanitizeFreeformState({ kind: 'patch', grid: big })).toThrow(/höchstens/);
    const ok = sanitizeFreeformState({ kind: 'patch', grid: [row(2, 0), row(2, 1)], degree: 3 });
    expect(ok).toMatchObject({ degree: 1, thickness: 0, subdivisions: [24, 24] });
  });
  it('Schnitte: Anzahl und Form', () => {
    const cut = { shape: 'box', pos: [0, 0, 0], size: [1, 1, 1] };
    const base = { kind: 'lathe', profile: [[1, 0], [1, 1]] };
    const ok = sanitizeFreeformState({ ...base, cuts: [cut, { ...cut, shape: 'sphere', rotY: 30 }] });
    expect(ok.cuts).toHaveLength(2);
    expect(ok.cuts?.[0].rotY).toBe(0);
    expect(() => sanitizeFreeformState({ ...base, cuts: Array(FREEFORM_LIMITS.maxCuts + 1).fill(cut) })).toThrow(/Schnitte/);
    expect(() => sanitizeFreeformState({ ...base, cuts: [{ ...cut, shape: 'kegel' }] })).toThrow(/shape/);
    expect(() => sanitizeFreeformState({ ...base, cuts: [{ ...cut, size: [1, 0, 1] }] })).toThrow(/größer als 0/);
    expect(() => sanitizeFreeformState({ ...base, cuts: 'x' })).toThrow(/Liste/);
  });
  it('bereinigter State lässt sich bauen', () => {
    const s = sanitizeFreeformState({ kind: 'sweep', path: [{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], height: 2, thickness: 0.2 });
    checkMesh(buildFreeformMesh(s));
  });
});
