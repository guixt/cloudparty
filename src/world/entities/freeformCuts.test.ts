import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it, vi } from 'vitest';
import type { CutOp } from '../../../shared/freeform/types';
import { boxMeshData } from '../../../shared/freeform/util';
import { applyCuts } from './freeformCuts';

function boxMesh(scene: Scene, min: [number, number, number] = [-1, -1, -1], max: [number, number, number] = [1, 1, 1]) {
  const mesh = new Mesh('ff', scene);
  const d = boxMeshData(min, max);
  const vd = new VertexData();
  vd.positions = d.positions;
  vd.normals = d.normals;
  vd.uvs = d.uvs;
  vd.indices = d.indices;
  vd.applyToMesh(mesh);
  mesh.material = new PBRMaterial('m', scene);
  return mesh;
}
const scene = () => new Scene(new NullEngine());
const tris = (m: Mesh) => m.getTotalIndices() / 3;
const cyl: CutOp = { shape: 'cylinder', pos: [0, 0, 0], size: [0.6, 4, 0.6] };

describe('applyCuts', () => {
  it('Zylinder-Schnitt erzeugt mehr Dreiecke, Hülle bleibt', () => {
    const s = scene();
    const mesh = boxMesh(s);
    const before = tris(mesh);
    const out = applyCuts(mesh, [cyl], s);
    expect(tris(out)).toBeGreaterThan(before);
    out.refreshBoundingInfo();
    const b = out.getBoundingInfo().boundingBox;
    expect(b.minimum.x).toBeCloseTo(-1, 3);
    expect(b.maximum.y).toBeCloseTo(1, 3);
    expect(out.getVerticesData('uv')!.length).toBe(out.getTotalVertices() * 2);
    expect(out.getVerticesData('normal')!.length).toBe(out.getTotalVertices() * 3);
    expect(mesh.isDisposed()).toBe(true);
  });

  it('Umlaufrichtung des Eingabenetzes bleibt erhalten', () => {
    const s = scene();
    const mesh = boxMesh(s);
    const before = Array.from(mesh.getIndices()!.slice(0, 3));
    const unchanged = applyCuts(mesh, [{ shape: 'box', pos: [10, 10, 10], size: [1, 1, 1] }], s);
    const out = applyCuts(unchanged, [cyl], s);
    // Die Hülle bleibt gleich orientiert: gleiches Volumenvorzeichen wie das Original (positiv bei boxMeshData).
    const p = out.getVerticesData('position')!;
    const ix = out.getIndices()!;
    let v = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    expect(before.length).toBe(3);
    expect(v).toBeGreaterThan(0);
  });

  it('Schnitt außerhalb ändert die Gestalt nicht', () => {
    const s = scene();
    const out = applyCuts(boxMesh(s), [{ shape: 'box', pos: [10, 10, 10], size: [1, 1, 1] }], s);
    expect(out.getTotalVertices()).toBeGreaterThan(0);
    expect(tris(out)).toBeLessThan(40);
  });

  it('ungültige Eingaben liefern das unveränderte Netz', () => {
    const s = scene();
    const mesh = boxMesh(s);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(applyCuts(mesh, [], s)).toBe(mesh);
    expect(applyCuts(mesh, [{ shape: 'box', pos: [NaN, 0, 0], size: [1, 1, 1] }], s)).toBe(mesh);
    warn.mockRestore();
  });

  it('mehr als 8 Schnitte: nur 8 angewandt', () => {
    const s = scene();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const one = (i: number): CutOp => ({ shape: 'cylinder', pos: [-4 + i * 0.8, 0, 0], size: [0.4, 4, 0.4] });
    const wide = () => boxMesh(s, [-5, -1, -5], [5, 1, 5]);
    const eight = applyCuts(wide(), Array.from({ length: 8 }, (_, i) => one(i)), s);
    const ten = applyCuts(wide(), Array.from({ length: 10 }, (_, i) => one(i)), s);
    expect(tris(ten)).toBe(tris(eight));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Eltern und Material bleiben; Schnitt sitzt lokal bei verschobenem Elternknoten', () => {
    const s = scene();
    const mesh = boxMesh(s);
    const parent = new TransformNode('p', s);
    parent.position.set(5, 2, -3);
    mesh.parent = parent;
    const mat = mesh.material;
    const out = applyCuts(mesh, [{ shape: 'box', pos: [0, 0, 0], size: [0.5, 4, 0.5] }], s);
    expect(out.parent).toBe(parent);
    expect(out.material).toBe(mat);
    const pos = out.getVerticesData('position')!;
    let wall = 0;
    for (let i = 0; i < pos.length; i += 3)
      if (Math.abs(Math.abs(pos[i]) - 0.25) < 0.01 && Math.abs(pos[i + 2]) <= 0.26) wall++;
    expect(wall).toBeGreaterThan(0);
    expect(out.position.x).toBeCloseTo(0, 5);
  });

  it('Dauer eines Schnitts bei ca. 2000 Dreiecken (Ausgabe)', () => {
    const s = scene();
    const mesh = new Mesh('big', s);
    const sub = 32;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= sub; j++) for (let i = 0; i <= sub; i++) positions.push(i / 4 - 4, 0, j / 4 - 4);
    for (let j = 0; j < sub; j++)
      for (let i = 0; i < sub; i++) {
        const a = j * (sub + 1) + i;
        indices.push(a, a + sub + 1, a + 1, a + 1, a + sub + 1, a + sub + 2);
      }
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = positions.map((_, k) => (k % 3 === 1 ? 1 : 0));
    vd.applyToMesh(mesh);
    const t0 = performance.now();
    const out = applyCuts(mesh, [{ shape: 'cylinder', pos: [0, 0, 0], size: [2, 2, 2] }], s);
    console.log(`[freeform] 1 Schnitt, ${sub * sub * 2} Dreiecke -> ${tris(out)}: ${(performance.now() - t0).toFixed(0)} ms`);
    expect(out.getTotalVertices()).toBeGreaterThan(0);
  });
});
