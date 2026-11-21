/** Freiform: Netze aus Parametern. Reine Rechnung (ohne Babylon), von Client, KI-Werkzeugen und Server gemeinsam genutzt. */
import { buildLathe } from './lathe';
import { buildPatch } from './patch';
import { sanitizeFreeformState } from './sanitize';
import { buildSweep } from './sweep';
import type { FreeformState, MeshData, Vec3 } from './types';
import { meshBounds } from './util';

export * from './types';
export { sanitizeFreeformState } from './sanitize';
export { boxMeshData, meshBounds } from './util';

/** Netz (ohne Schnitte; Schnitte wendet `applyCuts` im Client auf das Babylon-Netz an). */
export function buildFreeformMesh(state: FreeformState): MeshData {
  switch (state.kind) {
    case 'lathe':
      return buildLathe(state);
    case 'sweep':
      return buildSweep(state);
    case 'patch':
      return buildPatch(state);
  }
}

const boundsCache = new Map<string, { min: Vec3; max: Vec3 }>();

/** Lokale achsenparallele Hülle (ohne Schnitte; Schnitte verkleinern sie nur). Wird für KI-Maße und Überschneidungen gebraucht. */
export function freeformBounds(state: FreeformState): { min: Vec3; max: Vec3 } {
  const key = JSON.stringify(state);
  const hit = boundsCache.get(key);
  if (hit) return hit;
  const b = meshBounds(buildFreeformMesh(sanitizeFreeformState(state)));
  if (boundsCache.size > 200) boundsCache.clear();
  boundsCache.set(key, b);
  return b;
}
