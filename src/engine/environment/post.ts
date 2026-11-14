/**
 * Nachbearbeitung: Tone-Mapping (ACES), Bloom, FXAA, leichte Farbkorrektur und GlowLayer.
 * Die Pipeline hängt an allen Kameras, auch an später hinzugefügten.
 */
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { Scene } from '@babylonjs/core/scene';

export interface PostProcessing {
  setExposure(exposure: number): void;
  excludeFromGlow(mesh: AbstractMesh): void;
  dispose(): void;
}

export function createPostProcessing(scene: Scene): PostProcessing {
  const name = 'env.pipeline';
  let pipeline: DefaultRenderingPipeline | null = null;
  try {
    pipeline = new DefaultRenderingPipeline(name, true, scene, [], true);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.9;
    pipeline.bloomWeight = 0.18;
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
    if (ip.colorCurves) {
      ip.colorCurves.globalSaturation = -8;
      ip.colorCurves.globalExposure = 0;
    }
  } catch (error) {
    console.warn('[environment] Post-Processing nicht verfügbar', error);
    pipeline = null;
  }

  const attach = (camera: Camera) => {
    if (!pipeline) return;
    if (camera.maxZ < 2000) camera.maxZ = 2000;
    try {
      scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(name, camera);
    } catch (error) {
      console.warn('[environment] Kamera konnte nicht an die Pipeline gehängt werden', error);
    }
  };
  for (const camera of scene.cameras) attach(camera);
  const added = scene.onNewCameraAddedObservable.add(attach);

  let glow: GlowLayer | null = null;
  try {
    glow = new GlowLayer('env.glow', scene, { blurKernelSize: 24, mainTextureRatio: 0.5 });
    glow.intensity = 0.55;
  } catch (error) {
    console.warn('[environment] GlowLayer nicht verfügbar', error);
  }

  return {
    setExposure(exposure) {
      if (pipeline) pipeline.imageProcessing.exposure = exposure;
    },
    excludeFromGlow(mesh) {
      glow?.addExcludedMesh(mesh as never);
    },
    dispose() {
      scene.onNewCameraAddedObservable.remove(added);
      glow?.dispose();
      pipeline?.dispose();
    },
  };
}
