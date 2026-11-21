/**
 * Tageszyklus (rein, ohne Babylon): Uhrzeit → Sonnenstand → Himmels-Look.
 * Tageszeit t in [0,1): 0 = Mitternacht, 0.25 = Sonnenaufgang, 0.5 = Mittag, 0.75 = Sonnenuntergang.
 */
import type { EnvironmentSpec } from '../../../../shared/types';
import { SKY_PRESETS, parseLightDirection, resolveSkyLook, type LightDirection, type SkyLook } from '../presets';
import { blendLooks } from './blend';

export const MAX_SUN_ELEVATION = 70;

/** Nacht im Zyklus: etwas mehr Mond- und Himmelslicht, weil die Sonne unter dem Horizont nur noch 15 % Licht liefert. */
export const NIGHT_CYCLE: SkyLook = {
  ...SKY_PRESETS.night,
  sunFactor: 0.4,
  hemiIntensity: 0.7,
  hemiSky: [0.4, 0.5, 0.85],
  hemiGround: [0.3, 0.36, 0.55],
  exposure: 1.15,
};

/** Entspricht der Abblendung der Umgebung nahe dem Horizont (Sonnenlicht ≈ (Höhe + 4°) / 14°, mindestens 0.15). */
const horizonFade = (elevation: number) => Math.max(0.15, Math.min(1, (elevation + 4) / 14));

const frac = (x: number) => x - Math.floor(x);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1)));
  return t * t * (3 - 2 * t);
};

/** Tageszeit aus Uhr (ms), Tageslänge und Startversatz (Tageszeit zum Zeitpunkt 0). */
export function timeOfDay(nowMs: number, minutesPerDay: number, offset: number): number {
  const minutes = Math.max(1, Math.min(240, Number.isFinite(minutesPerDay) ? minutesPerDay : 20));
  return frac(offset + nowMs / (minutes * 60000));
}

export function sunElevation(t: number): number {
  return MAX_SUN_ELEVATION * Math.sin((t - 0.25) * Math.PI * 2);
}

/** Sonnenstand zur Tageszeit; `azimuthOffset` gleicht den gespeicherten Azimut an. */
export function sunFromTime(t: number, azimuthOffset = 0): LightDirection {
  return { azimuth: (((360 * t + azimuthOffset) % 360) + 360) % 360, elevation: sunElevation(t) };
}

/** Tageszeit, deren Sonnenhöhe zur gespeicherten Richtung passt (Azimut < 180° = Vormittag). */
export function timeFromSun(dir: LightDirection): number {
  const s = Math.max(-1, Math.min(1, dir.elevation / MAX_SUN_ELEVATION));
  const phase = Math.asin(s);
  const morning = dir.azimuth < 180;
  const x = morning ? phase : Math.PI - phase;
  return frac(0.25 + x / (Math.PI * 2));
}

/** Versatz, damit der Azimut zur Startzeit dem gespeicherten entspricht. */
export function azimuthOffsetFor(dir: LightDirection, t0: number): number {
  return dir.azimuth - 360 * t0;
}

/** Look zur Sonnenhöhe: Nacht (≤ -14°) → Dämmerung (1°) → Tag (≥ 20°). */
export function lookForElevation(elevation: number, day: SkyLook): SkyLook {
  if (elevation >= 20) return blendLooks(day, day, 0);
  if (elevation >= 1) return blendLooks(SKY_PRESETS.dusk, day, smooth(1, 20, elevation));
  if (elevation >= -14) return blendLooks(NIGHT_CYCLE, SKY_PRESETS.dusk, smooth(-14, 1, elevation));
  return blendLooks(NIGHT_CYCLE, NIGHT_CYCLE, 0);
}

/** Tages-Look aus der gespeicherten Umgebung (klar/eigene Farbe; Dämmerung/Nacht fallen auf „klar" zurück). */
export function dayLookFor(env: EnvironmentSpec): SkyLook {
  const preset = env.sky?.preset ?? 'clear';
  return preset === 'clear' || preset === 'custom' ? resolveSkyLook(env.sky) : SKY_PRESETS.clear;
}

export interface CycleState {
  t0: number;
  azimuthOffset: number;
}

export function createCycleState(env: EnvironmentSpec): CycleState {
  const dir = parseLightDirection(env.light?.direction);
  const t0 = timeFromSun(dir);
  return { t0, azimuthOffset: azimuthOffsetFor(dir, t0) };
}

/** Virtuelle Umgebung und Look zur Tageszeit t. */
export function cycleEnvironment(base: EnvironmentSpec, state: CycleState, t: number): { env: EnvironmentSpec; look: SkyLook; elevation: number } {
  const dir = sunFromTime(t, state.azimuthOffset);
  const baseIntensity = base.light?.intensity ?? 3;
  // Unter dem Horizont gleicht die Stärke die Abblendung der Umgebung teilweise aus (Mondlicht).
  const intensity = Math.min(10, (baseIntensity * (0.6 + 0.4 * smooth(0, 30, dir.elevation))) / horizonFade(dir.elevation));
  const env: EnvironmentSpec = {
    ...base,
    light: { ...(base.light ?? {}), direction: { azimuth: dir.azimuth, elevation: dir.elevation }, intensity } as EnvironmentSpec['light'],
  };
  return { env, look: lookForElevation(dir.elevation, dayLookFor(base)), elevation: dir.elevation };
}
