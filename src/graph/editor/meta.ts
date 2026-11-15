/** Farben, Palette-Logik und Log-Speicher des Graph-Editors. */
import type { NodeCategory, NodeDef, PortKind } from '../../../shared/graph';

export const CATEGORY_COLOR: Record<NodeCategory, string> = {
  Ereignisse: '#b8433c',
  Aktionen: '#3b78c9',
  Ablauf: '#c08a2c',
  Logik: '#8a55c4',
  Werte: '#3a9a62',
  Variablen: '#2e98a8',
  Medien: '#c4559a',
};
export const KIND_COLOR: Record<PortKind, string> = {
  flow: '#f2f4f8',
  number: '#58c26f',
  text: '#5aa2ff',
  boolean: '#ff6b6b',
  color: '#ffd04d',
};
export const KIND_LABEL: Record<PortKind, string> = { flow: 'Ablauf', number: 'Zahl', text: 'Text', boolean: 'Ja/Nein', color: 'Farbe' };

export interface PaletteGroup {
  category: NodeCategory;
  nodes: NodeDef[];
}

/** Filtert die Gruppen nach Suchtext (Titel, Beschreibung, Typ, Kategorie) und optional nach erlaubten Typen. */
export function filterPalette(groups: PaletteGroup[], query: string, allowed?: Set<string> | null): PaletteGroup[] {
  const q = query.trim().toLowerCase();
  const out: PaletteGroup[] = [];
  for (const g of groups) {
    const nodes = g.nodes.filter((d) => {
      if (allowed && !allowed.has(d.type)) return false;
      if (!q) return true;
      return [d.title, d.description, d.type, g.category].some((t) => t.toLowerCase().includes(q));
    });
    if (nodes.length) out.push({ category: g.category, nodes });
  }
  return out;
}

export interface LogLine {
  ts: number;
  level: 'log' | 'error';
  message: string;
}
export interface LogStatus {
  status: 'running' | 'stopped' | 'error';
  message?: string;
}

/** Ringpuffer je Objekt (letzte 100 Zeilen). */
export class GraphLog {
  private lines = new Map<string, LogLine[]>();
  private statuses = new Map<string, LogStatus>();
  private subs = new Set<() => void>();
  version = 0;
  constructor(private max = 100) {}
  push(id: string, line: LogLine): void {
    const list = this.lines.get(id) ?? [];
    list.push(line);
    if (list.length > this.max) list.splice(0, list.length - this.max);
    this.lines.set(id, list);
    this.bump();
  }
  setStatus(id: string, s: LogStatus): void {
    this.statuses.set(id, s);
    this.bump();
  }
  getLines(id: string): LogLine[] {
    return this.lines.get(id) ?? [];
  }
  getStatus(id: string): LogStatus | undefined {
    return this.statuses.get(id);
  }
  clear(id: string): void {
    this.lines.delete(id);
    this.bump();
  }
  forget(id: string): void {
    this.lines.delete(id);
    this.statuses.delete(id);
    this.bump();
  }
  subscribe = (cb: () => void) => {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  };
  private bump() {
    this.version++;
    this.subs.forEach((f) => f());
  }
}
export const graphLog = new GraphLog(100);
