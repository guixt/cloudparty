/**
 * Geometrie der Medien-Tafeln: dunkler Rahmen, zwei Standfüße, Bildschirmfläche.
 * Koordinaten im lokalen Raum des Entity-Wurzelknotens; Ursprung am Boden,
 * die Vorderseite zeigt nach +Z. Alle Maße in Metern (Entity-Skalierung wirkt darauf).
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { MediaKind } from '../../../shared/types';
import { boardSize } from './helpers';

/** Lage der Bildschirmfläche im Raum des Wurzelknotens (Mitte + Größe, vorn bei +Z). */
export interface Layout {
  cx: number;
  cy: number;
  z: number;
  width: number;
  height: number;
}

export const FRAME_PAD = 0.09;
export const FRAME_DEPTH = 0.1;
export const SCREEN_BOTTOM = 0.9;

export interface BoardParts {
  layout: Layout;
  meshes: Mesh[];
  materials: StandardMaterial[];
}

export function markPart(mesh: { metadata?: unknown }, entityId: string, extra: Record<string, unknown> = {}): void {
  mesh.metadata = { ...((mesh.metadata as object | undefined) ?? {}), entityId, mediaPart: true, ...extra };
}

/** Baut Rahmen und (optional) Standfüße einer Tafel unter `root`. */
export function buildBoard(scene: Scene, root: TransformNode, entityId: string, kind: MediaKind, state: Record<string, unknown> | undefined): BoardParts {
  const size = boardSize(kind, state?.aspect);
  const stand = state?.stand !== false;
  const cy = SCREEN_BOTTOM + size.height / 2;
  const frameMat = new StandardMaterial('media.frame.mat', scene);
  frameMat.diffuseColor = Color3.FromHexString('#262b36');
  frameMat.specularColor = new Color3(0.25, 0.25, 0.28);
  const meshes: Mesh[] = [];

  const frame = CreateBox('media.frame', { width: size.width + FRAME_PAD * 2, height: size.height + FRAME_PAD * 2, depth: FRAME_DEPTH }, scene);
  frame.parent = root;
  frame.position.set(0, cy, 0);
  meshes.push(frame);

  if (stand) {
    const legH = cy - size.height / 2 - FRAME_PAD;
    for (const side of [-1, 1]) {
      const leg = CreateBox('media.leg', { width: 0.1, height: legH, depth: 0.1 }, scene);
      leg.parent = root;
      leg.position.set(side * size.width * 0.32, legH / 2, 0);
      meshes.push(leg);
      const foot = CreateBox('media.foot', { width: 0.12, height: 0.05, depth: 0.5 }, scene);
      foot.parent = root;
      foot.position.set(side * size.width * 0.32, 0.025, 0);
      meshes.push(foot);
    }
  }
  for (const mesh of meshes) {
    mesh.material = frameMat;
    mesh.receiveShadows = true;
    markPart(mesh, entityId);
  }
  return {
    layout: { cx: 0, cy, z: FRAME_DEPTH / 2 + 0.002, width: size.width, height: size.height },
    meshes,
    materials: [frameMat],
  };
}

/**
 * Für Entities ohne eigene Tafel (beliebiges Prefab mit `media`): legt die Fläche auf die +Z-Seite
 * der lokalen Bounding-Box der vorhandenen Meshes. Die Meshes bleiben unberührt.
 */
export function layoutFromNode(root: TransformNode): Layout {
  root.computeWorldMatrix(true);
  const inverse = root.getWorldMatrix().clone().invert();
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of root.getChildMeshes(false) as AbstractMesh[]) {
    if ((mesh.metadata as { mediaPart?: boolean } | undefined)?.mediaPart) continue;
    if (!mesh.getTotalVertices()) continue;
    mesh.computeWorldMatrix(true);
    for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
      const local = Vector3.TransformCoordinates(corner, inverse).asArray();
      min = [Math.min(min[0], local[0]), Math.min(min[1], local[1]), Math.min(min[2], local[2])];
      max = [Math.max(max[0], local[0]), Math.max(max[1], local[1]), Math.max(max[2], local[2])];
    }
  }
  if (!Number.isFinite(min[0])) return { cx: 0, cy: 0.5, z: 0.5, width: 1, height: 1 };
  return {
    cx: (min[0] + max[0]) / 2,
    cy: (min[1] + max[1]) / 2,
    z: max[2] + 0.004,
    width: Math.max(0.05, max[0] - min[0]),
    height: Math.max(0.05, max[1] - min[1]),
  };
}
