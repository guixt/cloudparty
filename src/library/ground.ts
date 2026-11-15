/** Bodenpunkt unter dem Mauszeiger (gleiche Auflageflächen wie src/build/placement.ts). */
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Vec3 } from '../../shared/types';
import { entityIdOf, type GameContext } from '../core/context';

const isSurface = (mesh: AbstractMesh) => entityIdOf(mesh) !== null || (mesh.metadata as { isGround?: boolean } | null)?.isGround === true;
const pickable = (mesh: AbstractMesh) => mesh.isPickable && mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0 && isSurface(mesh);

/** Weltpunkt unter Bildschirmposition (clientX/Y); Ersatz: Schnitt des Strahls mit y = 0; sonst null. */
export function groundPointAtClient(ctx: GameContext, clientX: number, clientY: number): Vec3 | null {
  const camera = ctx.scene.activeCamera;
  if (!camera) return null;
  const rect = ctx.canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const px = ((clientX - rect.left) * ctx.engine.getRenderWidth()) / rect.width;
  const py = ((clientY - rect.top) * ctx.engine.getRenderHeight()) / rect.height;
  const ray = ctx.scene.createPickingRay(px, py, Matrix.Identity(), camera);
  const hit = ctx.scene.pickWithRay(ray, pickable);
  if (hit?.hit && hit.pickedPoint && hit.distance < 300) return [hit.pickedPoint.x, hit.pickedPoint.y, hit.pickedPoint.z];
  if (Math.abs(ray.direction.y) < 1e-4) return null;
  const t = -ray.origin.y / ray.direction.y;
  if (t < 0 || t > 300) return null;
  return [ray.origin.x + ray.direction.x * t, 0, ray.origin.z + ray.direction.z * t];
}
