/**
 * Einhängestelle für Umgebungs-Effekte (Reflexionssonde, Meer, Looks, Natur, Wetter).
 * VERTRAG: nur der Koordinator ändert diese Datei und `featureList.ts`.
 *
 * Jeder Effekt ist eine Funktion `(handle) => EnvironmentFeature` in einer EIGENEN Datei unter `features/`
 * und wird in `featureList.ts` eingetragen. Die Umgebung (`index.ts`) ruft die Hooks auf:
 * - `apply(env)` bei jeder Änderung der Umgebung (auch beim Start und bei `world.loaded`),
 * - `islandChanged(island)` wenn die Insel neu aufgebaut wurde,
 * - `update(dt, time)` pro Bild (dt in Sekunden, time = Sekunden seit Start),
 * - `onQuality(features)` bei jeder Änderung der Qualitätsstufe (und einmal sofort nach dem Anlegen),
 * - `dispose()` beim Beenden.
 * Ein Effekt, der nicht funktioniert (z. B. fehlende WebGL-Funktion), muss sich still abschalten und darf nie werfen.
 */
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { EnvironmentSpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import type { QualityFeatures } from '../quality';
import type { Clouds } from './clouds';
import type { Island } from './island';
import type { PostProcessing } from './post';
import type { SkyLook } from './presets';
import type { SkyDome } from './sky';

export interface EnvironmentHandle {
  ctx: GameContext;
  scene: Scene;
  sun: DirectionalLight;
  hemi: HemisphericLight;
  shadows: ShadowGenerator;
  sky: SkyDome;
  clouds: Clouds;
  post: PostProcessing;
  /** Aktuelle Insel (null, solange keine gebaut ist). */
  getIsland(): Island | null;
  /** Zuletzt angewendete Umgebung. */
  getEnvironment(): EnvironmentSpec;
  /** Normalisierte Richtung zur Sonne (nicht verändern). */
  getSunDirection(): Vector3;
  /** Höhe des Meeres/Wolkenmeers unter der Insel (y). */
  readonly seaY: number;
  /**
   * Wendet eine „virtuelle" Umgebung an, ohne den Store zu ändern (für den Tageszyklus): Sonne, Himmel, Nebel
   * und alle Effekte (`apply`-Hooks) sehen `env`. Optional kann ein fertig gemischter Himmel (`look`) statt
   * `resolveSkyLook(env.sky)` verwendet werden. Der aufrufende Effekt bekommt dabei selbst auch `apply(env)`
   * zurück und muss sich davor schützen (Flag setzen).
   */
  applyVirtual(env: EnvironmentSpec, look?: SkyLook): void;
}

export interface EnvironmentFeature {
  id: string;
  apply?(env: EnvironmentSpec): void;
  islandChanged?(island: Island | null): void;
  update?(dt: number, time: number): void;
  onQuality?(features: QualityFeatures): void;
  dispose?(): void;
}

export type EnvironmentFeatureFactory = (handle: EnvironmentHandle) => EnvironmentFeature;
