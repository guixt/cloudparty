/**
 * Reine Entscheidungslogik der Reflexionssonde (ohne Babylon, gut testbar):
 * Qualität -> Betriebsart, wann wird aufgefrischt, Ausgleich des Hemisphärenlichts.
 */
import type { Rgb } from '../presets';

/** Himmel in LINEAREN Farben (so, wie ihn der Himmels-Shader bekommt). */
export interface SkySample {
  top: Rgb;
  mid: Rgb;
  horizon: Rgb;
  below: Rgb;
  sunDisc: Rgb;
  sunGlow: Rgb;
  /** Normalisierte Richtung zur Sonne. */
  sunDir: [number, number, number];
  /** 0 oder 1 (Sonne über dem Horizont). */
  sunVisible: number;
  stars: number;
}

export type ProbeMode = { kind: 'probe'; size: number } | { kind: 'procedural'; size: number };

export const PROCEDURAL_SIZE = 32;
const MIN_PROBE = 32;
const MAX_PROBE = 512;

/** probeSize 0 = keine Sonde -> billige prozedurale Würfeltextur; sonst Sonde (Zweierpotenz, 32..512). */
export function modeForQuality(probeSize: number): ProbeMode {
  if (!Number.isFinite(probeSize) || probeSize <= 0) return { kind: 'procedural', size: PROCEDURAL_SIZE };
  const clamped = Math.max(MIN_PROBE, Math.min(MAX_PROBE, Math.round(probeSize)));
  return { kind: 'probe', size: 2 ** Math.round(Math.log2(clamped)) };
}

export const sameMode = (a: ProbeMode | null, b: ProbeMode): boolean => !!a && a.kind === b.kind && a.size === b.size;

/** Flache Zahlenliste, die den Himmel beschreibt (zum Vergleichen). */
export function signature(sky: SkySample, sunIntensity: number): number[] {
  return [
    ...sky.top, ...sky.mid, ...sky.horizon, ...sky.below, ...sky.sunDisc, ...sky.sunGlow,
    ...sky.sunDir, sky.sunVisible, sky.stars, sunIntensity,
  ];
}

/** Wie stark unterscheiden sich zwei Himmel? 0 = gleich, ~0.1 = merklich, >0.3 = anderer Himmel. */
export function changeScore(a: number[] | null, b: number[]): number {
  if (!a || a.length !== b.length) return Infinity;
  let color = 0;
  for (let i = 0; i < 18; i++) color = Math.max(color, Math.abs(a[i] - b[i]));
  const dot = a[18] * b[18] + a[19] * b[19] + a[20] * b[20];
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  const vis = Math.abs(a[21] - b[21]);
  const stars = Math.abs(a[22] - b[22]) * 0.5;
  const sun = Math.abs(a[23] - b[23]) * 0.05;
  return Math.max(color, angle * 1.5, vis, stars, sun);
}

export const MIN_REFRESH_GAP = 0.5;
export const NOTICEABLE = 0.01;
export const STRONG = 0.15;

export interface RefreshInput {
  /** `changeScore` seit der letzten Aktualisierung (Infinity = noch nie). */
  score: number;
  /** Sekunden seit der letzten Aktualisierung. */
  sinceLast: number;
  /** `probeUpdateSeconds` der Qualitätsstufe. */
  updateSeconds: number;
  /** Echte Sonde (Wolken bewegen sich) – nur dann zusätzlich zeitgesteuert auffrischen. */
  periodic: boolean;
}

/** Soll die Sonde jetzt neu gerendert werden? */
export function shouldRefresh(input: RefreshInput): boolean {
  const { score, sinceLast, updateSeconds, periodic } = input;
  if (!Number.isFinite(score)) return true;
  if (score >= STRONG && sinceLast >= MIN_REFRESH_GAP) return true;
  if (score >= NOTICEABLE && sinceLast >= Math.max(MIN_REFRESH_GAP, updateSeconds)) return true;
  if (periodic && updateSeconds > 0 && sinceLast >= Math.max(MIN_REFRESH_GAP, updateSeconds)) return true;
  return false;
}

export const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Faktor für das Hemisphärenlicht, wenn Umgebungslicht aus der Sonde kommt:
 * Das Umgebungslicht liefert schon `iblLuminance * envIntensity * materialIntensity`; das Füll-Licht wird um
 * einen Teil davon verringert (nie unter 30 %, nie über 100 %), damit die Szene nicht überbelichtet.
 */
export function hemiFactor(hemiLuminance: number, iblLuminance: number, envIntensity: number, materialIntensity = 0.6): number {
  if (!(hemiLuminance > 1e-4)) return 1;
  const ibl = Math.max(0, iblLuminance) * Math.max(0, envIntensity) * materialIntensity;
  return Math.max(0.3, Math.min(1, 1 - (0.8 * ibl) / hemiLuminance));
}
