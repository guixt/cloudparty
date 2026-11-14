/**
 * STUB des Fundaments – Paket 4 (Entity-Bibliothek) ersetzt diese Datei.
 * Liefert vorerst: Würfel/Kugel/Zylinder pro Entity, Farbe, Transform-Abgleich,
 * ctx.entityNodes, 'entity.node.*'-Ereignisse und 'entity.clicked' im Spielmodus.
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import type { EntitySpec } from '../../../shared/types';
import { entityIdOf, tagEntityNode, type GameContext, type GameModule } from '../../core/context';

function build(ctx: GameContext, entity: EntitySpec): TransformNode {
  const { scene } = ctx;
  const root = new TransformNode(`entity.${entity.id}`, scene);
  if (entity.ref !== 'EntitySpec.avatar-spawn') {
    const mesh =
      entity.ref === 'EntitySpec.sphere'
        ? CreateSphere('mesh', { diameter: 1 }, scene)
        : entity.ref === 'EntitySpec.cylinder'
          ? CreateCylinder('mesh', { diameter: 1, height: 1 }, scene)
          : CreateBox('mesh', { size: 1 }, scene);
    mesh.parent = root;
    const material = new StandardMaterial('mat', scene);
    material.diffuseColor = Color3.FromHexString(entity.material?.color ?? '#cccccc');
    mesh.material = material;
    mesh.receiveShadows = true;
    ctx.shadows.add(mesh);
  }
  applyTransform(root, entity);
  tagEntityNode(root, entity.id);
  return root;
}

function applyTransform(root: TransformNode, entity: EntitySpec) {
  const { pos, rot, scale } = entity.transform;
  root.position.set(pos[0], pos[1], pos[2]);
  root.rotationQuaternion = new Quaternion(rot[0], rot[1], rot[2], rot[3]);
  root.scaling.set(scale[0], scale[1], scale[2]);
}

const entities: GameModule = {
  id: 'entities',
  init(ctx) {
    const { bus, store, scene, entityNodes } = ctx;
    const create = (entity: EntitySpec) => {
      const node = build(ctx, entity);
      entityNodes.set(entity.id, node);
      bus.emit('entity.node.created', { id: entity.id, node });
    };
    const destroy = (id: string) => {
      const node = entityNodes.get(id);
      if (!node) return;
      entityNodes.delete(id);
      bus.emit('entity.node.disposed', { id });
      node.dispose(false, true);
    };
    const rebuildAll = () => {
      for (const id of [...entityNodes.keys()]) destroy(id);
      const state = store.getState();
      for (const id of state.order) create(state.entities[id]);
    };

    rebuildAll();
    bus.on('world.loaded', rebuildAll);
    bus.on('entity.added', ({ entity }) => create(entity));
    bus.on('entity.removed', ({ entity }) => destroy(entity.id));
    bus.on('entity.changed', ({ entity, prev }) => {
      const sameLook = entity.ref === prev.ref && JSON.stringify(entity.material) === JSON.stringify(prev.material);
      const node = entityNodes.get(entity.id);
      if (sameLook && node) {
        applyTransform(node, entity);
      } else {
        destroy(entity.id);
        create(entity);
      }
    });

    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP || store.getState().mode !== 'play') return;
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
  },
};
export default entities;
