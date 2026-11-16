/** Sonderformen für Klemmbausteine: Schrägstein (Prisma) und Rad. */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { PLATE_H, STUD } from '../../../shared/bricks';

/**
 * Schrägstein: Breite w (x), Tiefe d (z), Höhe h. Hinten (−z) eine Noppenreihe flach, davor fällt die Oberseite
 * bis auf eine Platte Höhe ab (vorn bei +z). Ursprung: Mitte der Grundfläche, Unterkante.
 */
export function createSlope(scene: Scene, w: number, d: number, h: number): Mesh {
  const front = PLATE_H;
  // Profil in (z, y), gegen den Uhrzeigersinn von der Seite (+x) gesehen.
  const prof: [number, number][] = [
    [-d / 2, 0],
    [d / 2, 0],
    [d / 2, front],
    [-d / 2 + STUD, h],
    [-d / 2, h],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const quad = (a: number[], b: number[], c: number[], dd: number[], n: number[]) => {
    const base = positions.length / 3;
    for (const v of [a, b, c, dd]) {
      positions.push(...v);
      normals.push(...n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const x0 = -w / 2;
  const x1 = w / 2;
  // Seitenflächen (Kappen) als Fächer um Punkt 0.
  for (const [x, nx] of [[x1, 1], [x0, -1]] as const) {
    const order = nx === 1 ? [0, 1, 2, 3, 4] : [0, 4, 3, 2, 1];
    for (let i = 1; i < order.length - 1; i++) {
      const base = positions.length / 3;
      for (const k of [order[0], order[i], order[i + 1]]) {
        positions.push(x, prof[k][1], prof[k][0]);
        normals.push(nx, 0, 0);
      }
      indices.push(base, base + 1, base + 2);
    }
  }
  // Mantel: jede Profilkante als Rechteck.
  for (let i = 0; i < prof.length; i++) {
    const [za, ya] = prof[i];
    const [zb, yb] = prof[(i + 1) % prof.length];
    const dz = zb - za;
    const dy = yb - ya;
    const len = Math.hypot(dz, dy) || 1;
    const n = [0, dz / len, -dy / len]; // nach außen (Profil gegen den Uhrzeigersinn)
    quad([x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za], n);
  }
  const mesh = new Mesh('slope', scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.applyToMesh(mesh);
  return mesh;
}
