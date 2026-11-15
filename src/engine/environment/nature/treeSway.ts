/** Bäume im Wind: Laub-Kindknoten schwingen leicht (nur Darstellung, nie der Store). */
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { EnvironmentHandle } from '../features';

interface Leaf {
  mesh: Mesh;
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
}
interface Tree {
  node: TransformNode;
  leaves: Leaf[];
  phase: number;
}

const TREE_REF = 'EntitySpec.tree';
export const SWAY_AMPLITUDE = 0.03;

function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 6283) / 1000;
}

/** Laub = alle direkten Mesh-Kinder außer Rinde (Material „bark"). */
function collectLeaves(node: TransformNode): Leaf[] {
  const leaves: Leaf[] = [];
  for (const child of node.getChildren(undefined, true)) {
    const mesh = child as Mesh;
    if (typeof mesh.getTotalVertices !== 'function' || mesh.rotationQuaternion) continue;
    if (/bark/i.test(mesh.material?.name ?? '')) continue;
    if (mesh.position.y < 0.9) continue;
    leaves.push({ mesh, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, rx: mesh.rotation.x, rz: mesh.rotation.z });
  }
  return leaves;
}

export interface TreeSway {
  update(time: number, wind: number): void;
  dispose(): void;
}

export function createTreeSway(handle: EnvironmentHandle): TreeSway {
  const { ctx } = handle;
  const trees = new Map<string, Tree>();

  const restore = (tree: Tree) => {
    for (const l of tree.leaves) {
      if (l.mesh.isDisposed()) continue;
      l.mesh.position.set(l.x, l.y, l.z);
      l.mesh.rotation.x = l.rx;
      l.mesh.rotation.z = l.rz;
    }
  };
  const add = (id: string, node: TransformNode) => {
    const old = trees.get(id);
    if (old) restore(old);
    trees.delete(id);
    if (ctx.store.getState().entities[id]?.ref !== TREE_REF) return;
    const leaves = collectLeaves(node);
    if (leaves.length > 0) trees.set(id, { node, leaves, phase: phaseOf(id) });
  };
  const offs = [
    ctx.bus.on('entity.node.created', ({ id, node }) => add(id, node)),
    ctx.bus.on('entity.node.disposed', ({ id }) => trees.delete(id)),
    ctx.bus.on('world.loaded', () => {
      trees.clear();
      for (const [id, node] of ctx.entityNodes) add(id, node);
    }),
  ];
  for (const [id, node] of ctx.entityNodes) add(id, node);

  return {
    update(time, wind) {
      for (const [id, tree] of trees) {
        if (tree.node.isDisposed()) {
          trees.delete(id);
          continue;
        }
        const a = SWAY_AMPLITUDE * wind;
        const tx = a * (Math.sin(time * 1.3 + tree.phase) + 0.5 * Math.sin(time * 2.7 + tree.phase * 1.3));
        const tz = a * 0.6 * Math.sin(time * 1.1 + tree.phase * 0.7 + 1.2);
        for (const l of tree.leaves) {
          if (l.mesh.isDisposed()) continue;
          l.mesh.rotation.z = l.rz + tx;
          l.mesh.rotation.x = l.rx + tz;
          l.mesh.position.x = l.x - l.y * tx;
          l.mesh.position.z = l.z + l.y * tz;
        }
      }
    },
    dispose() {
      for (const off of offs) off();
      for (const tree of trees.values()) restore(tree);
      trees.clear();
    },
  };
}
