/** glTF/GLB-Modelle: Platzhalter, Laden, Normalisieren. */
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { EntitySpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { buildPlaceholder } from './parts';

/** Modelle kleiner/größer als diese Kantenlänge (m) werden angepasst. */
export const MODEL_MIN_SIZE = 0.25;
export const MODEL_MAX_SIZE = 20;
export const MODEL_TINY_TARGET = 1;
export const MODEL_HUGE_TARGET = 10;

/** Skalierungsfaktor für ein Modell mit größter Kantenlänge `maxDim` (rein, testbar). */
export function normaliseScale(maxDim: number): number {
  if (!Number.isFinite(maxDim) || maxDim <= 0) return 1;
  if (maxDim < MODEL_MIN_SIZE) return MODEL_TINY_TARGET / maxDim;
  if (maxDim > MODEL_MAX_SIZE) return MODEL_HUGE_TARGET / maxDim;
  return 1;
}

/** Dateiendung fürs Laden: bei data:-URLs aus MIME/Inhalt, sonst aus dem Pfad. */
export function pluginExtensionFor(url: string): '.glb' | '.gltf' {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const head = url.slice(0, comma).toLowerCase();
    const body = url.slice(comma + 1, comma + 9);
    if (head.includes('gltf+json') || head.includes('model/gltf-json')) return '.gltf';
    if (head.includes('gltf-binary')) return '.glb';
    if (head.includes(';base64')) return body.startsWith('Z2xURg') ? '.glb' : body.startsWith('eyJ') || body.startsWith('ew') ? '.gltf' : '.glb';
    return decodeURIComponent(body).trimStart().startsWith('{') ? '.gltf' : '.glb';
  }
  const path = url.split(/[?#]/)[0].toLowerCase();
  return path.endsWith('.gltf') ? '.gltf' : '.glb';
}

/** Liest eine Datei als data:-URL (für den Bau-Dialog). */
export function modelUrlFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

export async function buildModel(ctx: GameContext, entity: EntitySpec, root: TransformNode): Promise<void> {
  const { scene, bus } = ctx;
  const url = entity.modelUrl;
  if (!url) {
    buildPlaceholder(scene, root, '#6b7a99', '?');
    return;
  }
  const placeholder = buildPlaceholder(scene, root, '#4da3ff', '…');
  placeholder.visibility = 0.7;
  try {
    const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: pluginExtensionFor(url) });
    if (root.isDisposed()) {
      container.dispose();
      return;
    }
    for (const light of [...container.lights]) light.dispose();
    for (const camera of [...container.cameras]) camera.dispose();
    container.addAllToScene();

    const holder = new TransformNode('modelHolder', scene);
    for (const node of container.rootNodes) node.parent = holder;
    holder.onDisposeObservable.add(() => {
      for (const group of container.animationGroups) group.dispose();
    });

    // Vermessen, solange der Halter noch ohne Elternknoten an der Identität liegt.
    holder.computeWorldMatrix(true);
    const meshes = holder.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0);
    if (meshes.length === 0) throw new Error('Das Modell enthält keine Geometrie.');
    const { min, max } = holder.getHierarchyBoundingVectors(true);
    const size = max.subtract(min);
    const factor = normaliseScale(Math.max(size.x, size.y, size.z));
    holder.scaling.setAll(factor);
    // Auf den Boden stellen und in der Mitte (x/z) ausrichten.
    holder.position = new Vector3(-((min.x + max.x) / 2) * factor, -min.y * factor, -((min.z + max.z) / 2) * factor);
    holder.parent = root;
    placeholder.dispose(false, true);

    for (const group of container.animationGroups) group.start(true);
  } catch (error) {
    console.warn('[entities] Modell konnte nicht geladen werden', error);
    placeholder.dispose(false, true);
    if (!root.isDisposed()) buildPlaceholder(scene, root, '#d9534f', '!');
    bus.emit('ui.toast', { text: `Das Modell „${entity.name ?? entity.id}“ konnte nicht geladen werden.`, kind: 'error' });
  }
}
