/**
 * Key-/Modellspeicher (nur localStorage, nie im Store, nie in Ereignissen).
 * `cloudparty.ai.baseUrl` (optional) überschreibt die API-Basis
 * (Standard https://api.anthropic.com) – gedacht für Tests und eigene Proxys.
 */
import { AI_MODELS, AI_STORAGE_KEYS, DEFAULT_AI_MODEL } from '../../../shared/aiTools';

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
