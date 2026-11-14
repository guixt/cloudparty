/**
 * Reine Logik: Was an einer Entity hat sich geändert, und was muss die
 * Darstellung daraufhin tun? (Ohne Babylon, damit leicht testbar.)
 */
import type { EntitySpec } from '../../../shared/types';

export interface ChangeClass {
  /** Knoten komplett neu aufbauen (disposed → created). */
  rebuild: boolean;
  /** Transform des Knotens neu setzen. */
  transform: boolean;
  /** Materialien in place aktualisieren. */
  material: boolean;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * @param relevantStateKeys Schlüssel von `state`, die die Gestalt beeinflussen;
 *   `undefined` = jeder Schlüssel zählt, `[]` = keiner.
 */
export function classifyChange(prev: EntitySpec, next: EntitySpec, relevantStateKeys?: readonly string[]): ChangeClass {
  let stateChanged: boolean;
  if (relevantStateKeys) {
    stateChanged = relevantStateKeys.some((key) => !same(prev.state?.[key], next.state?.[key]));
  } else {
    stateChanged = !same(prev.state ?? {}, next.state ?? {});
  }
  const rebuild = prev.ref !== next.ref || prev.modelUrl !== next.modelUrl || stateChanged;
  return {
    rebuild,
    transform: !same(prev.transform, next.transform),
    material: !same(prev.material, next.material),
  };
}

/** Kein sichtbarer Unterschied für die Darstellung (z. B. nur physics/script/media). */
export function isNoop(c: ChangeClass): boolean {
  return !c.rebuild && !c.transform && !c.material;
}
