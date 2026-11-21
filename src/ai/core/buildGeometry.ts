/**
 * Reine Rechenfunktionen für die KI-Bauwerkzeuge (ohne Szene, gut testbar).
 * Koordinaten: Meter, Y oben. Drehung um Y mit Winkel ψ bildet +X auf (cos ψ, 0, −sin ψ) und +Z auf (sin ψ, 0, cos ψ) ab
 * (wie Babylon; die Quaternionen sind [x, y, z, w]).
 */
import type { Quat, Vec3 } from '../../../shared/types';

const DEG = Math.PI / 180;

export function yawQuat(yawDeg: number): Quat {
  const h = (yawDeg * DEG) / 2;
  return [0, Math.sin(h), 0, Math.cos(h)];
}

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

/** Wendet die Drehung q auf den Vektor v an. */
export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const cx = y * v[2] - z * v[1];
  const cy = z * v[0] - x * v[2];
  const cz = x * v[1] - y * v[0];
  const dx = y * cz - z * cy;
  const dy = z * cx - x * cz;
  const dz = x * cy - y * cx;
  return [v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz)];
}

const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

export interface BeamTransform {
  center: Vec3;
  /** Größe der Grundform (Zylinder/Box, Längsachse = Y): [Dicke, Länge, Dicke]. */
  scale: Vec3;
  rot: Quat;
  length: number;
}

/** Ein Balken von a nach b: Mitte, Länge und Drehung (+Y zeigt von a nach b). */
export function beamTransform(a: Vec3, b: Vec3, thickness: number): BeamTransform {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = norm(d);
  const dir: Vec3 = length === 0 ? [0, 1, 0] : [d[0] / length, d[1] / length, d[2] / length];
  const dot = dir[1]; // up · dir
  let rot: Quat;
  if (dot > 0.999999) rot = [0, 0, 0, 1];
  else if (dot < -0.999999) rot = [1, 0, 0, 0]; // 180° um X
  else {
    // Drehachse = up × dir
    const c: Vec3 = [dir[2], 0, -dir[0]];
    const q: Quat = [c[0], c[1], c[2], 1 + dot];
    const n = Math.hypot(q[0], q[1], q[2], q[3]);
    rot = [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  return { center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], scale: [thickness, length, thickness], rot, length };
}

export interface Opening {
  /** Abstand vom Wandanfang (m). */
  at: number;
  width: number;
  height: number;
  /** Höhe der Unterkante über dem Wandfuß (Fenster); 0 = Tür. */
  sill?: number;
}

export interface WallPiece {
  center: Vec3;
  /** [Länge entlang der Wand, Höhe, Dicke] */
  size: Vec3;
  yawDeg: number;
}

export class GeometryError extends Error {}

/** Wand von a nach b (x, z) aus Boxen; um Öffnungen herum zusammengesetzt. */
export function wallPieces(a: [number, number], b: [number, number], height: number, thickness: number, y0: number, openings: Opening[] = []): WallPiece[] {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L = Math.hypot(dx, dz);
  if (L < 0.2) throw new GeometryError('Die Wand ist zu kurz (mindestens 0,2 m).');
  const yawDeg = Math.atan2(-dz, dx) / DEG;
  const ux = dx / L;
  const uz = dz / L;
  const sorted = [...openings].sort((p, q) => p.at - q.at);
  let prevEnd = 0;
  sorted.forEach((o, i) => {
    const sill = o.sill ?? 0;
    if (o.width < 0.1 || o.height < 0.1) throw new GeometryError(`Öffnung ${i + 1}: Breite und Höhe müssen mindestens 0,1 m sein.`);
    if (o.at < 0 || o.at + o.width > L + 1e-6) throw new GeometryError(`Öffnung ${i + 1} liegt nicht auf der Wand (Wandlänge ${L.toFixed(2)} m).`);
    if (sill < 0 || sill + o.height > height + 1e-6) throw new GeometryError(`Öffnung ${i + 1} ist höher als die Wand (${height} m).`);
    if (o.at < prevEnd - 1e-6) throw new GeometryError(`Öffnung ${i + 1} überlappt die vorherige.`);
    prevEnd = o.at + o.width;
  });

  const pieces: WallPiece[] = [];
  const add = (u0: number, u1: number, v0: number, v1: number) => {
    if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) return;
    const um = (u0 + u1) / 2;
    pieces.push({ center: [a[0] + ux * um, y0 + (v0 + v1) / 2, a[1] + uz * um], size: [u1 - u0, v1 - v0, thickness], yawDeg });
  };
  let cursor = 0;
  for (const o of sorted) {
    const sill = o.sill ?? 0;
    add(cursor, o.at, 0, height);
    add(o.at, o.at + o.width, 0, sill); // Brüstung unter einem Fenster
    add(o.at, o.at + o.width, sill + o.height, height); // Sturz über Tür/Fenster
    cursor = o.at + o.width;
  }
  add(cursor, L, 0, height);
  return pieces;
}

