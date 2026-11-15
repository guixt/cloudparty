/**
 * Stimmungsvorlagen als reine Datentabelle (keine Babylon-Abhängigkeit): Farbkorrektur, Vignette, Körnung
 * und optionale Zusatz-Nachbearbeitung. Dazu die Mathematik für sanfte Übergänge.
 */
import { LOOK_IDS, type LookId } from '../../../../shared/types';
import type { QualityFeatures } from '../../quality';

export type ToneMap = 'aces' | 'standard' | 'khr';
export type LookShader = 'none' | 'comic' | 'retro';

export interface LookParams {
  /** Faktor auf die Belichtung des Himmels (multiplikativ). */
  exposure: number;
  contrast: number;
  /** Sättigung -100..100 (0 = unverändert). */
  saturation: number;
  /** Farbtemperatur -1 (kühl) .. 1 (warm). */
  temperature: number;
  /** Vignette 0..1. */
  vignette: number;
  /** Filmkorn 0..1. */
  grain: number;
  tone: ToneMap;
  shader: LookShader;
  /** Stärke des Zusatz-Effekts 0..1. */
  shaderAmount: number;
}

export const NEUTRAL_LOOK: LookParams = {
  exposure: 1, contrast: 1.1, saturation: 8, temperature: 0, vignette: 0.08, grain: 0, tone: 'khr', shader: 'none', shaderAmount: 0,
};

export const LOOKS: Record<LookId, LookParams> = {
  standard: NEUTRAL_LOOK,
  filmisch: { exposure: 0.96, contrast: 1.3, saturation: -22, temperature: 0.08, vignette: 0.45, grain: 0.35, tone: 'aces', shader: 'none', shaderAmount: 0 },
  warm: { exposure: 1.04, contrast: 1.14, saturation: 14, temperature: 0.75, vignette: 0.16, grain: 0, tone: 'khr', shader: 'none', shaderAmount: 0 },
  kuehl: { exposure: 1.0, contrast: 1.14, saturation: 6, temperature: -0.75, vignette: 0.16, grain: 0, tone: 'khr', shader: 'none', shaderAmount: 0 },
  comic: { exposure: 1.0, contrast: 1.1, saturation: 28, temperature: 0, vignette: 0, grain: 0, tone: 'standard', shader: 'comic', shaderAmount: 1 },
  retro: { exposure: 1.0, contrast: 1.2, saturation: 10, temperature: 0.1, vignette: 0.2, grain: 0, tone: 'standard', shader: 'retro', shaderAmount: 1 },
};

export function resolveLook(id: unknown): LookParams {
  return typeof id === 'string' && (LOOK_IDS as readonly string[]).includes(id) ? LOOKS[id as LookId] : LOOKS.standard;
}

export const LOOK_TRANSITION_SECONDS = 0.5;

export const smoothstep01 = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Mischt zwei Vorlagen; Unterschiede in Tonwert-Abbildung/Zusatz-Effekt springen (Zusatz-Effekt blendet über die Stärke). */
export function lerpLook(a: LookParams, b: LookParams, t: number): LookParams {
  const k = smoothstep01(t);
  const m = (x: number, y: number) => x + (y - x) * k;
  let shader = b.shader;
  let shaderAmount = m(a.shader === b.shader ? a.shaderAmount : 0, b.shaderAmount);
  if (a.shader !== b.shader && b.shader === 'none') {
    // Ausblenden des alten Effekts
    shader = a.shader;
    shaderAmount = m(a.shaderAmount, 0);
  }
  return {
    exposure: m(a.exposure, b.exposure),
    contrast: m(a.contrast, b.contrast),
    saturation: m(a.saturation, b.saturation),
    temperature: m(a.temperature, b.temperature),
    vignette: m(a.vignette, b.vignette),
    grain: m(a.grain, b.grain),
    tone: k < 0.5 ? a.tone : b.tone,
    shader,
    shaderAmount,
  };
}

/** Qualitätsmerkmale → Optionen der Nachbearbeitung. */
export interface PostOptions {
  bloom: boolean;
  glow: boolean;
  fxaa: boolean;
  ssao: boolean;
  godRays: boolean;
  depthOfField: boolean;
}
export function postOptionsFor(f: QualityFeatures): PostOptions {
  return { bloom: f.bloom, glow: f.glow, fxaa: f.fxaa, ssao: f.ssao, godRays: f.godRays, depthOfField: f.depthOfField };
}

/** Schattenoptionen aus den Qualitätsmerkmalen. */
export function shadowOptionsFor(f: QualityFeatures): { size: number; soft: boolean } {
  return { size: Math.max(256, Math.round(f.shadowMapSize)), soft: f.softShadows };
}

/** Stärke der Sonnenstrahlen aus Sonnenhöhe (Grad) und Blickrichtung (Skalarprodukt Kamera-Blick · Sonnenrichtung). */
export function godRayStrength(elevationDeg: number, facing: number): number {
  const elev = smoothstep01((elevationDeg - 3) / 14);
  const face = smoothstep01((facing - 0.1) / 0.35);
  return elev * face;
}
