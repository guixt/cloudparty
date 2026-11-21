/**
 * Protokoll des KI-Assistenten (nur lokal im Browser): Aufträge, Modellrunden, Werkzeugaufrufe, Fehler.
 * Stufen: off (nichts), normal (Namen, Ergebnis, Tokens, Fehler), detail (zusätzlich Prompt, Eingaben und Ergebnistexte, gekürzt).
 * Der API-Key wird nie protokolliert. Export als JSON-Zeilen (.jsonl) zum späteren Auswerten.
 */
import { AI_STORAGE_KEYS } from '../../../shared/aiTools';
import { redact } from './client';

export type LogLevel = 'off' | 'normal' | 'detail';
export const LOG_LEVELS: readonly LogLevel[] = ['off', 'normal', 'detail'];
export interface LogEntry {
  t: string;
  kind: string;
  [key: string]: unknown;
}

const MAX_ENTRIES = 1000;
const MAX_PERSISTED_BYTES = 300_000;
const MAX_TEXT = 1500;

let entries: LogEntry[] = [];
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getLogLevel(): LogLevel {
  try {
    const v = storage()?.getItem(AI_STORAGE_KEYS.logLevel);
    return LOG_LEVELS.includes(v as LogLevel) ? (v as LogLevel) : 'normal';
  } catch {
    return 'normal';
  }
}
export function setLogLevel(level: LogLevel): void {
  try {
    if (LOG_LEVELS.includes(level)) storage()?.setItem(AI_STORAGE_KEYS.logLevel, level);
  } catch {
    /* ignorieren */
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = storage()?.getItem(AI_STORAGE_KEYS.log);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) entries = parsed.filter((e) => e && typeof e === 'object' && typeof e.kind === 'string').slice(-MAX_ENTRIES);
  } catch {
    entries = [];
  }
}

function persistSoon(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    try {
      let slice = entries;
      let text = JSON.stringify(slice);
      while (text.length > MAX_PERSISTED_BYTES && slice.length > 20) {
        slice = slice.slice(Math.ceil(slice.length / 4));
        text = JSON.stringify(slice);
      }
      storage()?.setItem(AI_STORAGE_KEYS.log, text);
    } catch {
      /* Speicher voll oder gesperrt: Protokoll bleibt im Arbeitsspeicher */
    }
  }, 800);
}

/** Kürzt Text und entfernt den Key. */
export function clip(text: unknown, max = MAX_TEXT): string {
  const s = redact(typeof text === 'string' ? text : JSON.stringify(text) ?? '');
  return s.length > max ? `${s.slice(0, max)}… [${s.length - max} Zeichen gekürzt]` : s;
}

/** Schreibt einen Eintrag. `detail` wird nur in der Stufe „detail“ gespeichert. */
export function logEvent(kind: string, data: Record<string, unknown> = {}, detail: Record<string, unknown> = {}): void {
  const level = getLogLevel();
  if (level === 'off') return;
  load();
  entries.push({ t: new Date().toISOString(), kind, ...data, ...(level === 'detail' ? detail : {}) });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  persistSoon();
}

export function getLogEntries(): LogEntry[] {
  load();
  return [...entries];
}
export function clearLog(): void {
  entries = [];
  loaded = true;
  try {
    storage()?.removeItem(AI_STORAGE_KEYS.log);
  } catch {
    /* ignorieren */
  }
}
/** JSON-Zeilen (eine Zeile je Eintrag). */
export function exportLog(): string {
  return getLogEntries().map((e) => JSON.stringify(e)).join('\n') + '\n';
}
