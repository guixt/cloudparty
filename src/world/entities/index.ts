/**
 * Paket 4: Entity-Bibliothek. Gleicht den Store mit der Szene ab: pro Entity
 * ein Wurzelknoten (ctx.entityNodes), gebaut aus dem Prefab-Register.
 */
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { Material } from '@babylonjs/core/Materials/material';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { EntitySpec } from '../../../shared/types';
import { entityIdOf, tagEntityNode, type GameContext, type GameModule } from '../../core/context';
import { classifyChange } from './diff';
import { TweenManager } from './tween';
import { buildPlaceholder, isBuildOnly, setBuildMarkersVisible } from './parts';
import { getPrefab, onPrefabRegistered, updateLooks } from './prefabs';

export { PREFABS, createEntityFromPrefab, getPrefab, registerPrefab } from './prefabs';
export type { PrefabDef, PrefabCategory } from './prefabs';
export { modelUrlFromFile } from './model';

function applyTransform(root: TransformNode, entity: EntitySpec): void {
  const { pos, rot, scale } = entity.transform;
  root.position.set(pos[0], pos[1], pos[2]);
  if (!root.rotationQuaternion) root.rotationQuaternion = new Quaternion();
  root.rotationQuaternion.set(rot[0], rot[1], rot[2], rot[3]);
  root.scaling.set(scale[0], scale[1], scale[2]);
}

/** Schatten, Picking-Tags; nach dem Bauen und nach asynchronen Inhalten. */
function finalize(ctx: GameContext, root: TransformNode, entityId: string): void {
  tagEntityNode(root, entityId);
  for (const mesh of root.getChildMeshes(false)) {
    if (isBuildOnly(mesh) || mesh.getTotalVertices() === 0) continue;
    mesh.receiveShadows = true;
    ctx.shadows.add(mesh);
  }
}

function isInteractive(entity: EntitySpec | undefined): boolean {
  if (!entity) return false;
  if (entity.script?.enabled && entity.script.source.trim()) return true;
  const seats = entity.state?.seats;
  return typeof seats === 'number' && seats > 0;
}

/**
 * Räumt einen Entity-Knoten auf. Instanzen (Klemmbausteine) teilen sich Material und Geometrie mit ihrem Master:
 * deren Material darf NICHT mit entsorgt werden, sonst verliert der Master sein Material (und alle anderen Steine auch).
 */
export function disposeNode(node: TransformNode): void {
  const own = new Set<Material>();
  for (const mesh of node.getChildMeshes(false)) {
    const instanced = (mesh as { sourceMesh?: unknown }).sourceMesh !== undefined;
    if (!instanced && mesh.material) own.add(mesh.material);
  }
  node.dispose(false, false);
  const scene = node.getScene();
  for (const m of own) if (scene.materials.includes(m)) m.dispose(false, true);
}

const entities: GameModule = {
  id: 'entities',
  init(ctx) {
    const { bus, store, scene, entityNodes } = ctx;
    const disposers: (() => void)[] = [];
    let hoverCursor = false;

    const emitCreated = (id: string, node: TransformNode) => bus.emit('entity.node.created', { id, node });

    const create = (entity: EntitySpec) => {
      const root = new TransformNode(`entity.${entity.id}`, scene);
      applyTransform(root, entity);
      entityNodes.set(entity.id, root);
      const def = getPrefab(entity.ref);
      let pending: void | Promise<void> = undefined;
      try {
        if (def) pending = def.build(ctx, entity, root);
        else buildPlaceholder(scene, root);
      } catch (error) {
        console.warn(`[entities] Prefab "${entity.ref}" konnte nicht gebaut werden`, error);
        for (const child of root.getChildren()) child.dispose(false, true);
        buildPlaceholder(scene, root, '#d9534f', '!');
        pending = undefined;
      }
      finalize(ctx, root, entity.id);
      emitCreated(entity.id, root);
      if (pending) {
        pending
          .catch((error) => console.warn(`[entities] Prefab "${entity.ref}" fehlgeschlagen`, error))
          .then(() => {
            if (root.isDisposed() || entityNodes.get(entity.id) !== root) return;
            finalize(ctx, root, entity.id);
            // Inhalt hat sich geändert (z. B. Modell geladen): Abnehmer (Physik …) neu informieren.
            bus.emit('entity.node.disposed', { id: entity.id });
            emitCreated(entity.id, root);
          });
      }
    };

    const destroy = (id: string) => {
      const node = entityNodes.get(id);
      if (!node) return;
      entityNodes.delete(id);
      bus.emit('entity.node.disposed', { id });
      disposeNode(node);
    };

    const rebuildAll = () => {
      for (const id of [...entityNodes.keys()]) destroy(id);
      const state = store.getState();
      for (const id of state.order) {
        const entity = state.entities[id];
        if (entity) create(entity);
      }
    };

    const tweens = new TweenManager(ctx);
    disposers.push(() => tweens.dispose());
    rebuildAll();
    disposers.push(
      bus.on('world.loaded', rebuildAll),
      bus.on('entity.added', ({ entity }) => {
        destroy(entity.id);
        create(entity);
      }),
      bus.on('entity.removed', ({ entity }) => destroy(entity.id)),
      bus.on('entity.changed', ({ entity, prev }) => {
        const node = entityNodes.get(entity.id);
        const def = getPrefab(entity.ref);
        const change = classifyChange(prev, entity, def?.stateKeys);
        if (!node || change.rebuild || (change.material && def?.rebuildOnMaterial)) {
          destroy(entity.id);
          create(entity);
          return;
        }
        if (change.transform) applyTransform(node, entity);
        if (change.material) updateLooks(node, entity.material);
      }),
      bus.on('mode.changed', ({ mode }) => {
        for (const node of entityNodes.values()) setBuildMarkersVisible(node, mode === 'build');
        if (mode === 'build') setCursor(false);
      }),
      onPrefabRegistered((ref) => {
        const state = store.getState();
        for (const id of state.order) {
          const entity = state.entities[id];
          if (entity?.ref === ref) {
            destroy(id);
            create(entity);
          }
        }
      }),
    );

    function setCursor(pointer: boolean) {
      if (pointer === hoverCursor) return;
      hoverCursor = pointer;
      ctx.canvas.style.cursor = pointer ? 'pointer' : '';
    }

    const observer = scene.onPointerObservable.add((info) => {
      const state = store.getState();
      if (info.type === PointerEventTypes.POINTERMOVE) {
        if (state.mode !== 'play') return setCursor(false);
        const id = entityIdOf(info.pickInfo?.hit ? info.pickInfo.pickedMesh : null);
        setCursor(!!id && isInteractive(state.entities[id]));
        return;
      }
      if (info.type !== PointerEventTypes.POINTERTAP || state.mode !== 'play') return;
      const pick = info.pickInfo;
      const entityId = entityIdOf(pick?.pickedMesh);
      if (!entityId || !pick?.pickedPoint) return;
      const { identity } = ctx.localAvatar;
      bus.emit('entity.clicked', {
        entityId,
        avatar: { id: identity.id, name: identity.displayName },
        point: [pick.pickedPoint.x, pick.pickedPoint.y, pick.pickedPoint.z],
      });
    });
    disposers.push(() => {
      scene.onPointerObservable.remove(observer);
      for (const id of [...entityNodes.keys()]) destroy(id);
      setCursor(false);
    });
    (entities as { dispose?: () => void }).dispose = () => disposers.splice(0).forEach((d) => d());
  },
};
export default entities;
