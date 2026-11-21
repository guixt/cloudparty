/** PLATZHALTER des Koordinators: wird von der Einheit „Boolesche Schnitte“ durch die echte Umsetzung ersetzt (gleiche Signatur). */
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { CutOp } from '../../../shared/freeform/types';

/** Zieht die Schnitte vom Netz ab und liefert das Ergebnisnetz (bei Fehlern das unveränderte Netz). */
export function applyCuts(mesh: Mesh, _cuts: readonly CutOp[], _scene: Scene): Mesh {
  return mesh;
}
