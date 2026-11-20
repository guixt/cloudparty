/**
 * Laufzeit-Grenzen der KI (Schritte, Werkzeugaufrufe, neue Objekte, Rückfragen, Plan-Lauf).
 * Reihenfolge: Standard < gespeicherte Werte (localStorage) < temporärer Modus „Lange Pläne“ (sessionStorage, nur bis zum
 * Neuladen bzw. Schließen des Tabs). Alles wird auf den erlaubten Bereich begrenzt.
 */
import { AI_RUN_LIMITS, AI_STORAGE_KEYS, type AiRunLimitKey, type AiRunLimits } from '../../../shared/aiTools';

const KEYS = Object.keys(AI_RUN_LIMITS) as AiRunLimitKey[];

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function clampRunLimit(key: AiRunLimitKey, value: unknown): number {
  const range = AI_RUN_LIMITS[key];
  const n = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(n)) return range.default;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

/** Gespeicherte, vom Nutzer geänderte Werte (nur die gesetzten Felder). */
export function getStoredRunLimits(): Partial<AiRunLimits> {
  try {
    const raw = local()?.getItem(AI_STORAGE_KEYS.runLimits);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Partial<AiRunLimits> = {};
    for (const k of KEYS) if (parsed[k] !== undefined) out[k] = clampRunLimit(k, parsed[k]);
    return out;
  } catch {
    return {};
  }
}

export function isLongRunMode(): boolean {
  try {
    return session()?.getItem(AI_STORAGE_KEYS.longRun) === '1';
  } catch {
    return false;
  }
}
export function setLongRunMode(on: boolean): void {
  try {
    if (on) session()?.setItem(AI_STORAGE_KEYS.longRun, '1');
    else session()?.removeItem(AI_STORAGE_KEYS.longRun);
  } catch {
    /* ignorieren */
  }
}

/** Wirksame Grenzen: im Modus „Lange Pläne“ gilt für jedes Feld mindestens der Wert des Modus. */
export function getRunLimits(): AiRunLimits {
  const stored = getStoredRunLimits();
  const long = isLongRunMode();
  const out = {} as AiRunLimits;
  for (const k of KEYS) {
    const base = stored[k] ?? AI_RUN_LIMITS[k].default;
    out[k] = long ? Math.max(base, AI_RUN_LIMITS[k].long) : base;
  }
  return out;
}

export function setStoredRunLimits(patch: Partial<AiRunLimits>): void {
  try {
    const s = local();
    if (!s) return;
    const cur = getStoredRunLimits();
    for (const k of KEYS) if (patch[k] !== undefined) cur[k] = clampRunLimit(k, patch[k]);
    s.setItem(AI_STORAGE_KEYS.runLimits, JSON.stringify(cur));
  } catch {
    /* ignorieren */
  }
}
export function resetRunLimits(): void {
  try {
    local()?.removeItem(AI_STORAGE_KEYS.runLimits);
  } catch {
    /* ignorieren */
  }
}
