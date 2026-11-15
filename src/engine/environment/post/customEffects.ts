/** Zusatz-Nachbearbeitung der Looks: Comic (Cel-Shading + Konturen) und Retro (Pixel + Farbreduktion). */
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Constants } from '@babylonjs/core/Engines/constants';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import type { Scene } from '@babylonjs/core/scene';
import type { LookShader } from './looks';
import { COMIC_FRAGMENT, COMIC_SHADER, RETRO_FRAGMENT, RETRO_SHADER } from './shaders';

let registered = false;
function register(): void {
  if (registered) return;
  registered = true;
  Effect.ShadersStore[`${COMIC_SHADER}FragmentShader`] = COMIC_FRAGMENT;
  Effect.ShadersStore[`${RETRO_SHADER}FragmentShader`] = RETRO_FRAGMENT;
}

export interface CustomEffects {
  /** Wählt Effekt und Stärke; bei Wechsel der Art werden die Nachbearbeitungen neu aufgebaut. */
  set(kind: LookShader, amount: number): void;
  /** Baut neu auf (z. B. nachdem die Pipeline ihre Nachbearbeitungen neu angelegt hat, damit die Reihenfolge stimmt). */
  rebuild(): void;
  dispose(): void;
}

export function createCustomEffects(scene: Scene, keepDepth: () => boolean): CustomEffects {
  register();
  let kind: LookShader = 'none';
  let amount = 0;
  let processes = new Map<Camera, PostProcess>();
  let broken = false;

  const dropAll = () => {
    for (const [camera, pp] of processes) {
      try {
        pp.dispose(camera);
        if (kind === 'comic' && !keepDepth()) scene.disableDepthRenderer(camera);
      } catch {
        /* bereits freigegeben */
      }
    }
    processes = new Map();
  };

  const create = (camera: Camera) => {
    if (broken || kind === 'none' || processes.has(camera)) return;
    try {
      let pp: PostProcess;
      if (kind === 'comic') {
        const depth = scene.enableDepthRenderer(camera, false);
        pp = new PostProcess('env.comic', COMIC_SHADER, ['texel', 'farMeters', 'amount', 'thickness'], ['depthSampler'], 1, camera, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, undefined, false);
        pp.onApplyObservable.add((effect) => {
          effect.setTexture('depthSampler', depth.getDepthMap());
          effect.setFloat2('texel', 1 / pp.width, 1 / pp.height);
          effect.setFloat('farMeters', camera.minZ + camera.maxZ);
          effect.setFloat('amount', amount);
          effect.setFloat('thickness', Math.max(1, pp.height / 300));
        });
      } else {
        pp = new PostProcess('env.retro', RETRO_SHADER, ['screenSize', 'pixelSize', 'amount'], null, 1, camera, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, undefined, false);
        pp.onApplyObservable.add((effect) => {
          effect.setFloat2('screenSize', pp.width, pp.height);
          effect.setFloat('pixelSize', Math.min(6, Math.max(2, Math.round(pp.height / 180))));
          effect.setFloat('amount', amount);
        });
      }
      processes.set(camera, pp);
    } catch (error) {
      broken = true;
      console.warn('[environment] Look-Effekt nicht verfügbar', error);
    }
  };

  const added = scene.onNewCameraAddedObservable.add(create);
  const removed = scene.onCameraRemovedObservable.add((camera) => {
    processes.delete(camera);
  });

  return {
    set(next, nextAmount) {
      amount = nextAmount;
      const want: LookShader = nextAmount > 0.002 ? next : 'none';
      if (want === kind) return;
      dropAll();
      kind = want;
      for (const camera of scene.cameras) create(camera);
    },
    rebuild() {
      if (kind === 'none') return;
      dropAll();
      for (const camera of scene.cameras) create(camera);
    },
    dispose() {
      scene.onNewCameraAddedObservable.remove(added);
      scene.onCameraRemovedObservable.remove(removed);
      dropAll();
      kind = 'none';
    },
  };
}
