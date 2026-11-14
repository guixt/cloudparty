/**
 * WorldSpec-Validierung. STUB des Fundaments – Paket 3 ersetzt die Umsetzung
 * (Zod-Schema mit allen Regeln aus docs/worldspec.md). Die Signaturen bleiben.
 */
import type { WorldSpec } from '../types';

export type ValidationResult = { ok: true; world: WorldSpec } | { ok: false; errors: string[] };

/** Prüft beliebige Eingabe und liefert eine normalisierte WorldSpec oder lesbare Fehler (Deutsch). */
export function validateWorldSpec(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') return { ok: false, errors: ['Die Welt muss ein JSON-Objekt sein.'] };
  const world = input as WorldSpec;
  if (!world.metadata?.name) return { ok: false, errors: ['metadata.name fehlt.'] };
  return { ok: true, world: { ...world, entities: world.entities ?? [], interactions: world.interactions ?? [] } };
}

/** Parst JSON-Text und validiert ihn. */
export function parseWorldSpec(json: string): ValidationResult {
  try {
    return validateWorldSpec(JSON.parse(json));
  } catch (error) {
    return { ok: false, errors: [`Kein gültiges JSON: ${(error as Error).message}`] };
  }
}
