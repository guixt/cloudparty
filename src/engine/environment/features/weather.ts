/**
 * Paket 25 – Wetter (environment.weather): Regen, Schnee, Nebel, Glühwürmchen.
 * Nur Partikel und Nebel – Lichter gehören der Umgebung. Hooks und Regeln: siehe ../features.ts.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { EnvironmentSpec, WeatherKind } from '../../../../shared/types';
import type { QualityFeatures } from '../../quality';
import type { EnvironmentFeature, EnvironmentHandle } from '../features';
import { getWind } from '../nature/wind';
import { parseLightDirection } from '../presets';
import { createLayer, type WeatherLayer } from '../weather/layers';
import { approach, fogFactor, nightness, normalizeWeather, particleBrightness } from '../weather/options';

interface Layer {
  kind: WeatherKind;
  fade: number;
  target: number;
  particles: WeatherLayer | null;
  stopped: boolean;
}

export function createWeatherFeature(handle: EnvironmentHandle): EnvironmentFeature {
  const { scene } = handle;
  let kind: WeatherKind = 'none';
  let scale = handle.ctx.quality.features().particleScale;
  let layers: Layer[] = [];
  let baseFog = scene.fogDensity;
  let fogTouched = false;
  let brightness = 1;
  let night = 0;
  const camera = new Vector3();

  const disposeLayer = (l: Layer) => {
    try {
      l.particles?.dispose();
    } catch (error) {
      console.warn('[weather] Aufräumen fehlgeschlagen', error);
    }
  };

  const spawn = (k: WeatherKind): Layer => {
    let particles: WeatherLayer | null = null;
    try {
      particles = createLayer(scene, k, scale);
    } catch (error) {
      console.warn('[weather] Partikel nicht verfügbar', error);
    }
    return { kind: k, fade: 0, target: 1, particles, stopped: false };
  };

  const retarget = () => {
    for (const l of layers) if (l.kind !== kind) l.target = 0;
    if (kind !== 'none' && !layers.some((l) => l.kind === kind)) layers.push(spawn(kind));
    for (const l of layers) {
      if (l.kind !== kind) continue;
      l.target = 1;
      if (l.stopped) {
        // Wieder eingeschaltet, nachdem die Partikel angehalten wurden: neu starten.
        disposeLayer(l);
        l.particles = spawn(kind).particles;
        l.stopped = false;
      }
    }
  };

  const measure = (env: EnvironmentSpec) => {
    const c = scene.clearColor;
    brightness = particleBrightness(c.r, c.g, c.b);
    const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    night = nightness(parseLightDirection(env.light?.direction).elevation, luma);
  };

  return {
    id: 'weather',
    apply(env) {
      kind = normalizeWeather(env.weather);
      // Die Umgebung hat den Nebel eben neu gesetzt: das ist der Ausgangswert.
      baseFog = scene.fogDensity;
      measure(env);
      retarget();
    },
    update(dt) {
      if (layers.length === 0) {
        if (fogTouched) {
          scene.fogDensity = baseFog;
          fogTouched = false;
        }
        return;
      }
      const cam = scene.activeCamera;
      if (cam) camera.copyFrom(cam.globalPosition);
      const wind = getWind();
      for (const l of layers) {
        l.fade = approach(l.fade, l.target, dt);
        try {
          l.particles?.update({ camera, fade: l.fade, brightness, night, wind });
          if (l.target === 0 && l.fade === 0 && !l.stopped) {
            l.particles?.stop();
            l.stopped = true;
          }
        } catch (error) {
          console.warn('[weather] Fehler', error);
          l.particles = null;
        }
      }
      layers = layers.filter((l) => {
        const done = l.target === 0 && l.fade === 0 && (l.particles?.active() ?? 0) === 0;
        if (done) disposeLayer(l);
        return !done;
      });
      const factor = fogFactor(layers);
      if (factor !== 1 || fogTouched) {
        scene.fogDensity = baseFog * factor;
        fogTouched = factor !== 1;
        if (!fogTouched) scene.fogDensity = baseFog;
      }
    },
    onQuality(features: QualityFeatures) {
      if (features.particleScale === scale) return;
      scale = features.particleScale;
      for (const l of layers) {
        if (l.kind === kind) {
          disposeLayer(l);
          l.particles = null;
          try {
            l.particles = createLayer(scene, l.kind, scale);
          } catch (error) {
            console.warn('[weather] Partikel nicht verfügbar', error);
          }
        }
      }
    },
    dispose() {
      for (const l of layers) disposeLayer(l);
      layers = [];
      if (fogTouched) scene.fogDensity = baseFog;
      fogTouched = false;
    },
  };
}
