/** Platzieren, Duplizieren, Löschen und „Auf den Boden setzen". */
import { Ray } from '@babylonjs/core/Culling/ray';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { newEntityId, type EntitySpec, type Vec3 } from '../../shared/types';
import { entityIdOf, type GameContext } from '../core/context';
import { createFromItem, type CatalogItem } from './catalog';
import { fallbackPoint, placementY, snapValue, SNAP_POSITION } from './logic';
import { buildState } from './state';

const isSurface = (mesh: AbstractMesh) => entityIdOf(mesh) !== null || (mesh.metadata as { isGround?: boolean } | null)?.isGround === true;
/** Nur Entities und Boden zählen als Auflagefläche (Avatare, Gizmos, Effekte nicht). */
const pickable = (excludeId?: string) => (mesh: AbstractMesh) =>
  mesh.isPickable && mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0 && isSurface(mesh) && (!excludeId || entityIdOf(mesh) !== excludeId);

/** Auflagepunkt in der Bildschirmmitte (oder Ersatzpunkt 6 m voraus bei y = 0). */
export function surfaceAtScreenCenter(ctx: GameContext): Vec3 {
  const { scene, engine } = ctx;
  const camera = scene.activeCamera;
  if (!camera) return [0, 0, 0];
  const ray = scene.createPickingRay(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2, Matrix.Identity(), camera);
  const hit = scene.pickWithRay(ray, pickable());
  if (hit?.hit && hit.pickedPoint && hit.distance < 150) return [hit.pickedPoint.x, hit.pickedPoint.y, hit.pickedPoint.z];
  const o = ray.origin;
  const d = ray.direction;
  return fallbackPoint([o.x, o.y, o.z], [d.x, d.y, d.z], 6);
}

/** Legt einen Baustein auf die Fläche `surface` (Standard: Bildschirmmitte) und wählt ihn aus. */
export function placeItem(ctx: GameContext, item: CatalogItem, surface?: Vec3): EntitySpec {
  const point = surface ?? surfaceAtScreenCenter(ctx);
  const snap = buildState.getState().snap;
  const x = snap ? snapValue(point[0], SNAP_POSITION) : point[0];
  const z = snap ? snapValue(point[2], SNAP_POSITION) : point[2];
  const y = placementY(point[1], item.anchor, item.scale[1], item.baseHeight) + (item.lift ?? 0);
  const entity = createFromItem(item, [x, point[1], z], y);
  ctx.store.getState().addEntity(entity, { source: 'local' });
  ctx.store.getState().select(entity.id);
  return entity;
}

export function duplicateSelected(ctx: GameContext): string | null {
  const state = ctx.store.getState();
  const id = state.selection;
  const source = id ? state.entities[id] : undefined;
  if (!source) return null;
  const copy = structuredClone(source);
  copy.id = newEntityId();
  copy.transform.pos = [source.transform.pos[0] + 1, source.transform.pos[1], source.transform.pos[2]];
  state.addEntity(copy, { source: 'local' });
  state.select(copy.id);
  return copy.id;
}

export function deleteSelected(ctx: GameContext): void {
  const state = ctx.store.getState();
  if (state.selection) state.removeEntity(state.selection, { source: 'local' });
}

/** Setzt die Entity so ab, dass ihre Unterkante auf der Fläche darunter liegt. */
export function dropToGround(ctx: GameContext, id: string): void {
  const entity = ctx.store.getState().entities[id];
  const node = ctx.entityNodes.get(id);
  if (!entity || !node) return;
  node.computeWorldMatrix(true);
  const { min, max } = node.getHierarchyBoundingVectors(true);
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const ray = new Ray(new Vector3(cx, min.y + (max.y - min.y) / 2, cz), new Vector3(0, -1, 0), 500);
  const hit = ctx.scene.pickWithRay(ray, pickable(id));
  const surfaceY = hit?.hit && hit.pickedPoint ? hit.pickedPoint.y : 0;
  const dy = surfaceY - min.y;
  if (Math.abs(dy) < 1e-4) return;
  const pos = entity.transform.pos;
  ctx.store.getState().updateEntity(id, { transform: { ...entity.transform, pos: [pos[0], pos[1] + dy, pos[2]] } }, { source: 'local' });
}
