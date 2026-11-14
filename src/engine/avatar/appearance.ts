/** Aussehen und Anzeigename: Prüfung und Speicherung im Browser (localStorage). */
import { DEFAULT_APPEARANCE, type AvatarAppearance } from '../../../shared/avatar';

export const APPEARANCE_KEY = 'cloudparty.appearance';
export const NAME_KEY = 'cloudparty.name';
export const MAX_NAME_LENGTH = 24;

const HEX = /^#[0-9a-f]{6}$/i;

/** Übernimmt nur gültige #RRGGBB-Werte; alles andere fällt auf `base` zurück. */
export function sanitizeAppearance(input: unknown, base: AvatarAppearance = DEFAULT_APPEARANCE): AvatarAppearance {
  const out = { ...base };
  if (input && typeof input === 'object') {
    for (const key of ['skin', 'hair', 'shirt', 'pants'] as const) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === 'string' && HEX.test(v)) out[key] = v.toLowerCase();
    }
  }
  return out;
}

export function sanitizeName(input: string, fallback = 'Gast'): string {
  const name = input.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return name || fallback;
}

export function loadAppearance(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AvatarAppearance {
  try {
    const raw = storage?.getItem(APPEARANCE_KEY);
    return raw ? sanitizeAppearance(JSON.parse(raw)) : { ...DEFAULT_APPEARANCE };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a: AvatarAppearance, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    /* Speicher gesperrt */
  }
}

export function saveName(name: string, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(NAME_KEY, name);
  } catch {
    /* Speicher gesperrt */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
