/** Reine Hilfsfunktionen des Skript-Editors (ohne DOM, einzeln testbar). */
import { javascriptLanguage } from '@codemirror/lang-javascript';
import {
  SCRIPT_EVENTS,
  SCRIPT_SELF_API,
  SCRIPT_WORLD_API,
  type ScriptApiDoc,
} from '../../../shared/scriptApi';

// ---------------------------------------------------------------- Syntaxprüfung

export interface SyntaxIssue {
  message: string;
  /** 1-basiert. */
  line: number;
  column: number;
  /** Zeichenposition im Quelltext (für Markierungen). */
  from: number;
  to: number;
}

/** Position (0-basiert) des ersten Fehlerknotens laut Parser, falls vorhanden. */
export function findErrorPosition(source: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  javascriptLanguage.parser.parse(source).iterate({
    enter(node) {
      if (found) return false;
      if (node.type.isError) {
        found = { from: node.from, to: Math.max(node.to, node.from) };
        return false;
      }
      return undefined;
    },
  });
  return found;
}

export function positionToLineColumn(source: string, pos: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(pos, source.length));
  const before = source.slice(0, clamped);
  const line = before.split('\n').length;
  const column = clamped - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column };
}

/** Zeile aus einer Browser-Fehlermeldung/Stack lesen (nur Fallback). */
function lineFromError(error: unknown): number | null {
  const text = `${(error as Error)?.stack ?? ''}`;
  const match = /<anonymous>:(\d+):(\d+)|:(\d+):(\d+)\)?$/m.exec(text);
  const n = match ? Number(match[1] ?? match[3]) : NaN;
  // `new Function` setzt 2 Kopfzeilen vor den Quelltext.
  return Number.isFinite(n) && n > 2 ? n - 2 : null;
}

/**
 * Prüft Quelltext auf Syntaxfehler, ohne ihn auszuführen
 * (`new Function` wird nur konstruiert, nie aufgerufen).
 * Gibt null zurück, wenn alles in Ordnung ist.
 */
export function checkSyntax(source: string): SyntaxIssue | null {
  try {
    // eslint-disable-next-line no-new, @typescript-eslint/no-implied-eval
    new Function(source);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const located = findErrorPosition(source);
    let from: number;
    let to: number;
    if (located) {
      from = located.from;
      to = located.to;
    } else {
      const line = lineFromError(error) ?? source.split('\n').length;
      const lines = source.split('\n');
      from = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
      to = from + (lines[line - 1]?.length ?? 0);
    }
    if (to <= from) to = Math.min(source.length, from + 1);
    if (from >= source.length) from = Math.max(0, source.length - 1);
    if (to < from) to = from;
    const { line, column } = positionToLineColumn(source, from);
    return { message, line, column, from, to };
  }
}

export function describeIssue(issue: SyntaxIssue): string {
  return `Zeile ${issue.line}, Spalte ${issue.column}: ${issue.message}`;
}

// ---------------------------------------------------------------- Log-Puffer

export interface LogLine {
  ts: number;
  level: 'log' | 'error';
  message: string;
}
export type ScriptStatus = 'running' | 'stopped' | 'error';
export interface StatusInfo {
  status: ScriptStatus;
  message?: string;
}

/** Ringpuffer pro Objekt (max. `max` Zeilen) plus letzter Skriptstatus. */
export class ConsoleStore {
  private lines = new Map<string, LogLine[]>();
  private statuses = new Map<string, StatusInfo>();
  private listeners = new Set<() => void>();
  version = 0;

  constructor(readonly max = 200) {}

