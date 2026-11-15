/**
 * Grafik-Automatik (Paket 26): wählt beim ersten Start eine passende Stufe und senkt sie bei zu geringer Bildrate.
 * Die Entscheidungslogik ist rein (Bildzeiten und Uhr werden eingespeist) und damit testbar.
 */
import { QUALITY_LEVELS, type QualityApi, type QualityLevel } from './quality';

export const AUTO_WARMUP_MS = 2000;
export const AUTO_MEASURE_MS = 3000;
export const AUTO_SETTLE_MS = 500;
export const AUTO_TARGET_FPS = 40;
export const AUTO_MAX_STEPS = 3;
export const AUTO_MAX_FRAME_MS = 250;
export const WATCH_FPS = 25;
export const WATCH_WINDOW_MS = 6000;
export const WATCH_COOLDOWN_MS = 30000;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|microsoft basic render/i;
const MOBILE_AGENT = /android|iphone|ipad|ipod|mobile|silk/i;

export function levelIndex(level: QualityLevel): number {
  return QUALITY_LEVELS.indexOf(level);
}
export function lowerTier(level: QualityLevel): QualityLevel {
  return QUALITY_LEVELS[Math.max(0, levelIndex(level) - 1)];
}

export interface DeviceHints {
  renderer?: string | null;
  userAgent?: string | null;
}
/** Höchste Stufe, die das Gerät nach Hinweisen sinnvoll trägt. */
export function tierCap(hints: DeviceHints): QualityLevel {
  if (hints.renderer && SOFTWARE_RENDERER.test(hints.renderer)) return 'low';
  if (hints.userAgent && MOBILE_AGENT.test(hints.userAgent)) return 'medium';
  return 'ultra';
}
/** Ausgangsstufe: gespeicherte Stufe (sonst „high"), begrenzt durch die Geräte-Hinweise. */
export function startTier(stored: QualityLevel | null, hints: DeviceHints): QualityLevel {
  const wanted = stored ?? 'high';
  const cap = tierCap(hints);
  return levelIndex(wanted) > levelIndex(cap) ? cap : wanted;
}

export interface FrameStats {
  count: number;
  avgMs: number;
  p95Ms: number;
  fps: number;
}
export function frameStats(samples: readonly number[]): FrameStats {
  const clean = samples.filter((s) => s > 0 && s <= AUTO_MAX_FRAME_MS);
  if (!clean.length) return { count: 0, avgMs: 0, p95Ms: 0, fps: 0 };
  const sorted = [...clean].sort((a, b) => a - b);
  const avgMs = clean.reduce((a, b) => a + b, 0) / clean.length;
  const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { count: clean.length, avgMs, p95Ms, fps: 1000 / avgMs };
}

export interface AutoOptions {
  quality: QualityApi;
  /** Geräte-Hinweise (Renderer, User-Agent). */
  hints: DeviceHints;
  /** Uhr in Millisekunden (Standard: performance.now). */
  now?: () => number;
}
export interface AutoQuality {
  /** Pro gerendertem Bild aufrufen (Dauer in ms). */
  onFrame(deltaMs: number): void;
  /** Messung von vorn beginnen (z. B. nach „Automatisch"). */
  restart(): void;
  /** Aktuelle Phase (für Tests/Anzeige). */
  phase(): 'warmup' | 'settle' | 'measure' | 'watch' | 'off';
}

export function createAutoQuality(options: AutoOptions): AutoQuality {
  const { quality, hints } = options;
  const now = options.now ?? (() => performance.now());
  type Phase = 'warmup' | 'settle' | 'measure' | 'watch' | 'off';
  let phase: Phase = 'off';
  let phaseStart = 0;
  let samples: number[] = [];
  let steps = 0;
  let lastDrop = -Infinity;

  const enter = (next: Phase) => {
    phase = next;
    phaseStart = now();
    samples = [];
  };
  const lower = (): boolean => {
    const current = quality.get();
    const next = lowerTier(current);
    if (next === current) return false;
    quality.set(next);
    lastDrop = now();
    return true;
  };
  const restart = () => {
    steps = 0;
    lastDrop = -Infinity;
    if (!quality.isAuto()) {
      phase = 'off';
      return;
    }
    // Geräte-Hinweise sofort anwenden (Software-Renderer → niedrig, Handy → höchstens mittel).
    const start = startTier(quality.get(), hints);
    if (start !== quality.get()) quality.set(start);
    enter(levelIndex(start) === 0 ? 'watch' : 'warmup');
  };

  restart();
  return {
    restart,
    phase: () => phase,
    onFrame(deltaMs) {
      if (phase === 'off') return;
      if (!quality.isAuto()) {
        phase = 'off';
        return;
      }
      const t = now();
      const elapsed = t - phaseStart;
      if (phase === 'warmup') {
        if (elapsed >= AUTO_WARMUP_MS) enter('measure');
        return;
      }
      if (phase === 'settle') {
        if (elapsed >= AUTO_SETTLE_MS) enter('measure');
        return;
      }
      if (deltaMs > 0 && deltaMs <= AUTO_MAX_FRAME_MS) samples.push(deltaMs);
      if (phase === 'measure') {
        if (elapsed < AUTO_MEASURE_MS) return;
        const stats = frameStats(samples);
        if (stats.count >= 5 && stats.fps < AUTO_TARGET_FPS && steps < AUTO_MAX_STEPS && lower()) {
          steps += 1;
          enter(levelIndex(quality.get()) === 0 ? 'watch' : 'settle');
        } else enter('watch');
        return;
      }
      // watch
      if (elapsed < WATCH_WINDOW_MS) return;
      const stats = frameStats(samples);
      const cooled = t - lastDrop >= WATCH_COOLDOWN_MS;
      if (stats.count >= 10 && stats.fps < WATCH_FPS && cooled) lower();
      enter('watch');
    },
  };
}

interface HardwareScalingEngine {
  setHardwareScalingLevel(level: number): void;
  resize(forceSetSize?: boolean): void;
}
/** Wendet `features().hardwareScaling` an (mindestens 1) und bei jeder Änderung erneut. Rückgabe meldet ab. */
export function bindHardwareScaling(engine: HardwareScalingEngine, quality: QualityApi): () => void {
  let applied = 0;
  const apply = () => {
    const level = Math.max(1, quality.features().hardwareScaling || 1);
    if (level === applied) return;
    applied = level;
    engine.setHardwareScalingLevel(level);
    engine.resize();
  };
  apply();
  return quality.onChange(apply);
}
