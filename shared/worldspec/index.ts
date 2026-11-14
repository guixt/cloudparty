/**
 * WorldSpec-Validierung (Paket 3): Zod-Schema mit den Regeln aus docs/worldspec.md,
 * verständlichen deutschen Fehlermeldungen und stabiler Serialisierung.
 * Läuft im Browser und in Node.
 */
import type { z } from 'zod';
import type { WorldSpec } from '../types';
import { worldSpecSchema } from './schema';

export { worldSpecSchema, entitySchema, interactionSchema, findNonJson, TOP_LEVEL_KEYS } from './schema';

export type ValidationResult = { ok: true; world: WorldSpec } | { ok: false; errors: string[] };

const TYPE_NAMES: Record<string, string> = {
  string: 'ein Text',
  number: 'eine Zahl',
  int: 'eine ganze Zahl',
  boolean: 'ein Wahrheitswert (true/false)',
  object: 'ein Objekt',
  array: 'eine Liste',
  record: 'ein Objekt',
};

function germanMessage(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined ? 'fehlt (Pflichtfeld)' : `muss ${TYPE_NAMES[String(issue.expected)] ?? String(issue.expected)} sein`;
    case 'too_small': {
      const min = String(issue.minimum);
      if (issue.origin === 'string') return min === '1' ? 'darf nicht leer sein' : `muss mindestens ${min} Zeichen lang sein`;
      if (issue.origin === 'array') return `muss mindestens ${min} Einträge enthalten`;
      return issue.inclusive ? `muss mindestens ${min} sein` : `muss größer als ${min} sein`;
    }
    case 'too_big': {
      const max = String(issue.maximum);
      if (issue.origin === 'string') return `darf höchstens ${max} Zeichen lang sein`;
      if (issue.origin === 'array') return `darf höchstens ${max} Einträge enthalten`;
      return issue.inclusive ? `darf höchstens ${max} sein` : `muss kleiner als ${max} sein`;
    }
    case 'invalid_value':
      return `muss einer der Werte ${issue.values.map((v) => JSON.stringify(v)).join(', ')} sein`;
    case 'invalid_format':
      return 'hat ein ungültiges Format';
    case 'unrecognized_keys':
      return `enthält unbekannte Felder: ${issue.keys.join(', ')}`;
    default:
      return 'ist ungültig';
  }
}

/** Formatiert einen Pfad wie `entities[2].transform.pos[1]`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

/** Entities ohne ID (ältere Speicherstände) bekommen deterministisch eine eindeutige ID. */
function fillMissingIds(input: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(input.entities)) return input;
  const entities = input.entities as unknown[];
  const used = new Set<string>();
  for (const e of entities) {
    const id = (e as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && id) used.add(id);
  }
  let changed = false;
  const next = entities.map((e, index) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
    const entity = e as Record<string, unknown>;
    if (entity.id !== undefined) return e;
    const ref = typeof entity.ref === 'string' ? entity.ref : 'objekt';
    const base = ref.replace(/^EntitySpec\./, '').replace(/[^A-Za-z0-9_-]+/g, '-') || 'objekt';
    let n = index + 1;
    while (used.has(`${base}.${n}`)) n += 1;
    const id = `${base}.${n}`;
    used.add(id);
    changed = true;
    return { ...entity, id };
  });
  return changed ? { ...input, entities: next } : input;
}

/** Prüft beliebige Eingabe und liefert eine normalisierte WorldSpec oder lesbare Fehler (Deutsch). */
export function validateWorldSpec(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Die Welt muss ein JSON-Objekt sein.'] };
  }
  const result = worldSpecSchema.safeParse(fillMissingIds(input as Record<string, unknown>), { error: germanMessage });
  if (result.success) return { ok: true, world: result.data as WorldSpec };
  const errors: string[] = [];
  for (const issue of result.error.issues) {
    const path = formatPath(issue.path);
    const line = path ? `${path}: ${issue.message}` : issue.message;
    if (!errors.includes(line)) errors.push(line);
  }
  return { ok: false, errors };
}

/** Parst JSON-Text und validiert ihn. */
export function parseWorldSpec(json: string): ValidationResult {
  try {
    return validateWorldSpec(JSON.parse(json.replace(/^﻿/, '')));
  } catch (error) {
    return { ok: false, errors: [`Kein gültiges JSON: ${(error as Error).message}`] };
  }
}

const KEY_PRIORITY = ['$schema', 'metadata', 'environment', 'rules', 'personality', 'island', 'entities', 'interactions', 'extensions', 'id', 'ref', 'name', 'version'];

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const rank = (key: string) => {
      const i = KEY_PRIORITY.indexOf(key);
      return i < 0 ? KEY_PRIORITY.length : i;
    };
    const keys = Object.keys(source).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = sortKeys(source[key]);
    return out;
  }
  return value;
}

/** Stabiles, gut lesbares JSON (feste Schlüsselreihenfolge, 2 Leerzeichen, Zeilenumbruch am Ende). */
export function serializeWorldSpec(world: WorldSpec): string {
  return `${JSON.stringify(sortKeys(world), null, 2)}\n`;
}