export interface ArrayItem {
  pos: Vec3;
  yawDeg: number;
}

export type ArrayPattern =
  | { pattern: 'circle'; count: number; radius: number; center: Vec3; startDeg?: number; faceCenter?: boolean }
  | { pattern: 'line'; count: number; start: Vec3; step: Vec3 }
  | { pattern: 'grid'; rows: number; cols: number; spacing: [number, number]; origin: Vec3 };

export function arrayItems(spec: ArrayPattern): ArrayItem[] {
  if (spec.pattern === 'line') {
    return Array.from({ length: spec.count }, (_, i) => ({ pos: [spec.start[0] + spec.step[0] * i, spec.start[1] + spec.step[1] * i, spec.start[2] + spec.step[2] * i] as Vec3, yawDeg: 0 }));
  }
  if (spec.pattern === 'grid') {
    const items: ArrayItem[] = [];
    for (let r = 0; r < spec.rows; r++) for (let c = 0; c < spec.cols; c++) items.push({ pos: [spec.origin[0] + c * spec.spacing[0], spec.origin[1], spec.origin[2] + r * spec.spacing[1]], yawDeg: 0 });
    return items;
  }
  const items: ArrayItem[] = [];
  for (let i = 0; i < spec.count; i++) {
    const phi = ((spec.startDeg ?? 0) + (360 / spec.count) * i) * DEG;
    const px = spec.center[0] + Math.cos(phi) * spec.radius;
    const pz = spec.center[2] + Math.sin(phi) * spec.radius;
    // +Z des Objekts zeigt zur Mitte
    const yawDeg = spec.faceCenter ? Math.atan2(spec.center[0] - px, spec.center[2] - pz) / DEG : 0;
    items.push({ pos: [px, spec.center[1], pz], yawDeg });
  }
  return items;
}

export type Mirror = 'x' | 'z' | undefined;

/** Verschiebt, spiegelt und dreht einen Punkt um `pivot` (x, z); y bleibt bis auf `offset`. */
export function transformPoint(p: Vec3, pivot: [number, number], yawDeg: number, mirror: Mirror, offset: Vec3): Vec3 {
  let x = p[0] - pivot[0];
  const y = p[1];
  let z = p[2] - pivot[1];
  if (mirror === 'x') x = -x;
  if (mirror === 'z') z = -z;
  const r = rotateVec(yawQuat(yawDeg), [x, 0, z]);
  return [pivot[0] + r[0] + offset[0], y + offset[1], pivot[1] + r[2] + offset[2]];
}

export function transformRotation(q: Quat, yawDeg: number, mirror: Mirror): Quat {
  let m: Quat = q;
  if (mirror === 'x') m = [q[0], -q[1], -q[2], q[3]];
  if (mirror === 'z') m = [-q[0], -q[1], q[2], q[3]];
  return quatMul(yawQuat(yawDeg), m);
}

export interface Box {
  min: Vec3;
  max: Vec3;
}

/** Achsenparalleler Rahmen um eine (gedrehte) Box mit Mitte `center` und voller Größe `size`. */
export function rotatedBox(center: Vec3, size: Vec3, rot: Quat): Box {
  const h: Vec3 = [Math.abs(size[0]) / 2, Math.abs(size[1]) / 2, Math.abs(size[2]) / 2];
  const ex = rotateVec(rot, [1, 0, 0]);
  const ey = rotateVec(rot, [0, 1, 0]);
  const ez = rotateVec(rot, [0, 0, 1]);
  const half: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) half[k] = Math.abs(ex[k]) * h[0] + Math.abs(ey[k]) * h[1] + Math.abs(ez[k]) * h[2];
  return { min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]], max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]] };
}

export function unionBox(boxes: Box[]): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], b.min[k]);
    max[k] = Math.max(max[k], b.max[k]);
  }
  return { min, max };
}
