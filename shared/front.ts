/**
 * Objekte mit einer Vorderseite (Tafeln, Spiegel): Die Vorderseite zeigt in die lokale +Z-Richtung des Objekts.
 * Die Rückseite ist leer. Deshalb muss man wissen, wohin das Objekt „schaut“.
 */
import type { Quat, Vec3 } from './types';

export function hasFront(ref: string): boolean {
  return /^EntitySpec\.media-/.test(ref) || ref === 'EntitySpec.mirror';
}

/** Weltrichtung der Vorderseite (Einheitsvektor, +Z gedreht um die Entity-Drehung). */
export function frontDirection(rot: readonly number[]): Vec3 {
  const [x, y, z, w] = rot as Quat;
  // Drehung von (0, 0, 1) mit dem Quaternion
  const vx = 2 * (x * z + w * y);
  const vy = 2 * (y * z - w * x);
  const vz = 1 - 2 * (x * x + y * y);
  return [vx, vy, vz];
}

/** Himmelsrichtung der Vorderseite für Texte: z. B. „−z (nach Norden)“; Norden = kleineres z. */
export function describeFront(dir: readonly number[]): string {
  const [x, , z] = dir;
  const yaw = (Math.atan2(x, z) * 180) / Math.PI;
  const r = Math.round(((yaw % 360) + 360) % 360);
  return `Blick nach ${Math.abs(x) < 0.05 ? '' : x > 0 ? '+x' : '−x'}${Math.abs(x) >= 0.05 && Math.abs(z) >= 0.05 ? '/' : ''}${Math.abs(z) < 0.05 ? '' : z > 0 ? '+z' : '−z'} (Drehung um Y: ${r}°)`;
}

/** Drehung um Y in Grad, sodass die Vorderseite (+Z) von (px, pz) aus zum Punkt (tx, tz) schaut. */
export function yawToward(px: number, pz: number, tx: number, tz: number): number {
  const dx = tx - px;
  const dz = tz - pz;
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}
