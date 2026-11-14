/**
 * Prozedurale Inselgeometrie (rein, ohne Babylon): Oberseite bei y = 0, flach bis ca. 85 % des
 * Radius, sanfte Hügel nur am Rand, Fels/Erde-Seiten, nach unten spitz zulaufend.
 */
import type { IslandSpec } from '../../../shared/types';
import { clamp01, createOutline, evalHarmonics, makeHarmonics, mulberry32, smoothstep } from './outline';

export interface IslandGeometry {
  positions: number[];
  indices: number[];
  colors: number[];
  uvs: number[];
  /** Größte Höhe der Oberseite (Hügel) – höchstens 0.6. */
  maxTopHeight: number;
}

export const SEGMENTS = 112;
const TOP_RINGS = [0.14, 0.28, 0.42, 0.56, 0.68, 0.78, 0.85, 0.9, 0.94, 0.97, 1];
const SIDE_RINGS = [0.035, 0.09, 0.16, 0.25, 0.35, 0.46, 0.57, 0.68, 0.79, 0.89, 0.96];

type Rgb = [number, number, number];
/** sRGB-Hex nach linear (Babylon rechnet linear), mit optionalem Verstärkungsfaktor. */
const hex = (h: number, gain = 1): Rgb => [Math.pow((h >> 16) / 255, 2.2) * gain, Math.pow(((h >> 8) & 255) / 255, 2.2) * gain, Math.pow((h & 255) / 255, 2.2) * gain];
const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const GRASS: Rgb = hex(0x70ac3c, 1.3);
const GRASS_LIGHT: Rgb = hex(0x8ac04a, 1.3);
const GRASS_DARK: Rgb = hex(0x589a38, 1.3);
const SOIL: Rgb = hex(0x7a6044, 1.8);
const ROCK_LIGHT: Rgb = hex(0x8a6f52, 1.8);
const ROCK_DARK: Rgb = hex(0x645a4e, 1.8);

export function buildIslandGeometry(island: IslandSpec): IslandGeometry {
  const radius = Math.max(4, island.radius);
  const depth = Math.max(2, island.depth);
  const seed = Math.floor(island.seed) || 0;
  const outline = createOutline(seed);
  const hills = makeHarmonics(seed * 17 + 3, 6, 3, 0.4);
  const hillsB = makeHarmonics(seed * 13 + 5, 5, 5, 0.3);
  const rockA = makeHarmonics(seed * 7 + 1, 8, 3, 0.5);
  const rockB = makeHarmonics(seed * 5 + 9, 6, 7, 0.4);
  const prng = mulberry32(seed * 3 + 2);
  const ph = Array.from({ length: 8 }, () => prng() * Math.PI * 2);
  /** Glatte 2D-Variation in [-1, 1] aus überlagerten Sinuswellen (positionsbasiert, ohne Fächer-Muster). */
  const grassNoise = (x: number, z: number) =>
    0.4 * Math.sin(x * 0.13 + ph[0]) * Math.sin(z * 0.11 + ph[1]) +
    0.3 * Math.sin(x * 0.23 + z * 0.19 + ph[2]) +
    0.2 * Math.sin(x * 0.41 - z * 0.37 + ph[3]) * Math.cos(z * 0.29 + ph[4]) +
    0.1 * Math.sin(x * 0.71 + z * 0.63 + ph[5]);
  const rnd = mulberry32(seed + 99);

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let maxTop = 0;

  const push = (x: number, y: number, z: number, c: Rgb) => {
    positions.push(x, y, z);
    colors.push(c[0], c[1], c[2], 1);
    uvs.push(x / (radius * 2) + 0.5, z / (radius * 2) + 0.5);
  };

  // Mittelpunkt
  push(0, 0, 0, GRASS);
  const ringStart: number[] = [];
  const topEdge: number[] = new Array(SEGMENTS).fill(0);

  const topHeight = (theta: number, r: number, edgeR: number) => {
    const w = smoothstep(radius * 0.85, edgeR, r);
    if (w <= 0) return 0;
    const n = 0.5 + 0.5 * (0.6 * evalHarmonics(hills, theta) + 0.4 * evalHarmonics(hillsB, theta, 1.3));
    return Math.min(0.6, 0.6 * w * clamp01(n));
  };

  for (const t of TOP_RINGS) {
    ringStart.push(positions.length / 3);
    for (let i = 0; i < SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      const edgeR = radius * outline(theta);
      const r = t * edgeR;
      const y = topHeight(theta, r, edgeR);
      if (y > maxTop) maxTop = y;
      if (t === 1) topEdge[i] = y;
      // Farbe: Grasvariation, am Rand Übergang zu Erde
      const n = grassNoise(Math.sin(theta) * r, Math.cos(theta) * r);
      let c = lerp3(GRASS, n > 0 ? GRASS_LIGHT : GRASS_DARK, Math.min(1, Math.abs(n) * 0.9));
      c = lerp3(c, GRASS_LIGHT, clamp01((y / 0.6) * 0.5));
      c = lerp3(c, SOIL, smoothstep(0.955, 1, t));
      push(Math.sin(theta) * r, y, Math.cos(theta) * r, c);
    }
  }

  for (const s of SIDE_RINGS) {
    ringStart.push(positions.length / 3);
    for (let i = 0; i < SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      const edgeR = radius * outline(theta);
      const taper = Math.pow(1 - s, 0.82);
      const bulge = 1 + 0.07 * Math.sin(s * Math.PI);
      const jag = 1 + 0.1 * (0.65 * evalHarmonics(rockA, theta, s * 4) + 0.35 * evalHarmonics(rockB, theta, s * 7)) * Math.min(1, s * 8);
      const r = edgeR * taper * bulge * jag;
      const y = topEdge[i] * (1 - s) - depth * Math.pow(s, 1.02) + 0.0;
      // Farbe: oben Erde, dann Fels mit Bändern und Streifen
      const band = 0.5 + 0.5 * Math.sin(s * 34 + evalHarmonics(rockB, theta, 2) * 3);
      const streak = 0.5 + 0.5 * evalHarmonics(rockA, theta, s * 2);
      let c = lerp3(ROCK_LIGHT, ROCK_DARK, clamp01(s * 1.15 + (band - 0.5) * 0.25 - (streak - 0.5) * 0.3));
      c = lerp3(SOIL, c, smoothstep(0.02, 0.2, s));
      push(Math.sin(theta) * r, y, Math.cos(theta) * r, c);
    }
  }
  // Spitze
  const tip = positions.length / 3;
  push((rnd() - 0.5) * radius * 0.04, -depth, (rnd() - 0.5) * radius * 0.04, ROCK_DARK);

  // Dreiecke. Reihenfolge so, dass die Oberseite nach oben zeigt (Babylon: linkshändig).
  const first = ringStart[0];
  for (let i = 0; i < SEGMENTS; i++) {
    const j = (i + 1) % SEGMENTS;
    indices.push(0, first + j, first + i);
  }
  for (let r = 0; r < ringStart.length - 1; r++) {
    const a = ringStart[r];
    const b = ringStart[r + 1];
    for (let i = 0; i < SEGMENTS; i++) {
      const j = (i + 1) % SEGMENTS;
      indices.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  }
  const last = ringStart[ringStart.length - 1];
  for (let i = 0; i < SEGMENTS; i++) {
    const j = (i + 1) % SEGMENTS;
    indices.push(last + i, last + j, tip);
  }

  return { positions, indices, colors, uvs, maxTopHeight: maxTop };
}
