/**
 * Key-/Modellspeicher (nur localStorage, nie im Store, nie in Ereignissen).
 * `cloudparty.ai.baseUrl` (optional) überschreibt die API-Basis
 * (Standard https://api.anthropic.com) – gedacht für Tests und eigene Proxys.
 */
import { AI_MODELS, AI_STORAGE_KEYS, AI_TOKEN_LIMITS, DEFAULT_AI_APPROVAL, DEFAULT_AI_MODEL, type AiApprovalMode } from '../../../shared/aiTools';

export const BASE_URL_KEY = 'cloudparty.ai.baseUrl';
export const DEFAULT_BASE_URL = 'https://api.anthropic.com';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
function read(key: string): string {
  try {
    return storage()?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function getApiKey(): string {
  return read(AI_STORAGE_KEYS.apiKey).trim();
}
export function setApiKey(key: string): void {
  try {
    const s = storage();
    if (!s) return;
    const value = key.trim();
    if (value) s.setItem(AI_STORAGE_KEYS.apiKey, value);
    else s.removeItem(AI_STORAGE_KEYS.apiKey);
  } catch {
    /* Speicher gesperrt */
  }
}
export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}
export function getModel(): string {
  const stored = read(AI_STORAGE_KEYS.model);
  return AI_MODELS.some((m) => m.id === stored) ? stored : DEFAULT_AI_MODEL;
}
export function setModel(model: string): void {
  if (!AI_MODELS.some((m) => m.id === model)) return;
  try {
    storage()?.setItem(AI_STORAGE_KEYS.model, model);
  } catch {
    /* ignorieren */
  }
}
export function getBaseUrl(): string {
  const custom = read(BASE_URL_KEY).trim();
  return (custom || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Freigabe-Modus; unbekannte oder fehlende Werte ergeben immer den sicheren Standard ask. */
export function getApproval(): AiApprovalMode {
  return read(AI_STORAGE_KEYS.approval) === 'auto' ? 'auto' : DEFAULT_AI_APPROVAL;
}
export function setApproval(mode: AiApprovalMode): void {
  try {
    storage()?.setItem(AI_STORAGE_KEYS.approval, mode === 'auto' ? 'auto' : 'ask');
  } catch {
    /* ignorieren */
  }
}

/** Darf die KI Screenshots der Welt ansehen? Standard: nein. */
export function getVision(): boolean {
  return read(AI_STORAGE_KEYS.vision) === '1';
}
export function setVision(on: boolean): void {
  try {
    storage()?.setItem(AI_STORAGE_KEYS.vision, on ? '1' : '0');
  } catch {
    /* ignorieren */
  }
}

/** Darf die KI im Internet nach Bildern suchen? Standard: nein. */
export function getImageSearch(): boolean {
  return read(AI_STORAGE_KEYS.imageSearch) === '1';
}
export function setImageSearch(on: boolean): void {
  try {
    storage()?.setItem(AI_STORAGE_KEYS.imageSearch, on ? '1' : '0');
  } catch {
    /* ignorieren */
  }
}

type LimitRange = { min: number; max: number; step: number; default: number };
function clampLimit(raw: string, range: LimitRange): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return range.default;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}
/** Aktuelle Längengrenzen in Tokens (ungültige oder fehlende Werte ergeben den Standard, alles wird auf den erlaubten Bereich begrenzt). */
export function getTokenLimits(): { maxInputTokens: number; maxOutputTokens: number } {
  return {
    maxInputTokens: clampLimit(read(AI_STORAGE_KEYS.maxInput), AI_TOKEN_LIMITS.input),
    maxOutputTokens: clampLimit(read(AI_STORAGE_KEYS.maxOutput), AI_TOKEN_LIMITS.output),
  };
}
export function setTokenLimits(limits: { maxInputTokens?: number; maxOutputTokens?: number }): void {
  try {
    const s = storage();
    if (!s) return;
    if (limits.maxInputTokens !== undefined) s.setItem(AI_STORAGE_KEYS.maxInput, String(clampLimit(String(limits.maxInputTokens), AI_TOKEN_LIMITS.input)));
    if (limits.maxOutputTokens !== undefined) s.setItem(AI_STORAGE_KEYS.maxOutput, String(clampLimit(String(limits.maxOutputTokens), AI_TOKEN_LIMITS.output)));
  } catch {
    /* ignorieren */
  }
}

// ---------------------------------------------------------------- Modelle je Rolle

export type ModelRole = 'plan' | 'exec' | 'review';
const ROLE_KEYS: Record<ModelRole, string> = { plan: AI_STORAGE_KEYS.planModel, exec: AI_STORAGE_KEYS.execModel, review: AI_STORAGE_KEYS.reviewModel };

/** Gespeichertes Modell einer Rolle ('' = nicht gesetzt, es gilt das Hauptmodell). */
export function getRoleModel(role: ModelRole): string {
  const stored = read(ROLE_KEYS[role]);
  return AI_MODELS.some((m) => m.id === stored) ? stored : '';
}
export function setRoleModel(role: ModelRole, model: string): void {
  try {
    const s = storage();
    if (!s) return;
    if (model && AI_MODELS.some((m) => m.id === model)) s.setItem(ROLE_KEYS[role], model);
    else s.removeItem(ROLE_KEYS[role]);
  } catch {
    /* ignorieren */
  }
}
/** Wirksames Modell einer Rolle: gesetztes Rollenmodell, sonst das Hauptmodell. */
export function getEffectiveModel(role: ModelRole): string {
  return getRoleModel(role) || getModel();
}
/** Soll nach „Alle ausführen“ automatisch geprüft werden (nur mit gesetztem Prüfmodell)? */
export function getReviewAfterRun(): boolean {
  return read(AI_STORAGE_KEYS.reviewAfterRun) === '1';
}
export function setReviewAfterRun(on: boolean): void {
  try {
    storage()?.setItem(AI_STORAGE_KEYS.reviewAfterRun, on ? '1' : '0');
  } catch {
    /* ignorieren */
  }
}
