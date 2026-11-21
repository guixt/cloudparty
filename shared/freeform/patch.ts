/** PLATZHALTER des Koordinators: wird von der zuständigen Einheit durch die echte Geometrie ersetzt (gleiche Signatur). */
import type { MeshData, PatchParams } from './types';
import { boxMeshData } from './util';

export function buildPatch(_params: PatchParams): MeshData {
  return boxMeshData([-0.5, 0, -0.5], [0.5, 1, 0.5]);
}
