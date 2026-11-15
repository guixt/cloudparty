/** Sonnenstrahlen: volumetrisches Streulicht (Babylon) mit einer Sonnenscheibe in Richtung der Sonne. */
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { VolumetricLightScatteringPostProcess } from '@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess';
import type { Scene } from '@babylonjs/core/scene';
import { godRayStrength } from './looks';

const BASE_EXPOSURE = 0.32;
const DISC_DISTANCE = 380;

export interface GodRays {
  setEnabled(on: boolean): void;
  setSun(direction: Vector3, color?: Color3): void;
  update(): void;
  readonly disc: Mesh | null;
  dispose(): void;
}

export function createGodRays(scene: Scene, excluded: () => AbstractMesh[], onDisc: (mesh: AbstractMesh) => void): GodRays {
  let enabled = false;
  let broken = false;
  let disc: Mesh | null = null;
  let vls: VolumetricLightScatteringPostProcess | null = null;
  let camera: Camera | null = null;
  const sun = new Vector3(0, 1, 0);

  const ensureDisc = (): Mesh => {
    if (disc) return disc;
    disc = CreateSphere('env.godraySun', { diameter: 24, segments: 12 }, scene);
    disc.infiniteDistance = true;
    disc.isPickable = false;
    disc.applyFog = false;
    disc.alwaysSelectAsActiveMesh = true;
    const mat = new StandardMaterial('env.godraySunMat', scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 0.95, 0.8);
    mat.fogEnabled = false;
    disc.material = mat;
    disc.position.copyFrom(sun).scaleInPlace(DISC_DISTANCE);
    onDisc(disc);
    return disc;
  };

  const drop = () => {
    if (vls) {
      try {
        if (camera) vls.dispose(camera);
      } catch {
        /* bereits freigegeben */
      }
      vls = null;
    }
    camera = null;
  };

  return {
    get disc() {
      return disc;
    },
    setEnabled(on) {
      enabled = on && !broken;
      if (!enabled) {
        drop();
        if (disc) disc.setEnabled(false);
      }
    },
    setSun(direction, color) {
      sun.copyFrom(direction);
      if (disc) {
        disc.position.copyFrom(sun).scaleInPlace(DISC_DISTANCE);
        if (color && disc.material) (disc.material as StandardMaterial).emissiveColor = color;
      }
    },
    update() {
      if (!enabled || broken) return;
      const cam = scene.activeCamera;
      if (!cam) return;
      const forward = cam.getForwardRay(1).direction;
      const elevation = (Math.asin(Math.min(1, Math.max(-1, sun.y))) * 180) / Math.PI;
      const strength = godRayStrength(elevation, Vector3.Dot(forward, sun));
      if (strength < 0.01) {
        drop();
        if (disc) disc.setEnabled(false);
        return;
      }
      try {
        if (vls && camera !== cam) drop();
        if (!vls) {
          const mesh = ensureDisc();
          mesh.setEnabled(true);
          vls = new VolumetricLightScatteringPostProcess('env.godrays', 0.5, cam, mesh, 40, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, scene.getEngine(), false);
          vls.weight = 0.6;
          vls.decay = 0.95;
          vls.density = 0.8;
          for (const m of excluded()) vls.excludedMeshes.push(m);
          camera = cam;
        }
        vls.exposure = BASE_EXPOSURE * strength;
      } catch (error) {
        broken = true;
        drop();
        console.warn('[environment] Sonnenstrahlen nicht verfügbar', error);
      }
    },
    dispose() {
      drop();
      disc?.material?.dispose();
      disc?.dispose();
      disc = null;
    },
  };
}
