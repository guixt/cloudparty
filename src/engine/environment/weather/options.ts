/** Wetter-Tabellen und Hilfsfunktionen (rein, ohne Babylon). */
import type { WeatherKind } from '../../../../shared/types';

export interface WeatherOptions {
  /** Höchstzahl gleichzeitiger Partikel (nach Qualitätsfaktor). */
  capacity: number;
  /** Partikel pro Sekunde bei vollem Wetter. */
  emitRate: number;
  minLife: number;
  maxLife: number;
}

interface BaseOptions {
  count: number;
  minLife: number;
  maxLife: number;
}
const BASE: Partial<Record<WeatherKind, BaseOptions>> = {
  rain: { count: 4500, minLife: 0.55, maxLife: 0.7 },
  snow: { count: 900, minLife: 7, maxLife: 10 },
  fireflies: { count: 90, minLife: 6, maxLife: 10 },
};

/** Faktor auf `scene.fogDensity` bei vollem Wetter (1 = unverändert). */
export const FOG_MULTIPLIER: Record<WeatherKind, number> = { none: 1, rain: 1.7, snow: 1.5, fog: 8, fireflies: 1 };

export function normalizeWeather(kind: unknown): WeatherKind {
  return kind === 'rain' || kind === 'snow' || kind === 'fog' || kind === 'fireflies' ? kind : 'none';
}

/** Partikelzahlen je Art und Qualität (`particleScale` 0..1). null = keine Partikel. */
export function weatherOptions(kind: WeatherKind, particleScale: number): WeatherOptions | null {
  const base = BASE[kind];
  const scale = Number.isFinite(particleScale) ? Math.max(0, Math.min(1, particleScale)) : 0;
  if (!base || scale <= 0) return null;
  const capacity = Math.max(8, Math.round(base.count * scale));
  const avgLife = (base.minLife + base.maxLife) / 2;
  return { capacity, emitRate: capacity / avgLife, minLife: base.minLife, maxLife: base.maxLife };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
};

/** Helligkeit für unbeleuchtete Partikel aus der linearen Himmelsfarbe (Nacht dunkler). */
export function particleBrightness(r: number, g: number, b: number): number {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Math.max(0.25, Math.min(1, 0.25 + 1.2 * Math.sqrt(Math.max(0, luma))));
}

/** 0 (Tag) .. 1 (Nacht) aus Sonnenhöhe und Himmelshelligkeit. */
export function nightness(sunElevation: number, luma: number): number {
  return Math.max(1 - smooth(-4, 22, sunElevation), 1 - smooth(0.02, 0.4, luma));
}

/** Glühwürmchen: Anteil der Emission (ein paar bleiben auch am Tag). */
export function fireflyShare(night: number): number {
  return 0.1 + 0.9 * clamp01(night);
}

/** Überblendung: nähert `current` dem Ziel mit fester Dauer (Sekunden für 0→1). */
export function approach(current: number, target: number, dt: number, seconds = 2.5): number {
  const step = dt / Math.max(0.01, seconds);
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

/** Nebelfaktor aus den Ebenen: 1 + Σ (Multiplikator − 1) · Überblendung. */
export function fogFactor(layers: { kind: WeatherKind; fade: number }[]): number {
  let f = 1;
  for (const l of layers) f += (FOG_MULTIPLIER[l.kind] - 1) * clamp01(l.fade);
  return f;
}
