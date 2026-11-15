/**
 * Meer unter der Insel (Paket 23). Bei `environment.sea.mode === 'water'` verschwindet das Wolkenmeer und eine sehr große
 * Wasserfläche (Radius 900 m) liegt auf `handle.seaY`: spiegelt Himmel, Wolken und Insel (echtes Renderziel, solange die
 * Qualitätsstufe es erlaubt; sonst Ersatzdarstellung mit Himmelsglanz), geht über den Nebel in die Horizontfarbe über und
 * dunkelt mit dem Tageslicht ab. Zurück auf 'clouds' wird alles wieder abgebaut. Hooks und Regeln: siehe ../features.ts.
 */
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { EnvironmentSpec } from '../../../../shared/types';
import { getWaterManager, WaterSurface } from '../../../world/water/core';
import { readSea, SEA_TILE_M, type SeaOptions } from '../../../world/water/helpers';
import type { EnvironmentFeature, EnvironmentHandle } from '../features';

/**
 * Radius der Wasserfläche. Größer als die 900 m des Entwurfs: so liegt der Rand weit hinter dem Nebel und weniger als 2° unter dem
 * Horizont, ein sichtbarer Übergang zum Himmel entfällt. Die Himmelskugel (Radius 450) schreibt keine Tiefe, damit das Wasser dahinter sichtbar bleibt.
 */
export const SEA_RADIUS = 2400;

export function createSeaFeature(handle: EnvironmentHandle): EnvironmentFeature {
  let surface: WaterSurface | null = null;
  let mesh: Mesh | null = null;
  let current: SeaOptions = readSea(undefined);
  let skyDepthTouched = false;

  const styleOf = (o: SeaOptions) => ({ color: o.color, waves: o.waves, depth: 0.35, flow: 0.5 });

  const show = (): void => {
    if (surface) {
      surface.setStyle(styleOf(current));
      return;
    }
    try {
      const disc = CreateDisc('env.sea', { radius: SEA_RADIUS, tessellation: 48 }, handle.scene);
      disc.rotation.x = Math.PI / 2;
      disc.bakeCurrentTransformIntoVertices();
      disc.position.y = handle.seaY;
      disc.receiveShadows = false;
      disc.alwaysSelectAsActiveMesh = true;
      handle.post.excludeFromGlow(disc);
      mesh = disc;
      // Der Himmel (Kugel mit Radius 450) darf keine Tiefe schreiben, sonst verdeckt er das Wasser dahinter.
      const skyMat = handle.sky.mesh.material;
      if (skyMat) {
        skyMat.disableDepthWrite = true;
        skyDepthTouched = true;
      }
      surface = new WaterSurface(getWaterManager(handle.ctx), {
        name: 'env.sea',
        mesh: disc,
        kind: 'sea',
        size: () => ({ x: SEA_RADIUS * 2, z: SEA_RADIUS * 2 }),
        tile: SEA_TILE_M,
        style: styleOf(current),
      });
    } catch (error) {
      console.warn('[meer] Wasser konnte nicht angelegt werden, Wolkenmeer bleibt', error);
      hide();
      handle.clouds.setSeaVisible(true);
    }
  };

  const hide = (): void => {
    const s = surface;
    const m = mesh;
    surface = null;
    mesh = null;
    s?.dispose();
    if (m && !m.isDisposed()) m.dispose(false, true);
    if (skyDepthTouched) {
      skyDepthTouched = false;
      const skyMat = handle.sky.mesh.material;
      if (skyMat) skyMat.disableDepthWrite = false;
    }
  };

  return {
    id: 'sea',
    apply(env: EnvironmentSpec) {
      current = readSea(env.sea);
      if (current.water) {
        handle.clouds.setSeaVisible(false);
        show();
      } else {
        hide();
        handle.clouds.setSeaVisible(true);
      }
    },
    dispose() {
      hide();
      handle.clouds.setSeaVisible(true);
    },
  };
}
