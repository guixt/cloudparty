/**
 * Seed-gesteuerter, organischer Inselumriss und glatte Rauschfunktionen (rein, ohne Babylon).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Harmonic {
  k: number;
  amp: number;
  phase: number;
}

/** Summe periodischer Harmonischer; liefert Werte etwa in [-1, 1]. */
export function makeHarmonics(seed: number, count: number, minK: number, falloff = 0.7): Harmonic[] {
  const rnd = mulberry32(seed);
  const list: Harmonic[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const k = minK + i;
    const amp = rnd() * 0.6 + 0.4;
    const weighted = amp / Math.pow(k, falloff);
    list.push({ k, amp: weighted, phase: rnd() * Math.PI * 2 });
    total += weighted;
  }
  return list.map((h) => ({ ...h, amp: h.amp / total }));
}

export function evalHarmonics(list: Harmonic[], theta: number, shift = 0): number {
  let v = 0;
  for (const h of list) v += h.amp * Math.cos(h.k * theta + h.phase + shift * h.k * 0.37);
  return v;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
};

/** Faktor des Umrissradius relativ zum Nennradius, in [0.88, 1.1]; periodisch in theta. */
export function createOutline(seed: number): (theta: number) => number {
  const harmonics = makeHarmonics(seed * 31 + 11, 7, 2, 0.55);
  return (theta) => Math.max(0.88, Math.min(1.1, 1 + 0.12 * evalHarmonics(harmonics, theta)));
}
