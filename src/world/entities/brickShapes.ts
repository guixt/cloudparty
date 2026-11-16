/** Sonderformen für Klemmbausteine: Schrägstein, Bogenstein, umgedrehte Schräge, Radlauf, Viertelrundung, Kuppel. */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
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

const ARC_STEPS = 12;

type Pt = [number, number];

/**
 * Prisma aus konvexen Profilstücken (z, y), Breite w entlang x. Jedes Stück liegt gegen den Uhrzeigersinn (von +x gesehen).
 * Flache Normalen je Fläche; der Mantel jedes Stücks entsteht aus seinen Kanten.
 */
function prism(scene: Scene, name: string, w: number, pieces: Pt[][]): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const x0 = -w / 2;
  const x1 = w / 2;
  for (const prof of pieces) {
    for (const [x, nx] of [[x1, 1], [x0, -1]] as const) {
      const order = nx === 1 ? prof.map((_, i) => i) : prof.map((_, i) => (i === 0 ? 0 : prof.length - i));
      for (let i = 1; i < order.length - 1; i++) {
        const base = positions.length / 3;
        for (const k of [order[0], order[i], order[i + 1]]) {
          positions.push(x, prof[k][1], prof[k][0]);
          normals.push(nx, 0, 0);
        }
        indices.push(base, base + 1, base + 2);
      }
    }
    for (let i = 0; i < prof.length; i++) {
      const [za, ya] = prof[i];
      const [zb, yb] = prof[(i + 1) % prof.length];
      const dz = zb - za;
      const dy = yb - ya;
      const len = Math.hypot(dz, dy);
      if (len < 1e-6) continue;
      const base = positions.length / 3;
      for (const v of [[x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za]]) {
        positions.push(...v);
        normals.push(0, dz / len, -dy / len);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.applyToMesh(mesh);
  return mesh;
}

/** Bogenstein: hinten (−z) eine flache Noppenreihe, davor fällt die Oberseite als Viertelellipse bis eine Platte Höhe ab. */
export function createCurvedSlope(scene: Scene, w: number, d: number, h: number): Mesh {
  const front = PLATE_H;
  const cz = -d / 2 + STUD;
  const a = d / 2 - cz; // Halbachse in z
  const b = h - front; // Halbachse in y
  const arc: Pt[] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = (Math.PI / 2) * (1 - i / ARC_STEPS); // von vorn unten (t = π/2) nach hinten oben (t = 0)
    arc.push([cz + a * Math.sin(t), front + b * Math.cos(t)]);
  }
  return prism(scene, 'curvedSlope', w, [[[-d / 2, 0], [d / 2, 0], ...arc, [-d / 2, h]]]);
}

/** Umgedrehte Schräge: Oberseite flach (alle Noppen), Unterseite steigt nach vorn (+z) auf eine Platte unter der Oberkante. */
export function createInvertedSlope(scene: Scene, w: number, d: number, h: number): Mesh {
  return prism(scene, 'invertedSlope', w, [[[-d / 2, 0], [-d / 2 + STUD, 0], [d / 2, h - PLATE_H], [d / 2, h], [-d / 2, h]]]);
}

/** Radlauf: Länge d (z), Dicke w (x), unten ein Halbkreis-Ausschnitt mit Radius r (Mitte in der Mitte der Länge). */
export function createArch(scene: Scene, w: number, d: number, h: number): Mesh {
  const r = Math.min(h, d / 2 - 0.05);
  const pieces: Pt[][] = [];
  if (r < d / 2) {
    pieces.push([[-d / 2, 0], [-r, 0], [-r, h], [-d / 2, h]]);
    pieces.push([[r, 0], [d / 2, 0], [d / 2, h], [r, h]]);
  }
  for (let i = 0; i < ARC_STEPS; i++) {
    const za = -r * Math.cos((Math.PI * i) / ARC_STEPS);
    const zb = -r * Math.cos((Math.PI * (i + 1)) / ARC_STEPS);
    const ya = r * Math.sin((Math.PI * i) / ARC_STEPS);
    const yb = r * Math.sin((Math.PI * (i + 1)) / ARC_STEPS);
    pieces.push([[za, ya], [zb, yb], [zb, h], [za, h]]);
  }
  return prism(scene, 'arch', w, pieces);
}

/** Viertelrundung: Grundfläche ein Viertelkreis (Radius n Noppen) um die Ecke bei (−x, −z); die Rundung zeigt nach +x/+z. */
export function createQuarter(scene: Scene, n: number, h: number): Mesh {
  const r = n * STUD;
  const corner: Pt = [-r / 2, -r / 2]; // (x, z)
  const arc: Pt[] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = ((Math.PI / 2) * i) / ARC_STEPS;
    arc.push([corner[0] + r * Math.cos(t), corner[1] + r * Math.sin(t)]);
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const tri = (a: number[], b: number[], c: number[], nrm: number[]) => {
    const base = positions.length / 3;
    positions.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) normals.push(...nrm);
    indices.push(base, base + 1, base + 2);
  };
  for (let i = 0; i < ARC_STEPS; i++) {
    const [xa, za] = arc[i];
    const [xb, zb] = arc[i + 1];
    tri([corner[0], h, corner[1]], [xb, h, zb], [xa, h, za], [0, 1, 0]); // Oberseite
    tri([corner[0], 0, corner[1]], [xa, 0, za], [xb, 0, zb], [0, -1, 0]); // Unterseite
    // Rundung (Normalen nach außen)
    const nx = (xa + xb) / 2 - corner[0];
    const nz = (za + zb) / 2 - corner[1];
    const nl = Math.hypot(nx, nz);
    const nrm = [nx / nl, 0, nz / nl];
    tri([xa, 0, za], [xa, h, za], [xb, h, zb], nrm);
    tri([xa, 0, za], [xb, h, zb], [xb, 0, zb], nrm);
  }
  // Zwei gerade Wände (an −z bei z = corner und an −x bei x = corner)
  const [xe, ze] = arc[ARC_STEPS]; // Ende (x = corner, z = corner + r)
  const [xs, zs] = arc[0]; // Start (x = corner + r, z = corner)
  tri([corner[0], 0, corner[1]], [xs, h, zs], [xs, 0, zs], [0, 0, -1]);
  tri([corner[0], 0, corner[1]], [corner[0], h, corner[1]], [xs, h, zs], [0, 0, -1]);
  tri([corner[0], 0, corner[1]], [xe, 0, ze], [xe, h, ze], [-1, 0, 0]);
  tri([corner[0], 0, corner[1]], [xe, h, ze], [corner[0], h, corner[1]], [-1, 0, 0]);
  const mesh = new Mesh('quarter', scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.applyToMesh(mesh);
  return mesh;
}

/** Kuppel: Halbkugel mit Durchmesser n Noppen, auf die Höhe h gestaucht. Ursprung: Mitte der Grundfläche. */
export function createDome(scene: Scene, n: number, h: number): Mesh {
  const d = n * STUD;
  const mesh = CreateSphere('dome', { diameter: d, segments: 24, slice: 0.5 }, scene);
  mesh.scaling.y = h / (d / 2);
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}
