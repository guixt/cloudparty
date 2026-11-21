/** PLATZHALTER des Koordinators: wird von der zuständigen Einheit durch die echte Geometrie ersetzt (gleiche Signatur). */
import type { MeshData, LatheParams } from './types';
import { boxMeshData } from './util';

export function buildLathe(_params: LatheParams): MeshData {
  return boxMeshData([-0.5, 0, -0.5], [0.5, 1, 0.5]);
}
