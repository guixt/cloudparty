/**
 * Verteilung der Grashalme (rein, ohne Babylon, deterministisch aus dem Insel-Seed).
 * Ein Eintrag: x, z, Drehung, Größe, Farbvariation (je 5 Zahlen).
 */
import { createOutline, mulberry32 } from '../outline';

export const BLADE_STRIDE = 5;
export const MAX_BLADES = 60000;
export const BLADES_PER_M2 = 10;
/** Anteil des Inselradius, bis zu dem die Oberseite flach ist. */
export const FLAT_FRACTION = 0.85;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function bladeCount(radius: number, density: number): number {
  if (!(density > 0) || !(radius > 0)) return 0;
  const r = radius * FLAT_FRACTION;
  return Math.min(MAX_BLADES, Math.floor(Math.PI * r * r * BLADES_PER_M2 * Math.min(1, density)));
}

/**
 * Erzeugt die Halme. Gleicher Seed → gleiche Folge; weniger Dichte liefert ein Präfix der Folge
 * (Wechsel der Qualität lässt das Gras nicht „springen").
 */
export function generateBlades(island: { radius: number; seed: number }, density: number): Float32Array {
  const radius = Math.max(4, island.radius);
  const target = bladeCount(radius, density);
  const out = new Float32Array(target * BLADE_STRIDE);
  if (target === 0) return out;
  const seed = Math.floor(island.seed) || 0;
  const outline = createOutline(seed);
  const rnd = mulberry32(seed * 7919 + 1234567);
  const maxR = radius * FLAT_FRACTION;
  let n = 0;
  let attempts = 0;
  while (n < target && attempts < target * 3) {
    attempts += 1;
    const theta = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * maxR;
    const rotation = rnd() * Math.PI * 2;
    const size = 0.7 + rnd() * 0.7;
    const variation = rnd();
    // Randlinie der Insel kann unter 0.85 liegen: etwas Abstand zur Kante halten.
    if (r > radius * outline(theta) * 0.93) continue;
    const o = n * BLADE_STRIDE;
    out[o] = Math.cos(theta) * r;
    out[o + 1] = Math.sin(theta) * r;
    out[o + 2] = rotation;
    out[o + 3] = size;
    out[o + 4] = variation;
    n += 1;
  }
  return n === target ? out : out.slice(0, n * BLADE_STRIDE);
}

/** Entfernt Halme innerhalb der Rechtecke (XZ). */
export function filterBlades(blades: Float32Array, rects: readonly Rect[]): Float32Array {
  if (rects.length === 0) return blades;
  const out = new Float32Array(blades.length);
  let n = 0;
  for (let i = 0; i < blades.length; i += BLADE_STRIDE) {
    const x = blades[i];
    const z = blades[i + 1];
    let hidden = false;
    for (const r of rects) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        hidden = true;
        break;
      }
    }
    if (hidden) continue;
    for (let k = 0; k < BLADE_STRIDE; k++) out[n + k] = blades[i + k];
    n += BLADE_STRIDE;
  }
  return out.slice(0, n);
}

/** Schreibt Instanz-Matrizen (16 Zahlen) und Farbfaktoren (4 Zahlen) für Thin Instances. */
export function bladesToBuffers(blades: Float32Array): { matrices: Float32Array; colors: Float32Array } {
  const count = blades.length / BLADE_STRIDE;
  const matrices = new Float32Array(count * 16);
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const x = blades[i * BLADE_STRIDE];
    const z = blades[i * BLADE_STRIDE + 1];
    const rot = blades[i * BLADE_STRIDE + 2];
    const s = blades[i * BLADE_STRIDE + 3];
    const v = blades[i * BLADE_STRIDE + 4];
    const c = Math.cos(rot) * s;
    const sn = Math.sin(rot) * s;
    const m = i * 16;
    matrices[m] = c;
    matrices[m + 2] = -sn;
    matrices[m + 5] = s * (0.85 + 0.3 * v);
    matrices[m + 8] = sn;
    matrices[m + 10] = c;
    matrices[m + 12] = x;
    matrices[m + 14] = z;
    matrices[m + 15] = 1;
    const o = i * 4;
    colors[o] = 0.88 + 0.26 * v;
    colors[o + 1] = 0.94 + 0.1 * (1 - v);
    colors[o + 2] = 0.9 + 0.1 * v;
    colors[o + 3] = 1;
  }
  return { matrices, colors };
}
