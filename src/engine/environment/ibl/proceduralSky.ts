/**
 * Prozedurale Himmels-Würfeltextur (ohne Babylon): spiegelt den Himmels-Shader (Verlauf Horizont/Zenit/Boden plus
 * Sonne) in sechs kleine Flächen. Dient als billiger Ersatz der Sonde und liefert die Kugelfunktionen (Umgebungslicht).
 */
import { luminance, type SkySample } from './logic';
import type { Rgb } from '../presets';

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mixc = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const GROUND_DIM = 0.55;

/** Farbe (linear, HDR) des Himmels in Richtung `d` (normalisiert). */
export function skyColorAt(sky: SkySample, d: [number, number, number]): Rgb {
  const h = d[1];
  let col: Rgb;
  if (h >= 0) {
    col = mixc(sky.horizon, sky.mid, smoothstep(0, 0.3, h));
    col = mixc(col, sky.top, smoothstep(0.2, 0.85, h));
  } else {
    // Unterhalb des Horizonts liegt die (dunklere) Insel bzw. das Wolkenmeer: nicht heller als der Horizont.
    col = mixc(sky.horizon, sky.below, smoothstep(0, 0.45, -h));
    const dim = 1 + (GROUND_DIM - 1) * smoothstep(0, 0.15, -h);
    col = [col[0] * dim, col[1] * dim, col[2] * dim];
  }
  const sd = Math.max(0, d[0] * sky.sunDir[0] + d[1] * sky.sunDir[1] + d[2] * sky.sunDir[2]);
  const glow = (Math.pow(sd, 6) * 0.18 + Math.pow(sd, 40) * 0.3) * sky.sunVisible;
  // Sonnenfleck: weicher und größer als die Scheibe, damit er auch in kleinen Texturen als Glanzpunkt ankommt.
  const spot = Math.pow(sd, 90) * 3.2 * sky.sunVisible;
  return [
    col[0] + sky.sunGlow[0] * glow + sky.sunDisc[0] * spot,
    col[1] + sky.sunGlow[1] * glow + sky.sunDisc[1] * spot,
    col[2] + sky.sunGlow[2] * glow + sky.sunDisc[2] * spot,
  ];
}

type V3 = [number, number, number];
/** Flächen in der Reihenfolge +X, -X, +Y, -Y, +Z, -Z; Achsen wie bei Babylons Würfeltextur-Dateien. */
const FACES: { normal: V3; x: V3; y: V3 }[] = [
  { normal: [1, 0, 0], x: [0, 0, -1], y: [0, -1, 0] },
  { normal: [-1, 0, 0], x: [0, 0, 1], y: [0, -1, 0] },
  { normal: [0, 1, 0], x: [1, 0, 0], y: [0, 0, 1] },
  { normal: [0, -1, 0], x: [1, 0, 0], y: [0, 0, -1] },
  { normal: [0, 0, 1], x: [1, 0, 0], y: [0, -1, 0] },
  { normal: [0, 0, -1], x: [-1, 0, 0], y: [0, -1, 0] },
];

export interface ProceduralCube {
  size: number;
  /** Sechs Flächen, je size*size*3 Fließkommawerte (linear RGB). */
  faces: Float32Array[];
  /** Mittlere Leuchtdichte (Maß für das Umgebungslicht). */
  meanLuminance: number;
}

export function buildProceduralCube(sky: SkySample, size: number): ProceduralCube {
  const faces: Float32Array[] = [];
  let sum = 0;
  for (const face of FACES) {
    const data = new Float32Array(size * size * 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1;
        const v = ((y + 0.5) / size) * 2 - 1;
        const dx = face.normal[0] + face.x[0] * u + face.y[0] * v;
        const dy = face.normal[1] + face.x[1] * u + face.y[1] * v;
        const dz = face.normal[2] + face.x[2] * u + face.y[2] * v;
        const len = Math.hypot(dx, dy, dz) || 1;
        const c = skyColorAt(sky, [dx / len, dy / len, dz / len]);
        const i = (y * size + x) * 3;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        sum += luminance(c);
      }
    }
    faces.push(data);
  }
  return { size, faces, meanLuminance: sum / (size * size * 6) };
}

/** Skalierung, mit der HDR-Werte in 8 Bit passen (Textur-`level` stellt sie wieder her). */
export const ENCODE_SCALE = 4;

/** Linear HDR -> 8-Bit RGBA, durch ENCODE_SCALE geteilt und gamma-kodiert (Textur mit gammaSpace = true). */
export function encodeFaceRgba8(face: Float32Array): Uint8Array {
  const out = new Uint8Array((face.length / 3) * 4);
  for (let i = 0, o = 0; i < face.length; i += 3, o += 4) {
    for (let k = 0; k < 3; k++) {
      const v = Math.max(0, Math.min(1, face[i + k] / ENCODE_SCALE));
      out[o + k] = Math.round(Math.pow(v, 1 / 2.2) * 255);
    }
    out[o + 3] = 255;
  }
  return out;
}
