/**
 * Reine Hilfsfunktionen für Wasser, Meer und Wasserfall (ohne Babylon, gut testbar).
 */
import type { EntitySpec } from '../../../shared/types';
import type { QualityFeatures } from '../../engine/quality';

export type WaterShape = 'rect' | 'round';
export type Rgb = [number, number, number];

/** Höhe der Wasserfläche über dem Entity-Ursprung (Boden). Knapp über der Inseloberseite (y = 0), damit nichts flackert (z-fighting). */
export const WATER_SURFACE_Y = 0.045;
/** Höhe des dunklen Beckenrandes (nasse Erde) und des Beckenbodens. */
export const RIM_Y = 0.02;
export const BED_Y = 0.03;
/** Tiefe des Auslöse-Volumens unter der Fläche (lokale Einheiten × scale.y). */
export const VOLUME_DEPTH = 0.6;
/** Kantenlänge einer Wellen-Kachel in Metern. */
export const RIPPLE_TILE_M = 2.4;
export const SEA_TILE_M = 16;

export const DEFAULT_WATER_COLOR = '#2c9fd9';
export const DEFAULT_SEA_COLOR = '#1f7fb8';
export const DEFAULT_FALL_COLOR = '#a8def5';

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function parseHex(hex: unknown, fallback: Rgb): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(typeof hex === 'string' ? hex.trim() : '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleRgb = (a: Rgb, f: number): Rgb => [a[0] * f, a[1] * f, a[2] * f];

export interface WaterParams {
  shape: WaterShape;
  /** sRGB-Farbe 0..1. */
  color: Rgb;
  waves: number;
  depth: number;
  flow: number;
}

/** Liest die Parameter eines Wasser-Bausteins (ungültige Werte ergeben die Vorgaben). */
export function readWaterParams(entity: Pick<EntitySpec, 'state' | 'material'>): WaterParams {
  const s = entity.state ?? {};
  return {
    shape: s.shape === 'rect' ? 'rect' : 'round',
    color: parseHex(entity.material?.color, parseHex(DEFAULT_WATER_COLOR, [0.17, 0.62, 0.85])),
    waves: clamp01(num(s.waves, 0.4)),
    depth: clamp01(num(s.depth, 0.5)),
    flow: clamp01(num(s.flow, 0.3)),
  };
}

export interface WaterSize {
  x: number;
  z: number;
}
/** Ausdehnung in Metern aus scale (mindestens 0.2 m, damit nichts entartet). */
export function waterSize(scale: readonly number[]): WaterSize {
  return { x: Math.max(0.2, Math.abs(num(scale[0], 8))), z: Math.max(0.2, Math.abs(num(scale[2], 8))) };
}
/** UV-Faktoren, damit die Wellen-Kachel unabhängig von der Größe `tile` Meter misst. */
export function uvRepeat(size: WaterSize, tile = RIPPLE_TILE_M): [number, number] {
  return [size.x / tile, size.z / tile];
}
/** Liegt ein Punkt (x, z) in der Wasserfläche? (`pos` = Mitte, `yaw` Drehung um Y, Form rund = Ellipse). */
export function insideWater(point: readonly [number, number], pos: readonly [number, number], yaw: number, size: WaterSize, shape: WaterShape): boolean {
  const dx = point[0] - pos[0];
  const dz = point[1] - pos[1];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = (dx * c - dz * s) / (size.x / 2);
  const lz = (dx * s + dz * c) / (size.z / 2);
  return shape === 'round' ? lx * lx + lz * lz <= 1 : Math.abs(lx) <= 1 && Math.abs(lz) <= 1;
}

export interface WaveSettings {
  windForce: number;
  waveHeight: number;
  bumpHeight: number;
  waveSpeed: number;
  windDirection: [number, number];
  colorBlend: number;
  /** Färbung der Spiegelung durch die Wasserfarbe. */
  reflectionTint: number;
}
/** Wellen und Strömung -> Parameter des Wasser-Materials. */
export function waveSettings(waves: number, flow: number, sea = false): WaveSettings {
  const w = clamp01(waves);
  const f = clamp01(flow);
  const drift = 0.4 + 1.6 * f;
  return {
    windForce: -(2.5 + 11 * w) * drift,
    // keine Höhenverschiebung der Eckpunkte: die Fläche bleibt eben (sonst Flackern am Saum); Wellen entstehen über die Normalenkarte
    waveHeight: 0,
    bumpHeight: (sea ? 0.09 : 0.05) + (sea ? 0.2 : 0.14) * w,
    waveSpeed: 1,
    windDirection: [0.8, 0.6],
    colorBlend: sea ? 0.4 : 0.36,
    reflectionTint: sea ? 0.5 : 0.16,
  };
}

export interface ReflectionOptions {
  /** Echte Spiegelung (Renderziel). */
  reflect: boolean;
  size: number;
  refract: boolean;
  /** Wie viele Wasserflächen gleichzeitig ein echtes Renderziel bekommen. */
  maxActive: number;
}
/** Qualitätsstufe -> Optionen. 0 = keine Renderziele (Ersatzdarstellung). */
export function reflectionOptions(f: Pick<QualityFeatures, 'waterReflectionSize' | 'waterRefraction'>): ReflectionOptions {
  const size = Math.max(0, Math.floor(f.waterReflectionSize));
  return { reflect: size > 0, size, refract: size > 0 && f.waterRefraction, maxActive: size <= 0 ? 0 : size >= 1024 ? 3 : 2 };
}

export interface Candidate {
  id: string;
  x: number;
  y: number;
  z: number;
}
/** Die `n` Kandidaten, die der Kamera am nächsten sind (stabil bei Gleichstand: Reihenfolge der Eingabe). */
export function selectNearest(items: readonly Candidate[], cam: readonly [number, number, number], n: number): Set<string> {
  if (n <= 0) return new Set();
  const dist = (c: Candidate) => (c.x - cam[0]) ** 2 + (c.y - cam[1]) ** 2 + (c.z - cam[2]) ** 2;
  return new Set(
    items
      .map((c, i) => ({ c, i, d: dist(c) }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .slice(0, n)
      .map((e) => e.c.id),
  );
}

/** Tageslicht-Faktor 0..1 aus der Helligkeit (linear) des Horizonts bzw. der Nebelfarbe. */
export function daylightFromHorizon(rgbLinear: Rgb): number {
  const luma = 0.2126 * rgbLinear[0] + 0.7152 * rgbLinear[1] + 0.0722 * rgbLinear[2];
  return clamp01(Math.pow(clamp01(luma / 0.5), 0.6));
}
/** Dunkelt eine Wasserfarbe mit dem Tageslicht ab (nachts bleibt ein kühler Rest). */
export function tintByDaylight(color: Rgb, daylight: number): Rgb {
  const f = 0.16 + 0.84 * clamp01(daylight);
  return [color[0] * f * (0.9 + 0.1 * daylight), color[1] * f, color[2] * f * (1 + 0.25 * (1 - daylight))];
}
/** Farbe des Beckenbodens (sichtbar durch die Brechung). */
export function bedColor(color: Rgb, depth: number): Rgb {
  return scaleRgb(color, 0.5 - 0.38 * clamp01(depth));
}

/** Partikelzahl nach Qualitätsstufe (mindestens 0, ganzzahlig). */
export function scaledCount(base: number, particleScale: number): number {
  return Math.max(0, Math.round(base * clamp01(particleScale)));
}

export interface FallParams {
  width: number;
  height: number;
  color: Rgb;
}
/** Wasserfall: Breite und Höhe in Metern (state.width/height, mal scale x/y). */
export function readFallParams(entity: Pick<EntitySpec, 'state' | 'material'>, scale: readonly number[]): FallParams {
  const s = entity.state ?? {};
  const width = Math.max(0.2, num(s.width, 2));
  const height = Math.max(0.5, num(s.height, 12));
  return {
    width: width * Math.max(0.05, Math.abs(num(scale[0], 1))),
    height: height * Math.max(0.05, Math.abs(num(scale[1], 1))),
    color: parseHex(entity.material?.color, parseHex(DEFAULT_FALL_COLOR, [0.66, 0.87, 0.96])),
  };
}

/** Sea-Einstellungen aus `environment.sea`. */
export interface SeaOptions {
  water: boolean;
  color: Rgb;
  waves: number;
}
export function readSea(sea: { mode?: string; color?: string; waves?: number } | undefined): SeaOptions {
  return {
    water: sea?.mode === 'water',
    color: parseHex(sea?.color, parseHex(DEFAULT_SEA_COLOR, [0.12, 0.5, 0.72])),
    waves: clamp01(num(sea?.waves, 0.5)),
  };
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Kachelbare Normalenkarte (RGBA, size × size) aus überlagerten Sinuswellen mit ganzzahligen Frequenzen.
 * rg = Neigung (0.5 = eben), b = 1. Gleiche `seed` ergibt dieselben Bytes.
 */
export function generateBumpData(size = 256, seed = 7): Uint8ClampedArray {
  const rnd = mulberry(seed);
  const waves: { fx: number; fy: number; a: number; p: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const fx = Math.round((rnd() * 2 - 1) * 7) || 1;
    const fy = Math.round((rnd() * 2 - 1) * 7) || 2;
    const len = Math.hypot(fx, fy);
    waves.push({ fx, fy, a: 1 / (1 + len * 0.35), p: rnd() * Math.PI * 2 });
  }
  const data = new Uint8ClampedArray(size * size * 4);
  const k = (0.28 / waves.reduce((s, w) => s + w.a * Math.hypot(w.fx, w.fy), 0)) * 1.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const c = Math.cos(2 * Math.PI * (w.fx * u + w.fy * v) + w.p) * w.a * 2 * Math.PI;
        dx += c * w.fx;
        dy += c * w.fy;
      }
      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * clamp01(0.5 + dx * k * 0.5));
      data[i + 1] = Math.round(255 * clamp01(0.5 + dy * k * 0.5));
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Streifen für den Wasserfall (RGBA, w × h, kachelbar in v): helle senkrechte Schlieren mit Alpha. */
export function generateStreakData(w = 64, h = 256, seed = 3): Uint8ClampedArray {
  const rnd = mulberry(seed);
  const cols = Array.from({ length: w }, () => ({ base: 0.35 + rnd() * 0.5, f: 1 + Math.floor(rnd() * 5), p: rnd() * 6.283, g: 0.4 + rnd() * 0.6 }));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let x = 0; x < w; x++) {
    const c = cols[x];
    const cl = cols[(x + 1) % w];
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const wave = 0.5 + 0.5 * Math.sin(2 * Math.PI * c.f * t + c.p);
      const blend = 0.5 * (c.base + cl.base);
      const a = clamp01(blend * (0.45 + 0.65 * wave * c.g) * (0.8 + 0.2 * Math.sin(2 * Math.PI * (c.f + 2) * t + cl.p)));
      const i = (y * w + x) * 4;
      const shade = 225 + Math.round(30 * wave);
      data[i] = shade;
      data[i + 1] = Math.min(255, shade + 8);
      data[i + 2] = 255;
      data[i + 3] = Math.round(255 * a);
    }
  }
  return data;
}
