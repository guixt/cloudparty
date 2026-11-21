/** Grundflächen (XZ) von Objekten, unter denen kein Gras wachsen soll. */
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { EntitySpec } from '../../../../shared/types';
import type { Rect } from './blades';

export const FOOTPRINT_PADDING = 0.2;
/** Nur Teile, die den Boden berühren (Unterkante unter dieser Höhe), zählen. */
export const GROUND_TOUCH_HEIGHT = 0.4;

/** Soll die Entity Gras verdrängen? (statische Körper, Startpunkte und Wasserflächen) */
export function blocksGrass(entity: Pick<EntitySpec, 'ref' | 'physics'> | undefined): boolean {
  if (!entity) return false;
  return entity.physics?.mode === 'static' || entity.ref === 'EntitySpec.avatar-spawn' || entity.ref === 'EntitySpec.water';
}

export function padRect(r: Rect, pad = FOOTPRINT_PADDING): Rect {
  return { minX: r.minX - pad, maxX: r.maxX + pad, minZ: r.minZ - pad, maxZ: r.maxZ + pad };
}

/** Rechtecke der bodennahen Meshes unter einem Entity-Knoten. */
export function footprintRects(node: TransformNode): Rect[] {
  const rects: Rect[] = [];
  node.computeWorldMatrix(true);
  for (const mesh of node.getChildMeshes(false) as AbstractMesh[]) {
    if (!mesh.isEnabled() || (mesh.metadata as { buildOnly?: boolean } | null)?.buildOnly) continue;
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    if (box.minimumWorld.y > GROUND_TOUCH_HEIGHT || box.maximumWorld.y < 0) continue;
    rects.push(padRect({ minX: box.minimumWorld.x, maxX: box.maximumWorld.x, minZ: box.minimumWorld.z, maxZ: box.maximumWorld.z }));
  }
  return rects;
}