  push(entityId: string, line: LogLine): void {
    const list = this.lines.get(entityId) ?? [];
    list.push(line);
    if (list.length > this.max) list.splice(0, list.length - this.max);
    this.lines.set(entityId, list);
    this.changed();
  }
  getLines(entityId: string): readonly LogLine[] {
    return this.lines.get(entityId) ?? [];
  }
  clear(entityId: string): void {
    this.lines.delete(entityId);
    this.changed();
  }
  setStatus(entityId: string, info: StatusInfo): void {
    this.statuses.set(entityId, info);
    this.changed();
  }
  getStatus(entityId: string): StatusInfo | undefined {
    return this.statuses.get(entityId);
  }
  forget(entityId: string): void {
    this.lines.delete(entityId);
    this.statuses.delete(entityId);
    this.changed();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private changed(): void {
    this.version++;
    for (const l of [...this.listeners]) l();
  }
}

// ---------------------------------------------------------------- Referenz

export interface ReferenceEntry {
  kind: 'event' | 'self' | 'world';
  name: string;
  signature: string;
  description: string;
  /** Text, der beim Klick in den Editor eingefügt wird. */
  insert: string;
}

/** `self.getPosition() → {x, y, z}` → `self.getPosition()`; `a / b` → `a`. */
export function signatureToInsert(signature: string): string {
  return signature.split(' → ')[0].split(' / ')[0].trim();
}

/** Quelltext einer Ereignisfunktion, z. B. `function onClick(avatar) {\n  \n}`. */
export function eventSnippet(signature: string): string {
  return `function ${signature} {\n  \n}\n`;
}

export function buildReference(): ReferenceEntry[] {
  const events = SCRIPT_EVENTS.map<ReferenceEntry>((e) => ({
    kind: 'event',
    name: e.name,
    signature: e.signature,
    description: e.description,
    insert: eventSnippet(e.signature),
  }));
  const self = SCRIPT_SELF_API.map<ReferenceEntry>((e) => ({
    kind: 'self',
    name: e.name,
    signature: e.signature,
    description: e.description,
    insert: signatureToInsert(e.signature),
  }));
  const world = SCRIPT_WORLD_API.map<ReferenceEntry>((e) => ({
    kind: 'world',
    name: e.name,
    signature: e.signature,
    description: e.description,
    insert: signatureToInsert(e.signature),
  }));
  return [...events, ...self, ...world];
}

export function filterReference(entries: ReferenceEntry[], query: string): ReferenceEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  return entries.filter((e) => {
    const hay = `${e.name} ${e.signature} ${e.description}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

// ---------------------------------------------------------------- Autovervollständigung

export interface CompletionItem {
  label: string;
  detail: string;
  info: string;
  type: 'property' | 'function' | 'variable' | 'keyword';
  /** Falls gesetzt: Vorlage im CodeMirror-Snippet-Format (`#{}` = Cursor). */
  template?: string;
}
export interface CompletionSets {
  self: CompletionItem[];
  world: CompletionItem[];
  /** Ereignisfunktionen, globale Namen. */
  globals: CompletionItem[];
}

/** Ob ein Eintrag aus SCRIPT_WORLD_API ein Mitglied von `world` ist. */
export function isWorldMember(doc: ScriptApiDoc): boolean {
  return doc.signature.startsWith('world.');
}

export function buildCompletionSets(): CompletionSets {
  const toItem = (doc: ScriptApiDoc, type: CompletionItem['type']): CompletionItem => ({
    label: doc.name,
    detail: doc.signature,
    info: doc.description,
    type,
  });
  const self = SCRIPT_SELF_API.map((d) => toItem(d, d.signature.includes('(') ? 'function' : 'property'));
  const world = SCRIPT_WORLD_API.filter(isWorldMember).map((d) => toItem(d, 'function'));
  const globals: CompletionItem[] = [
    ...SCRIPT_EVENTS.map<CompletionItem>((e) => ({
      label: e.name,
      detail: e.signature,
      info: e.description,
      type: 'function',
      template: `function ${e.signature} {\n\t#{}\n}`,
    })),
    { label: 'self', detail: 'Das eigene Objekt', info: 'Zugriff auf das Objekt, dem das Skript gehört.', type: 'variable' },
    { label: 'world', detail: 'Die Welt', info: 'Nachrichten, Töne, Avatar versetzen.', type: 'variable' },
  ];
  for (const d of SCRIPT_WORLD_API.filter((x) => !isWorldMember(x))) {
    globals.push(toItem(d, 'function'));
    if (d.name === 'setTimeout') {
      for (const n of ['setInterval', 'clearTimeout', 'clearInterval']) {
        globals.push({ label: n, detail: d.signature, info: d.description, type: 'function' });
      }
    }
  }
  return { self, world, globals };
}

// ---------------------------------------------------------------- Zeitformat

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
