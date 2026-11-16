/** Platzieren, Duplizieren, Löschen und „Auf den Boden setzen". */
import { Ray } from '@babylonjs/core/Culling/ray';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { newEntityId, type EntitySpec, type Vec3 } from '../../shared/types';
import { entityIdOf, type GameContext } from '../core/context';
import { createFromItem, type CatalogItem } from './catalog';
import { BRICK_REF, STUD, brickState, brickWorldPos, placedFromEntity, restLevel, type PlacedBrick } from '../../shared/bricks';
import { fallbackPoint, placementY, snapValue, SNAP_POSITION } from './logic';
import { alignDeltas, boxFromTransform, cloneEntities, distributeDeltas, groupPatches, nextGroupName, ungroupPatches, type AlignMode, type Box, type Patches } from './multi';
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
  if (item.ref === BRICK_REF) snapBrickToStuds(ctx, entity);
  ctx.store.getState().addEntity(entity, { source: 'local' });
  ctx.store.getState().select(entity.id);
  return entity;
}

/** Fasst alle Änderungen in `fn` zu einem Undo-Schritt zusammen. */
export function inUndoGroup<T>(ctx: GameContext, fn: () => T): T {
  ctx.bus.emit('history.group.begin', {});
  try {
    return fn();
  } finally {
    ctx.bus.emit('history.group.end', {});
  }
}

const selectedEntities = (ctx: GameContext): EntitySpec[] => {
  const s = ctx.store.getState();
  return s.order.filter((id) => s.selectedIds.includes(id)).map((id) => s.entities[id]);
};

/** Welt-Box einer Entity (aus dem Knoten, sonst aus der Transform). */
export function boxOfEntity(ctx: GameContext, id: string): Box {
  const node = ctx.entityNodes.get(id);
  if (node) {
    node.computeWorldMatrix(true);
    const { min, max } = node.getHierarchyBoundingVectors(true);
    if (Number.isFinite(min.x) && Number.isFinite(max.x)) return { min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] };
  }
  return boxFromTransform(ctx.store.getState().entities[id].transform);
}

function addClones(ctx: GameContext, source: EntitySpec[], offset: Vec3): string[] {
  const clones = cloneEntities(source, offset);
  inUndoGroup(ctx, () => {
    for (const c of clones) ctx.store.getState().addEntity(c, { source: 'local' });
  });
  ctx.store.getState().selectMany(clones.map((c) => c.id));
  return clones.map((c) => c.id);
}

export function duplicateSelected(ctx: GameContext): string | null {
  const source = selectedEntities(ctx);
  if (source.length === 0) return null;
  return addClones(ctx, source, [1, 0, 0]).at(-1) ?? null;
}

export function deleteSelected(ctx: GameContext): void {
  const ids = [...ctx.store.getState().selectedIds];
  inUndoGroup(ctx, () => {
    for (const id of ids) ctx.store.getState().removeEntity(id, { source: 'local' });
  });
}

let clipboard: EntitySpec[] = [];
let pasteCount = 0;
export function copySelected(ctx: GameContext): number {
  clipboard = selectedEntities(ctx).map((e) => structuredClone(e));
  pasteCount = 0;
  return clipboard.length;
}
export function pasteClipboard(ctx: GameContext): string[] {
  if (clipboard.length === 0) return [];
  pasteCount += 1;
  return addClones(ctx, clipboard, [0.5 * pasteCount, 0, 0.5 * pasteCount]);
}

/** Wendet Patches je Entity als ein Undo-Schritt an. */
export function applyPatches(ctx: GameContext, patches: Patches): void {
  inUndoGroup(ctx, () => {
    for (const [id, patch] of Object.entries(patches)) ctx.store.getState().updateEntity(id, patch, { source: 'local' });
  });
}

export function groupSelected(ctx: GameContext, name?: string): void {
  const s = ctx.store.getState();
  if (s.selectedIds.length < 2) return;
  const names = s.order.map((id) => s.entities[id]?.groupName);
  applyPatches(ctx, groupPatches(s.selectedIds, s.entities, s.order, newEntityId('grp'), name?.trim() || nextGroupName(names)));
}

export function ungroupSelected(ctx: GameContext): void {
  const s = ctx.store.getState();
  applyPatches(ctx, ungroupPatches(s.selectedIds, s.entities, s.order));
}

/** Verschiebt die gewählten Objekte je um deltas[i] (Reihenfolge wie `ids`). */
export function moveBy(ctx: GameContext, ids: string[], deltas: Vec3[]): void {
  const s = ctx.store.getState();
  const patches: Patches = {};
  ids.forEach((id, i) => {
    const e = s.entities[id];
    const d = deltas[i];
    if (!e || !d || (d[0] === 0 && d[1] === 0 && d[2] === 0)) return;
    patches[id] = { transform: { ...e.transform, pos: [e.transform.pos[0] + d[0], e.transform.pos[1] + d[1], e.transform.pos[2] + d[2]] } };
  });
  applyPatches(ctx, patches);
}

export function alignSelected(ctx: GameContext, mode: AlignMode): void {
  const ids = ctx.store.getState().selectedIds;
  moveBy(ctx, ids, alignDeltas(ids.map((id) => boxOfEntity(ctx, id)), mode));
}
export function distributeSelected(ctx: GameContext, axis: 'x' | 'z'): void {
  const ids = ctx.store.getState().selectedIds;
  moveBy(ctx, ids, distributeDeltas(ids.map((id) => boxOfEntity(ctx, id)), axis));
}

/** Gemeinsames Patchen aller gewählten Objekte (z. B. Farbe, Physik). */
export function patchSelected(ctx: GameContext, make: (e: EntitySpec) => Partial<EntitySpec>): void {
  const s = ctx.store.getState();
  const patches: Patches = {};
  for (const id of s.selectedIds) if (s.entities[id]) patches[id] = make(s.entities[id]);
  applyPatches(ctx, patches);
}

export function dropSelectedToGround(ctx: GameContext): void {
  inUndoGroup(ctx, () => {
    for (const id of ctx.store.getState().selectedIds) dropToGround(ctx, id);
  });
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

/** Klemmbausteine rasten auf dem Noppenraster ein und setzen sich auf den Stein darunter. */
function snapBrickToStuds(ctx: GameContext, entity: EntitySpec): void {
  const st = brickState(entity.state);
  const gx = Math.round(entity.transform.pos[0] / STUD - st.w / 2);
  const gz = Math.round(entity.transform.pos[2] / STUD - st.d / 2);
  const { entities, order } = ctx.store.getState();
  const others = order.map((id) => entities[id]).filter((e): e is EntitySpec => !!e).map((e) => placedFromEntity(e, [0, 0, 0])).filter((b): b is PlacedBrick => !!b);
  const level = restLevel({ gx, gz, w: st.w, d: st.d }, others);
  const p = brickWorldPos({ gx, gz, w: st.w, d: st.d, level, plates: 1 }, [0, 0, 0]);
  entity.transform.pos = [p[0], Math.max(p[1], entity.transform.pos[1] - 0.001), p[2]];
}
