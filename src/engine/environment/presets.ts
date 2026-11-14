/**
 * Reine Hilfsfunktionen und Tabellen für Himmel und Licht (ohne Babylon, gut testbar).
 */
import type { EnvironmentSpec, SkyPreset } from '../../../shared/types';

export type Rgb = [number, number, number];

export interface LightDirection {
  azimuth: number;
  elevation: number;
}
export const DEFAULT_LIGHT_DIRECTION: LightDirection = { azimuth: 40, elevation: 50 };

/** Akzeptiert `{azimuth, elevation}` oder den Text "az,el" (Grad). Ungültiges ergibt den Standard. */
export function parseLightDirection(input: unknown): LightDirection {
  let azimuth = Number.NaN;
  let elevation = Number.NaN;
  if (typeof input === 'string') {
    const parts = input.split(/[,;\s]+/).filter(Boolean).map(Number);
    if (parts.length >= 2) [azimuth, elevation] = parts;
  } else if (input && typeof input === 'object') {
    const value = input as { azimuth?: unknown; elevation?: unknown };
    azimuth = Number(value.azimuth);
    elevation = Number(value.elevation);
  }
  if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) return { ...DEFAULT_LIGHT_DIRECTION };
  return { azimuth: ((azimuth % 360) + 360) % 360, elevation: Math.max(-90, Math.min(90, elevation)) };
}

/** Einheitsvektor von der Insel zur Sonne (Y nach oben, Azimut 0 = +Z, 90 = +X). */
export function sunVector(direction: LightDirection): [number, number, number] {
  const az = (direction.azimuth * Math.PI) / 180;
  const el = (direction.elevation * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}

/** Farbtemperatur in Kelvin als RGB (0..1), auf Weiß bei 6500 K bezogen. */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = Math.max(1000, Math.min(15000, Number.isFinite(kelvin) ? kelvin : 6500)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  return [clamp(r), clamp(g), clamp(b)];
}

export function hexToRgb(hex: string | undefined, fallback: Rgb): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!match) return fallback;
  const n = parseInt(match[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB-Farbe (wie in Stilleitfaden/Hex) nach linear; Babylon rechnet Material- und Vertexfarben linear. */
export const toLinear = (a: Rgb): Rgb => [Math.pow(a[0], 2.2), Math.pow(a[1], 2.2), Math.pow(a[2], 2.2)];

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleRgb = (a: Rgb, f: number): Rgb => [a[0] * f, a[1] * f, a[2] * f];
export const mulRgb = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

/** Aussehen eines Himmels. */
export interface SkyLook {
  top: Rgb;
  mid: Rgb;
  horizon: Rgb;
  below: Rgb;
  sunDisc: Rgb;
  /** Größe der Sonnenscheibe (Kosinus-Schwelle, näher an 1 = kleiner). */
  sunGlow: Rgb;
  stars: number;
  cloudLight: Rgb;
  cloudShade: Rgb;
  /** Faktor auf die Sonnenstärke und Tönung des Sonnenlichts. */
  sunFactor: number;
  sunTint: Rgb;
  hemiSky: Rgb;
  hemiGround: Rgb;
  hemiIntensity: number;
  fogDensity: number;
  exposure: number;
}

export const SKY_PRESETS: Record<Exclude<SkyPreset, 'custom'>, SkyLook> = {
  clear: {
    top: [0.247, 0.561, 0.91], // #3f8fe8
    mid: [0.43, 0.7, 0.95],
    horizon: [0.749, 0.878, 0.984], // #bfe0fb
    below: [0.62, 0.78, 0.93],
    sunDisc: [1, 0.97, 0.86],
    sunGlow: [1, 0.9, 0.7],
    stars: 0,
    cloudLight: [1, 1, 1],
    cloudShade: [0.66, 0.74, 0.88],
    sunFactor: 1,
    sunTint: [1, 1, 1],
    hemiSky: [0.62, 0.78, 1],
    hemiGround: [0.7, 0.66, 0.55],
    hemiIntensity: 0.9,
    fogDensity: 0.0022,
    exposure: 1,
  },
  dusk: {
    top: [0.16, 0.2, 0.46],
    mid: [0.66, 0.4, 0.55],
    horizon: [1, 0.62, 0.36],
    below: [0.7, 0.42, 0.4],
    sunDisc: [1, 0.78, 0.5],
    sunGlow: [1, 0.5, 0.25],
    stars: 0.25,
    cloudLight: [1, 0.82, 0.7],
    cloudShade: [0.52, 0.38, 0.55],
    sunFactor: 0.8,
    sunTint: [1, 0.72, 0.5],
    hemiSky: [0.62, 0.52, 0.78],
    hemiGround: [0.55, 0.4, 0.38],
    hemiIntensity: 0.75,
    fogDensity: 0.0026,
    exposure: 1,
  },
  night: {
    top: [0.012, 0.025, 0.09],
    mid: [0.03, 0.06, 0.17],
    horizon: [0.09, 0.14, 0.3],
    below: [0.04, 0.06, 0.14],
    sunDisc: [0.85, 0.9, 1],
    sunGlow: [0.3, 0.4, 0.7],
    stars: 1,
    cloudLight: [0.62, 0.66, 0.8],
    cloudShade: [0.26, 0.3, 0.46],
    sunFactor: 0.38,
    sunTint: [0.55, 0.68, 1],
    hemiSky: [0.28, 0.36, 0.7],
    hemiGround: [0.3, 0.32, 0.45],
    hemiIntensity: 0.8,
    fogDensity: 0.0024,
    exposure: 1.05,
  },
};

/** Erzeugt aus einer frei gewählten Himmelsfarbe ein stimmiges Aussehen (Tageslicht-Grundlage). */
export function customSkyLook(color: string | undefined): SkyLook {
  const base = SKY_PRESETS.clear;
  const top = hexToRgb(color, base.top);
  const white: Rgb = [1, 1, 1];
  const luminance = 0.2126 * top[0] + 0.7152 * top[1] + 0.0722 * top[2];
  const dark = Math.max(0, Math.min(1, 1 - luminance * 2.2));
  const horizon = mix(top, white, 0.6);
  return {
    ...base,
    top,
    mid: mix(top, horizon, 0.45),
    horizon,
    below: mix(top, horizon, 0.7),
    stars: Math.max(0, dark - 0.4) * 1.4,
    cloudLight: mix(white, top, 0.12),
    cloudShade: mix(top, white, 0.35),
    hemiSky: mix(top, white, 0.4),
  };
}

export function resolveSkyLook(sky: EnvironmentSpec['sky'] | undefined): SkyLook {
  const preset = sky?.preset ?? 'clear';
  if (preset === 'custom') return customSkyLook(sky?.color);
  return SKY_PRESETS[preset] ?? SKY_PRESETS.clear;
}

/** Abbildung der 0..10-Skala von `light.intensity` auf die Babylon-Intensität der Sonne (3 ≈ heller Tag). */
export function sunIntensityFrom(intensity: number): number {
  const v = Number.isFinite(intensity) ? Math.max(0, Math.min(10, intensity)) : 3;
  return v * 0.62;
}
