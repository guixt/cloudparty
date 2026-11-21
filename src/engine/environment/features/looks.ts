/**
 * Stimmungsvorlagen (`environment.look`), Qualitätsstufen für Nachbearbeitung und Schatten, Sonnenstrahlen
 * und Fotomodus (Taste P).
 */
import type { EnvironmentSpec } from '../../../../shared/types';
import type { QualityFeatures } from '../../quality';
import type { EnvironmentFeature, EnvironmentHandle } from '../features';
import { createPhotoMode } from '../post/photo';
import { resolveLook, shadowOptionsFor } from '../post/looks';

export function createLooksFeature(handle: EnvironmentHandle): EnvironmentFeature {
  const { post, shadows, ctx } = handle;
  let shadowSize = 0;
  let firstLook = true;
  let lastSun = '';

  const photo = createPhotoMode(post, ctx.bus);
  const onKey = (event: KeyboardEvent) => {
    if (event.repeat) return;
    photo.handleKey(event);
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  return {
    id: 'looks',
    apply(env: EnvironmentSpec) {
      post.setLook(resolveLook(env.look), firstLook);
      firstLook = false;
    },
    update(dt: number) {
      post.update(dt);
      const dir = handle.getSunDirection();
      const key = `${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)}`;
      if (key !== lastSun) {
        lastSun = key;
        post.setSun(dir, handle.sun.diffuse);
      }
    },
    onQuality(features: QualityFeatures) {
      post.setQuality(features);
      const opts = shadowOptionsFor(features);
      try {
        if (shadows.usePercentageCloserFiltering !== opts.soft) shadows.usePercentageCloserFiltering = opts.soft;
        if (opts.size !== shadowSize) {
          shadowSize = opts.size;
          shadows.getShadowMap()?.resize(opts.size);
        }
      } catch (error) {
        console.warn('[environment] Schatten-Einstellung fehlgeschlagen', error);
      }
      if (!features.depthOfField && photo.isOn()) photo.reset();
    },
    dispose() {
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      photo.reset();
    },
  };
}
