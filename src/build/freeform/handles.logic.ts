/**
 * Kontrollpunkt-Griffe für Freiformen: reine Logik ohne Babylon (Punkt <-> Weltpunkt, Ebenen-Schnitt,
 * neuer State aus Griffposition). Koordinaten des States sind lokal zur Entity (Ursprung am Boden).
 */
import { sanitizeFreeformState, type FreeformState } from '../../../shared/freeform';
import type { Quat, Transform, Vec3 } from '../../../shared/types';

/** Welcher Punkt des States ein Griff bearbeitet. */
export type HandleRef =
  | { kind: 'sweep'; index: number }
  | { kind: 'lathe'; index: number }
  | { kind: 'patch'; row: number; col: number };

export interface HandleInfo {
  ref: HandleRef;
  /** Position lokal zur Entity. */
  local: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Dreht v mit Quaternion q = [x, y, z, w]. */
export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // t = 2 * cross(q.xyz, v); v' = v + w*t + cross(q.xyz, t)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

const conj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function localToWorld(t: Transform, p: Vec3): Vec3 {
  const r = rotateVec(t.rot, [p[0] * t.scale[0], p[1] * t.scale[1], p[2] * t.scale[2]]);
  return [r[0] + t.pos[0], r[1] + t.pos[1], r[2] + t.pos[2]];
}

export function worldToLocal(t: Transform, p: Vec3): Vec3 {
  const r = rotateVec(conj(t.rot), sub(p, t.pos));
  const inv = (s: number) => (Math.abs(s) < 1e-9 ? 0 : 1 / s);
  return [r[0] * inv(t.scale[0]), r[1] * inv(t.scale[1]), r[2] * inv(t.scale[2])];
}

/** Schnitt eines Strahls mit einer Ebene (Punkt + Normale); null bei Parallelität oder Treffer hinter dem Ursprung. */
export function rayPlane(origin: Vec3, dir: Vec3, planePoint: Vec3, normal: Vec3): Vec3 | null {
  const denom = dot(dir, normal);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot(sub(planePoint, origin), normal) / denom;
  if (!Number.isFinite(t) || t < 0) return null;
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

export type DragPlane = 'horizontal' | 'camera' | 'profile';

/**
 * Ziehebene (Normale in Welt) durch den Griffpunkt:
 * - Sweep: immer horizontal (der Pfad liegt im Grundriss).
 * - Drehkörper: Ebene der Profilachse (enthält lokale X- und Y-Achse der Entity, Normale = lokale Z).
 * - Fläche: standardmäßig kamera-parallel; mit Shift horizontal.
 */
export function dragPlaneNormal(state: FreeformState, t: Transform, cameraForward: Vec3, shift: boolean): { plane: DragPlane; normal: Vec3 } {
  if (state.kind === 'sweep') return { plane: 'horizontal', normal: [0, 1, 0] };
  if (state.kind === 'lathe') return { plane: 'profile', normal: rotateVec(t.rot, [0, 0, 1]) };
  if (shift) return { plane: 'horizontal', normal: [0, 1, 0] };
  return { plane: 'camera', normal: cameraForward };
}

export function snapTo(v: number, step: number): number {
  return step > 0 ? Math.round(v / step) * step : v;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** Alle Griffe eines States (lokale Positionen). Sweep: Mitte der Wandhöhe; Drehkörper: auf der +X-Achse. */
export function handlesOf(state: FreeformState): HandleInfo[] {
  switch (state.kind) {
    case 'sweep': {
      const y = (state.y0 ?? 0) + state.height / 2;
      return state.path.map((pt, index) => ({ ref: { kind: 'sweep', index }, local: [pt.p[0], y, pt.p[1]] }));
    }
    case 'lathe':
      return state.profile.map((pt, index) => ({ ref: { kind: 'lathe', index }, local: [pt[0], pt[1], 0] }));
    case 'patch': {
      const out: HandleInfo[] = [];
      state.grid.forEach((row, r) => row.forEach((p, c) => out.push({ ref: { kind: 'patch', row: r, col: c }, local: [p[0], p[1], p[2]] })));
      return out;
    }
  }
}

/**
 * Neuer State, wenn der Griff nach `local` (lokal zur Entity) verschoben wird. Gibt null zurück, wenn der
 * Griff nicht mehr zum State passt oder das Ergebnis `sanitizeFreeformState` nicht besteht (Bewegung verwerfen).
 */
export function applyHandle(state: FreeformState, ref: HandleRef, local: Vec3, snapStep = 0): FreeformState | null {
  const [x, y, z] = local.map((v) => round(snapTo(v, snapStep))) as Vec3;
  if (![x, y, z].every(Number.isFinite)) return null;
  const next = structuredClone(state) as FreeformState;
  if (next.kind === 'sweep' && ref.kind === 'sweep') {
    const pt = next.path[ref.index];
    if (!pt) return null;
    pt.p = [x, z];
  } else if (next.kind === 'lathe' && ref.kind === 'lathe') {
    const pt = next.profile[ref.index];
    if (!pt || x < 0) return null;
    next.profile[ref.index] = [x, y];
  } else if (next.kind === 'patch' && ref.kind === 'patch') {
    const row = next.grid[ref.row];
    if (!row || !row[ref.col]) return null;
    row[ref.col] = [x, y, z];
  } else return null;
  try {
    return sanitizeFreeformState(next);
  } catch {
    return null;
  }
}
