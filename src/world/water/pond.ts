/**
 * Baustein „Wasser": flache Wasserfläche (Teich, See, Becken).
 * Ursprung am Boden: die Fläche liegt bei y = WATER_SURFACE_Y über dem Ursprung (knapp über dem Gras),
 * darunter ein dunkler Beckenrand (nasse Erde) und ein Beckenboden. Größe = scale (x/z in Metern, y bleibt 1).
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { EntitySpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { getWaterManager, WaterSurface } from './core';
import {
  BED_Y,
  RIM_Y,
  RIPPLE_TILE_M,
  VOLUME_DEPTH,
  WATER_SURFACE_Y,
  bedColor,
  readWaterParams,
  waterSize,
  type WaterShape,
} from './helpers';
import { createFoamTexture } from './textures';

export interface Pond {
  entityId: string;
  surface: WaterSurface;
  shape: WaterShape;
  root: TransformNode;
}
/** Alle gebauten Teiche (für Live-Änderungen und die Platscher-Erkennung). */
export const ponds = new Map<string, Pond>();

/** Flache Form in der XZ-Ebene (Durchmesser/Kantenlänge 1, Mitte im Ursprung, Normale nach oben). */
function flatShape(scene: Scene, name: string, shape: WaterShape, grow = 1, subdivisions = 1): Mesh {
  if (shape === 'rect') return CreateGround(name, { width: grow, height: grow, subdivisions }, scene);
  const disc = CreateDisc(name, { radius: 0.5 * grow, tessellation: 64 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.bakeCurrentTransformIntoVertices();
  return disc;
}

function litMaterial(scene: Scene, name: string, color: Color3, emissive = 0.1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = Color3.Black();
  m.emissiveColor = color.scale(emissive);
  return m;
}

export function buildPond(ctx: GameContext, entity: EntitySpec, root: TransformNode): void {
  const { scene } = ctx;
  const params = readWaterParams(entity);
  const id = entity.id;
  const manager = getWaterManager(ctx);

  const tag = (mesh: Mesh, y: number, pickable: boolean): Mesh => {
    mesh.parent = root;
    mesh.position.y = y;
    mesh.isPickable = pickable;
    mesh.metadata = { ...(mesh.metadata ?? {}), cpWater: true };
    return mesh;
  };

  // Beckenrand aus nasser Erde (etwas größer als die Fläche) – lässt den Teich eingefasst wirken
  const rim = tag(flatShape(scene, 'pond.rim', params.shape, 1.1), RIM_Y, true);
  rim.material = litMaterial(scene, 'pond.rimMat', new Color3(0.2, 0.14, 0.1), 0);

  // Beckenboden: durch die Brechung sichtbar, Tiefenfarbe
  const bed = tag(flatShape(scene, 'pond.bed', params.shape, 1.0), BED_Y, false);
  const bedRgb = bedColor(params.color, params.depth);
  bed.material = litMaterial(scene, 'pond.bedMat', new Color3(Math.pow(bedRgb[0], 2.2), Math.pow(bedRgb[1], 2.2), Math.pow(bedRgb[2], 2.2)), 0.6);
  manager.registerBed(bed);

  // Wasserfläche
  const surfMesh = tag(flatShape(scene, 'pond.surface', params.shape, 1.0, params.shape === 'rect' ? 6 : 1), WATER_SURFACE_Y, true);
  const surface = new WaterSurface(manager, {
    name: `pond.${id}`,
    mesh: surfMesh,
    kind: 'pond',
    size: () => waterSize([root.scaling.x, root.scaling.y, root.scaling.z]),
    tile: RIPPLE_TILE_M,
    style: { color: params.color, waves: params.waves, depth: params.depth, flow: params.flow },
  });

  // Weicher Saum
  const foam = tag(flatShape(scene, 'pond.foam', params.shape, 1.0), WATER_SURFACE_Y + 0.006, false);
  const foamMat = new StandardMaterial('pond.foamMat', scene);
  const foamTex = createFoamTexture(scene, params.shape);
  foamMat.diffuseTexture = foamTex;
  foamMat.useAlphaFromDiffuseTexture = true;
  foamMat.diffuseColor = new Color3(0.9, 0.95, 1);
  foamMat.emissiveColor = new Color3(0.05, 0.06, 0.07);
  foamMat.specularColor = Color3.Black();
  foamMat.backFaceCulling = false;
  foamMat.zOffset = -2;
  foam.material = foamMat;
  foam.alphaIndex = 5;

  // Auslöse-Volumen (unsichtbar): flacher Kasten unter der Fläche. Die Physik leitet daraus den Trigger ab.
  const volume = tag(CreateBox('pond.volume', { width: 1, height: VOLUME_DEPTH + WATER_SURFACE_Y, depth: 1 }, scene), (WATER_SURFACE_Y - VOLUME_DEPTH) / 2, false);
  volume.isVisible = false;
  volume.isPickable = false;

  const pond: Pond = { entityId: id, surface, shape: params.shape, root };
  ponds.set(id, pond);
  surfMesh.onDisposeObservable.addOnce(() => {
    if (ponds.get(id) === pond) ponds.delete(id);
    surface.dispose();
  });
}

/** Material oder Zustand geändert (ohne Neuaufbau): Farbe, Wellen, Tiefe, Strömung übernehmen. */
export function updatePond(entity: EntitySpec): void {
  const pond = ponds.get(entity.id);
  if (!pond) return;
  const p = readWaterParams(entity);
  pond.surface.setStyle({ color: p.color, waves: p.waves, depth: p.depth, flow: p.flow });
}
