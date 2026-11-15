/**
 * STUB des Fundaments – Paket 21 ersetzt diese Datei. Reflexionssonde aus dem Himmel setzt scene.environmentTexture.
 * Hooks und Regeln: siehe ../features.ts.
 */
import type { EnvironmentFeature, EnvironmentHandle } from '../features';

export function createIblFeature(_handle: EnvironmentHandle): EnvironmentFeature {
  return { id: 'ibl' };
}
