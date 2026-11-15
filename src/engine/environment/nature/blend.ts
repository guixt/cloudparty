/** Mischen von Himmels-Looks (rein, ohne Babylon). */
import type { Rgb, SkyLook } from '../presets';

const toLin = (a: Rgb): Rgb => [Math.pow(a[0], 2.2), Math.pow(a[1], 2.2), Math.pow(a[2], 2.2)];
const toGamma = (a: Rgb): Rgb => [Math.pow(Math.max(0, a[0]), 1 / 2.2), Math.pow(Math.max(0, a[1]), 1 / 2.2), Math.pow(Math.max(0, a[2]), 1 / 2.2)];

function mixLinear(a: Rgb, b: Rgb, t: number): Rgb {
  const la = toLin(a);
  const lb = toLin(b);
  return toGamma([la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t]);
}

/**
 * Mischt zwei Looks: Farben im linearen Raum (die Looks speichern Anzeigefarben, Gamma 2.2), Zahlen linear.
 * t ≤ 0 ergibt a, t ≥ 1 ergibt b (Kopien).
 */
export function blendLooks(a: SkyLook, b: SkyLook, t: number): SkyLook {
  const k = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  if (k <= 0) return cloneLook(a);
  if (k >= 1) return cloneLook(b);
  const out = {} as Record<string, number | Rgb>;
  for (const key of Object.keys(a) as (keyof SkyLook)[]) {
    const va = a[key];
    const vb = b[key];
    out[key] = Array.isArray(va) ? mixLinear(va as Rgb, vb as Rgb, k) : (va as number) + ((vb as number) - (va as number)) * k;
  }
  return out as unknown as SkyLook;
}

function cloneLook(look: SkyLook): SkyLook {
  const out = {} as Record<string, number | Rgb>;
  for (const key of Object.keys(look) as (keyof SkyLook)[]) {
    const v = look[key];
    out[key] = Array.isArray(v) ? ([v[0], v[1], v[2]] as Rgb) : (v as number);
  }
  return out as unknown as SkyLook;
}
