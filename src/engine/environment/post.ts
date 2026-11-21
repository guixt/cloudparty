/**
 * Nachbearbeitung: Tonwertabbildung, Bloom, FXAA, Farbkorrektur, GlowLayer sowie qualitätsabhängig SSAO,
 * Sonnenstrahlen und Tiefenschärfe (Fotomodus). Looks (Stimmungsvorlagen) mischen sich multiplikativ
 * mit der Belichtung des Himmels. Die Pipeline hängt an allen Kameras, auch an später hinzugefügten.
 */
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { Scene } from '@babylonjs/core/scene';
import type { QualityFeatures } from '../quality';
import { createCustomEffects } from './post/customEffects';
import { createGodRays } from './post/godrays';
import { LOOK_TRANSITION_SECONDS, NEUTRAL_LOOK, lerpLook, postOptionsFor, type LookParams, type PostOptions, type ToneMap } from './post/looks';
import { createSsao } from './post/ssao';

export interface PostProcessing {
  /** Belichtung des Himmels; der Look wirkt multiplikativ darauf. */
  setExposure(exposure: number): void;
  excludeFromGlow(mesh: AbstractMesh): void;
  /** Qualitätsabhängige Effekte (Bloom, Glow, FXAA, SSAO, Sonnenstrahlen, Tiefenschärfe). */
  setQuality(features: QualityFeatures): void;
  /** Stimmungsvorlage anwenden (sanfter Übergang, außer `instant`). */
  setLook(look: LookParams, instant?: boolean): void;
  /** Richtung zur Sonne (normalisiert) und Farbe der Sonnenscheibe für die Sonnenstrahlen. */
  setSun(direction: Vector3, color?: Color3): void;
  setPhotoMode(on: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

const TONE: Record<ToneMap, number> = {
  standard: ImageProcessingConfiguration.TONEMAPPING_STANDARD,
  aces: ImageProcessingConfiguration.TONEMAPPING_ACES,
  khr: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
};

export function createPostProcessing(scene: Scene): PostProcessing {
  const name = 'env.pipeline';
  let pipeline: DefaultRenderingPipeline | null = null;
  try {
    pipeline = new DefaultRenderingPipeline(name, true, scene, [], true);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 1.2;
    pipeline.bloomWeight = 0.22;
    pipeline.bloomKernel = 48;
    pipeline.bloomScale = 0.5;
    pipeline.imageProcessingEnabled = true;
    const ip = pipeline.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.0;
    ip.contrast = 1.12;
    ip.vignetteEnabled = false;
    ip.colorCurvesEnabled = true;
    if (!ip.colorCurves) ip.colorCurves = new ColorCurves();
    ip.colorCurves.globalSaturation = -8;
    ip.colorCurves.globalExposure = 0;
    pipeline.depthOfField.fStop = 1.6;
    pipeline.depthOfField.focalLength = 50;
    pipeline.depthOfField.lensSize = 140;
  } catch (error) {
    console.warn('[environment] Post-Processing nicht verfügbar', error);
    pipeline = null;
  }

  // Kameras über `addCamera` anmelden: nur so hängt die Pipeline sie nach jedem Umbau (Bloom/FXAA/Tiefenschärfe) wieder ein.
  const attached = new Set<Camera>();
  const attach = (camera: Camera) => {
    if (!pipeline || attached.has(camera)) return;
    if (camera.maxZ < 2000) camera.maxZ = 2000;
    try {
      pipeline.addCamera(camera);
      attached.add(camera);
    } catch (error) {
      console.warn('[environment] Kamera konnte nicht an die Pipeline gehängt werden', error);
    }
  };
  for (const camera of scene.cameras) attach(camera);

  let glow: GlowLayer | null = null;
  try {
    glow = new GlowLayer('env.glow', scene, { blurKernelSize: 24, mainTextureRatio: 0.5 });
    glow.intensity = 0.55;
  } catch (error) {
    console.warn('[environment] GlowLayer nicht verfügbar', error);
  }

  let photo = false;
  const custom = createCustomEffects(scene, () => photo && !!pipeline?.depthOfFieldEnabled);
  const ssao = createSsao(scene);
  const godRays = createGodRays(
    scene,
    () => scene.meshes.filter((m) => m.name.startsWith('env.sky') || m.name.startsWith('env.cloud')),
    (mesh) => glow?.addExcludedMesh(mesh as never),
  );

  const added = scene.onNewCameraAddedObservable.add((camera) => {
    attach(camera);
    ssao.attach(camera);
  });
  const removed = scene.onCameraRemovedObservable.add((camera) => {
    if (!pipeline || !attached.delete(camera)) return;
    try {
      pipeline.removeCamera(camera);
    } catch {
      /* Pipeline schon abgebaut */
    }
  });

  let baseExposure = 1;
  let options: PostOptions = { bloom: true, glow: true, fxaa: true, ssao: false, godRays: false, depthOfField: false };
  let from: LookParams = NEUTRAL_LOOK;
  let to: LookParams = NEUTRAL_LOOK;
  let current: LookParams = NEUTRAL_LOOK;
  let progress = 1;
  let grainOn = false;
  let focusMm = 5000;

  /** Nach Umbauten der Pipeline stimmt die Reihenfolge der Zusatz-Nachbearbeitungen nicht mehr. */
  const restack = () => {
    custom.rebuild();
    if (options.godRays) {
      godRays.setEnabled(false);
      godRays.setEnabled(true);
    }
  };

  const applyLook = (p: LookParams) => {
    current = p;
    if (!pipeline) return;
    const ip = pipeline.imageProcessing;
    ip.exposure = baseExposure * p.exposure;
    ip.contrast = p.contrast;
    ip.toneMappingType = TONE[p.tone];
    const curves = ip.colorCurves;
    if (curves) {
      curves.globalSaturation = p.saturation;
      const t = p.temperature;
      curves.highlightsHue = t >= 0 ? 38 : 212;
      curves.highlightsDensity = Math.abs(t) * 60;
      curves.shadowsHue = t >= 0 ? 28 : 225;
      curves.shadowsDensity = Math.abs(t) * 28;
      curves.globalHue = t >= 0 ? 35 : 215;
      curves.globalDensity = Math.abs(t) * 20;
      curves.midtonesHue = t >= 0 ? 34 : 210;
      curves.midtonesDensity = Math.abs(t) * 22;
    }
    const vignette = p.vignette > 0.01;
    if (vignette !== ip.vignetteEnabled) ip.vignetteEnabled = vignette;
    if (vignette) {
      ip.vignetteWeight = p.vignette * 4;
      ip.vignetteStretch = 0.4;
      ip.vignetteColor = new Color4(0, 0, 0, 0);
    }
    const grain = p.grain > 0.01;
    if (grain !== grainOn) {
      grainOn = grain;
      pipeline.grainEnabled = grain;
      restack();
    }
    if (grain) {
      pipeline.grain.intensity = p.grain * 18;
      pipeline.grain.animated = true;
    }
    custom.set(p.shader, p.shaderAmount);
  };

  const applyOptions = () => {
    if (pipeline) {
      let rebuilt = false;
      if (pipeline.bloomEnabled !== options.bloom) {
        pipeline.bloomEnabled = options.bloom;
        rebuilt = true;
      }
      if (pipeline.fxaaEnabled !== options.fxaa) {
        pipeline.fxaaEnabled = options.fxaa;
        rebuilt = true;
      }
      const dof = options.depthOfField && photo;
      if (pipeline.depthOfFieldEnabled !== dof) {
        pipeline.depthOfFieldEnabled = dof;
        rebuilt = true;
      }
      if (rebuilt) restack();
    }
    if (glow) glow.isEnabled = options.glow;
    const hadSsao = ssao.isActive();
    ssao.setEnabled(options.ssao);
    if (ssao.isActive() !== hadSsao) restack();
    godRays.setEnabled(options.godRays);
  };

  const updateFocus = (dt: number) => {
    const cam = scene.activeCamera;
    if (!pipeline || !cam) return;
    let distance = 8;
    const target = (cam as { target?: Vector3; getTarget?: () => Vector3 }).getTarget?.();
    if (target) distance = target.subtract(cam.globalPosition).length();
    else {
      const engine = scene.getEngine();
      const pick = scene.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2, (m) => m.isPickable && m.isVisible);
      if (pick?.hit && pick.distance > 0) distance = pick.distance;
    }
    const goal = Math.max(0.3, distance) * 1000;
    focusMm += (goal - focusMm) * Math.min(1, dt * 6);
    pipeline.depthOfField.focusDistance = focusMm;
  };

  return {
    setExposure(exposure) {
      baseExposure = exposure;
      if (pipeline) pipeline.imageProcessing.exposure = baseExposure * current.exposure;
    },
    excludeFromGlow(mesh) {
      glow?.addExcludedMesh(mesh as never);
    },
    setQuality(features) {
      options = postOptionsFor(features);
      try {
        applyOptions();
      } catch (error) {
        console.warn('[environment] Qualitätsstufe konnte nicht angewendet werden', error);
      }
    },
    setLook(look, instant) {
      from = current;
      to = look;
      progress = instant ? 1 : 0;
      if (instant) applyLook(look);
    },
    setSun(direction, color) {
      godRays.setSun(direction, color);
    },
    setPhotoMode(on) {
      photo = on;
      try {
        applyOptions();
      } catch (error) {
        console.warn('[environment] Fotomodus nicht verfügbar', error);
      }
    },
    update(dt) {
      try {
        if (progress < 1) {
          progress = Math.min(1, progress + dt / LOOK_TRANSITION_SECONDS);
          applyLook(progress >= 1 ? to : lerpLook(from, to, progress));
        }
        if (photo && pipeline?.depthOfFieldEnabled) updateFocus(dt);
        godRays.update();
      } catch (error) {
        console.warn('[environment] Nachbearbeitung', error);
      }
    },
    dispose() {
      scene.onNewCameraAddedObservable.remove(added);
      scene.onCameraRemovedObservable.remove(removed);
      godRays.dispose();
      custom.dispose();
      ssao.dispose();
      glow?.dispose();
      pipeline?.dispose();
    },
  };
}
