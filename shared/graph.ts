/**
 * Logik-Graph: grafisch verbundene Blöcke, die zu einem Skript übersetzt werden.
 * VERTRAG: Typen und Konventionen nur vom Koordinator ändern. Der Katalog der Knoten
 * (shared/graphNodes.ts) und der Übersetzer (shared/graphCompile.ts) gehören Paket 18.
 *
 * Konventionen
 * - Ein Graph hängt an einer Entity (`entity.graph`). Ist `graph.enabled` und der Graph fehlerfrei,
 *   wird sein übersetzter Quelltext statt `entity.script` ausgeführt (siehe entityScriptSource).
 * - Ports haben eine Art (PortKind). `flow` sind Ablaufverbindungen (links ein Eingang, rechts Ausgänge),
 *   alle anderen sind Datenverbindungen. Eine Verbindung ist nur zwischen gleichen Arten erlaubt;
 *   Zahl → Text ist zusätzlich erlaubt (wird umgewandelt).
 * - Ablauf-Ausgänge dürfen zu mehreren Zielen führen (Ausführung in der Reihenfolge der Kanten),
 *   Ablauf-Eingänge dürfen mehrere Zuflüsse haben. Daten-Eingänge haben höchstens eine Quelle;
 *   Daten-Ausgänge dürfen beliebig oft genutzt werden.
 * - Ein Daten-Eingang ohne Verbindung nimmt den Wert des gleichnamigen Parameters (`ParamDef.id === PortDef.id`),
 *   wie bei Blender-Knoten.
 * - Ereignis-Knoten (Kategorie „Ereignisse“) haben keinen Ablauf-Eingang und sind die Einstiegspunkte.
 * - Variablen sind Skript-Zustand pro Objekt (bleiben zwischen Ereignissen erhalten).
 */

export type PortKind = 'flow' | 'number' | 'text' | 'boolean' | 'color';

export interface PortDef {
  id: string;
  label: string;
  kind: PortKind;
}

export type ParamValue = string | number | boolean;
export type ParamKind = 'number' | 'text' | 'boolean' | 'color' | 'select';

export interface ParamDef {
  id: string;
  label: string;
  kind: ParamKind;
  default: ParamValue;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

export type NodeCategory = 'Ereignisse' | 'Aktionen' | 'Ablauf' | 'Logik' | 'Werte' | 'Variablen' | 'Medien';
export const NODE_CATEGORIES: NodeCategory[] = ['Ereignisse', 'Aktionen', 'Ablauf', 'Logik', 'Werte', 'Variablen', 'Medien'];

export interface NodeDef {
  type: string;
  title: string;
  category: NodeCategory;
  description: string;
  inputs: PortDef[];
  outputs: PortDef[];
  params: ParamDef[];
}

export interface GraphNode {
  id: string;
  type: string;
  /** Position im Editor (Pixel, ungezoomt). */
  x: number;
  y: number;
  params?: Record<string, ParamValue>;
}

export interface GraphEndpoint {
  node: string;
  port: string;
}
export interface GraphEdge {
  from: GraphEndpoint;
  to: GraphEndpoint;
}

export interface GraphSpec {
  version: 1;
  enabled: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const GRAPH_LIMITS = { maxNodes: 300, maxEdges: 600 } as const;

export function emptyGraph(): GraphSpec {
  return { version: 1, enabled: true, nodes: [], edges: [] };
}

export interface GraphIssue {
  nodeId?: string;
  message: string;
}
export interface CompileResult {
  /** Quelltext im Format der Skript-API (siehe shared/scriptApi.ts); leer bei Fehlern. */
  source: string;
  errors: GraphIssue[];
  warnings: GraphIssue[];
}

/**
 * Kompakte Textform für die KI (leichter fehlerfrei zu erzeugen als der volle Graph):
 *   nodes: [{ id: 'k', type: 'on_click' }, { id: 'f', type: 'set_color', params: { color: '#ff0000' } }]
 *   connections: ['k.then -> f.in']
 * Positionen berechnet `autoLayout` (shared/graphCompact.ts).
 */
export interface CompactGraph {
  nodes: { id: string; type: string; params?: Record<string, ParamValue> }[];
  connections: string[];
}
