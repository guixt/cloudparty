/**
 * Freiform-Prefab: baut aus dem Parametersatz im `state` ein einzelnes Babylon-Netz (Kind des Root-Knotens).
 * Fehlerhafte States führen nie zu einem Wurf, sondern zu einem sichtbaren Platzhalter-Quader.
 */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { boxMeshData, buildFreeformMesh, sanitizeFreeformState, type FreeformState, type MeshData } from '../../../shared/freeform';
import type { EntitySpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { createMainMaterial } from './materials';
import { applyCuts } from './freeformCuts';

/** Fläche, die der Platzhalter bei Fehlern zeigt (1 m Würfel, Boden bei y = 0). */
function fallbackData(): MeshData {
  return boxMeshData([-0.5, 0, -0.5], [0.5, 1, 0.5]);
}

export function meshDataToVertexData(data: MeshData): VertexData {
  const vd = new VertexData();
  vd.positions = data.positions;
  vd.normals = data.normals;
  vd.uvs = data.uvs;
  vd.indices = data.indices;
  return vd;
}

/** Netzdaten des States; bei Fehler oder leerem Ergebnis der Platzhalter. */
export function freeformMeshData(raw: unknown): { data: MeshData; state: FreeformState | null } {
  try {
    const state = sanitizeFreeformState(raw);
    const data = buildFreeformMesh(state);
    if (data.positions.length >= 9 && data.indices.length >= 3 && data.positions.every(Number.isFinite)) return { data, state };
    console.warn('[freeform] leeres Netz, zeige Platzhalter');
  } catch (error) {
    console.warn('[freeform] ungültiger State, zeige Platzhalter:', error instanceof Error ? error.message : error);
  }
  return { data: fallbackData(), state: null };
}

export function buildFreeform(ctx: GameContext, entity: EntitySpec, root: TransformNode): void {
  const { scene } = ctx;
  const { data, state } = freeformMeshData(entity.state);
  let mesh = new Mesh('freeform', scene);
  meshDataToVertexData(data).applyToMesh(mesh);
  mesh.parent = root;
  if (state?.cuts?.length) {
    try {
      const cut = applyCuts(mesh, state.cuts, scene);
      if (cut !== mesh) {
        if (!mesh.isDisposed()) mesh.dispose(false, true);
        mesh = cut;
        mesh.parent = root;
      }
    } catch (error) {
      console.warn('[freeform] Schnitte fehlgeschlagen:', error instanceof Error ? error.message : error);
    }
  }
  if (mesh.getTotalVertices() === 0) meshDataToVertexData(fallbackData()).applyToMesh(mesh);
  const mat = createMainMaterial(scene, 'main', entity.material, { color: '#c9a477', roughness: 0.7 });
  // Einseitige Flächen müssen von beiden Seiten sichtbar und beleuchtet sein.
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mesh.material = mat;
}
