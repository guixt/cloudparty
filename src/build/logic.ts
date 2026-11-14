/** Reine Rechenlogik des Build-Modus (ohne Babylon, gut testbar). */
import type { Quat, Vec3 } from '../../shared/types';

export const SNAP_POSITION = 0.25;
export const SNAP_ROTATION_DEG = 15;
export const SNAP_SCALE = 0.25;

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Rastet einen Wert auf das nächste Vielfache von step ein (step <= 0: unverändert). */
export function snapValue(value: number, step: number): number {
  if (!(step > 0)) return value;
  return round6(Math.round(value / step) * step) + 0;
}
export function snapVec3(v: Vec3, step: number): Vec3 {
  return [snapValue(v[0], step), snapValue(v[1], step), snapValue(v[2], step)];
}

const DEG = Math.PI / 180;

/** Euler (Grad, Reihenfolge wie Babylon: erst Z, dann X, dann Y) → Quaternion [x, y, z, w]. */
export function quatFromEulerDeg(xDeg: number, yDeg: number, zDeg: number): Quat {
  const hp = xDeg * DEG * 0.5;
  const hy = yDeg * DEG * 0.5;
  const hr = zDeg * DEG * 0.5;
  const sp = Math.sin(hp), cp = Math.cos(hp);
  const sy = Math.sin(hy), cy = Math.cos(hy);
  const sr = Math.sin(hr), cr = Math.cos(hr);
  return [
    cy * sp * cr + sy * cp * sr,
    sy * cp * cr - cy * sp * sr,
    cy * cp * sr - sy * sp * cr,
    cy * cp * cr + sy * sp * sr,
  ];
}

/** Quaternion → Euler in Grad [x, y, z] (Gegenstück zu quatFromEulerDeg). */
export function eulerDegFromQuat(q: Quat): Vec3 {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const x = q[0] / len, y = q[1] / len, z = q[2] / len, w = q[3] / len;
  const sinP = Math.max(-1, Math.min(1, 2 * (w * x - y * z)));
  const pitch = Math.asin(sinP);
  // Am Gimbal-Lock (X = ±90°) sind Gier und Rollen nicht unabhängig; die Formeln liefern dann einen gültigen Näherungswert.
  const yaw = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
  const roll = Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z));
  return [round6(pitch / DEG) + 0, round6(yaw / DEG) + 0, round6(roll / DEG) + 0];
}

export type PlacementAnchor = 'center' | 'ground';

/**
 * Höhe (y) der Entity-Position, damit sie auf einer Fläche bei surfaceY ruht.
 * Grundformen sind um ihren Mittelpunkt gebaut (Halbhöhe = baseHeight * scaleY / 2),
 * zusammengesetzte Prefabs haben ihren Ursprung am Boden.
 */
export function placementY(surfaceY: number, anchor: PlacementAnchor, scaleY: number, baseHeight = 1): number {
  if (anchor === 'ground') return surfaceY;
  return surfaceY + (baseHeight * Math.abs(scaleY)) / 2;
}

/** Ziel im Raum für Platzierung ohne Treffer: 6 m vor der Kamera auf Höhe 0. */
export function fallbackPoint(origin: Vec3, forward: Vec3, distance = 6): Vec3 {
  const h = Math.hypot(forward[0], forward[2]) || 1;
  return [origin[0] + (forward[0] / h) * distance, 0, origin[2] + (forward[2] / h) * distance];
}

export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '0';
  return String(Number(value.toFixed(digits)));
}
