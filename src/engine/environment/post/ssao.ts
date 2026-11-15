/** Umgebungs-Verdeckung (SSAO2) für eine Welt im Meter-Maßstab. */
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import type { Scene } from '@babylonjs/core/scene';

export interface Ssao {
  setEnabled(on: boolean): void;
  attach(camera: Camera): void;
  isActive(): boolean;
  dispose(): void;
}

export function createSsao(scene: Scene): Ssao {
  const name = 'env.ssao';
  let pipeline: SSAO2RenderingPipeline | null = null;
  let broken = false;

  const build = () => {
    try {
      const p = new SSAO2RenderingPipeline(name, scene, { ssaoRatio: 0.5, blurRatio: 1 }, scene.cameras.slice(), false);
      p.radius = 1.2;
      p.totalStrength = 1.6;
      p.samples = 16;
      p.maxZ = 60;
      p.minZAspect = 0.4;
      p.expensiveBlur = true;
      pipeline = p;
    } catch (error) {
      broken = true;
      pipeline = null;
      console.warn('[environment] SSAO nicht verfügbar', error);
    }
  };
  const drop = () => {
    try {
      pipeline?.dispose();
    } catch {
      /* bereits freigegeben */
    }
    pipeline = null;
  };

  return {
    setEnabled(on) {
      if (on && !pipeline && !broken) build();
      else if (!on && pipeline) drop();
    },
    attach(camera) {
      if (!pipeline) return;
      try {
        scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(name, camera);
      } catch (error) {
        console.warn('[environment] SSAO konnte nicht an die Kamera gehängt werden', error);
      }
    },
    isActive: () => pipeline !== null,
    dispose: drop,
  };
}
