/** Kleine Bauhelfer für Prefabs. */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Material } from '@babylonjs/core/Materials/material';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext } from '../../core/context';

/** Hängt ein Mesh an den Elternknoten und setzt Material und Position. */
export function place<T extends AbstractMesh>(mesh: T, parent: TransformNode, material: Material | null, x = 0, y = 0, z = 0): T {
  mesh.parent = parent;
  if (material) mesh.material = material;
  mesh.position.set(x, y, z);
  return mesh;
}

/** Quader mit Unterkante bei y (nicht Mitte). */
export function slab(scene: Scene, parent: TransformNode, material: Material, w: number, h: number, d: number, x: number, yBottom: number, z: number): Mesh {
  return place(CreateBox('box', { width: w, height: h, depth: d }, scene), parent, material, x, yBottom + h / 2, z);
}

/** Zylinder mit Unterkante bei y. */
export function post(scene: Scene, parent: TransformNode, material: Material, dTop: number, dBottom: number, h: number, x: number, yBottom: number, z: number, tessellation = 16): Mesh {
  return place(CreateCylinder('cyl', { diameterTop: dTop, diameterBottom: dBottom, height: h, tessellation }, scene), parent, material, x, yBottom + h / 2, z);
}

/** Markiert ein Mesh als nur im Build-Modus sichtbar (Marker). */
export function markBuildOnly(ctx: GameContext, mesh: AbstractMesh): void {
  mesh.metadata = { ...(mesh.metadata ?? {}), buildOnly: true };
  mesh.isVisible = ctx.store.getState().mode === 'build';
}

export function isBuildOnly(mesh: { metadata?: unknown }): boolean {
  return !!(mesh.metadata as { buildOnly?: boolean } | null)?.buildOnly;
}

export function setBuildMarkersVisible(root: TransformNode, visible: boolean): void {
  for (const mesh of root.getChildMeshes(false)) if (isBuildOnly(mesh)) mesh.isVisible = visible;
}

/** Neutraler Platzhalter (Fragezeichen). `tone` färbt den Rand (z. B. rot bei Fehlern). */
export function buildPlaceholder(scene: Scene, root: TransformNode, tone = '#6b7a99', label = '?'): Mesh {
  const mesh = CreateBox('placeholder', { size: 1 }, scene);
  const tex = new DynamicTexture('placeholderTex', { width: 128, height: 128 }, scene, true);
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = '#dfe6f5';
  c.fillRect(0, 0, 128, 128);
  c.strokeStyle = tone;
  c.lineWidth = 12;
  c.strokeRect(6, 6, 116, 116);
  c.fillStyle = tone;
  c.font = 'bold 84px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, 64, 70);
  tex.update();
  const mat = new PBRMaterial('placeholderMat', scene);
  mat.albedoTexture = tex;
  mat.albedoColor = Color3.White();
  mat.metallic = 0;
  mat.roughness = 0.9;
  mesh.material = mat;
  mesh.parent = root;
  mesh.position.y = 0.5;
  return mesh;
}
