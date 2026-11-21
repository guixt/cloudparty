/**
 * Kompaktform des Graphen für die KI und automatische Anordnung (Paket 18).
 */
import type { CompactGraph, GraphEdge, GraphNode, GraphSpec, ParamDef, ParamValue } from './graph';
import { getNodeDef, NODE_DEFS } from './graphNodes';

const COL_W = 260;
const ROW_H = 140;
const MARGIN = 40;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ARROW = /\s*(?:->|→|=>|-->|⟶|➔|➜)\s*/;

const KIND_DE: Record<ParamDef['kind'], string> = { number: 'Zahl', text: 'Text', boolean: 'Ja/Nein (true/false)', color: 'Farbe (#RRGGBB)', select: 'Auswahl' };

function paramProblem(p: ParamDef, v: ParamValue): string | null {
  switch (p.kind) {
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) ? null : 'eine Zahl';
    case 'text':
      return typeof v === 'string' ? null : 'ein Text';
    case 'boolean':
      return typeof v === 'boolean' ? null : 'true oder false';
    case 'color':
      return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? null : 'eine Farbe wie "#ff8800"';
    case 'select':
      return typeof v === 'string' && p.options?.some((o) => o.value === v) ? null : `einer von: ${p.options?.map((o) => o.value).join(', ')}`;
  }
}

/** Wandelt die Kompaktform in einen vollständigen Graphen (mit automatischer Anordnung). Wirft Error mit deutscher Meldung bei Formfehlern. */
export function compactToGraph(compact: CompactGraph): GraphSpec {
  const problems: string[] = [];
  const nodes: GraphNode[] = [];
  const byId = new Map<string, NonNullable<ReturnType<typeof getNodeDef>>>();
  const types = NODE_DEFS.map((d) => d.type).join(', ');
  if (!compact || !Array.isArray(compact.nodes)) throw new Error('„nodes“ muss eine Liste sein.');
  for (const n of compact.nodes) {
    const id = n?.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) {
      problems.push(`Ungültige Knoten-ID „${String(id).slice(0, 40)}“ (erlaubt: Buchstaben, Ziffern, _ und -, höchstens 40 Zeichen, ohne Punkt).`);
      continue;
    }
    if (byId.has(id)) {
      problems.push(`Die Knoten-ID „${id}“ kommt mehrfach vor.`);
      continue;
    }
    const d = getNodeDef(String(n.type));
    if (!d) {
      problems.push(`Knoten „${id}“: Unbekannter Typ „${String(n.type).slice(0, 40)}“. Gültige Typen: ${types}.`);
      continue;
    }
    byId.set(id, d);
    const params: Record<string, ParamValue> = {};
    for (const p of d.params) params[p.id] = p.default;
    for (const [k, v] of Object.entries(n.params ?? {})) {
      const p = d.params.find((x) => x.id === k);
      if (!p) {
        problems.push(`Knoten „${id}“ (${d.type}): Unbekannter Parameter „${k}“. Gültige Parameter: ${d.params.map((x) => x.id).join(', ') || 'keine'}.`);
        continue;
      }
      const bad = paramProblem(p, v);
      if (bad) {
        problems.push(`Knoten „${id}“ (${d.type}): Parameter „${k}“ (${KIND_DE[p.kind]}) erwartet ${bad}.`);
        continue;
      }
      params[k] = v;
    }
    nodes.push({ id, type: d.type, x: 0, y: 0, params });
  }

  const edges: GraphEdge[] = [];
  if (!Array.isArray(compact.connections ?? [])) problems.push('„connections“ muss eine Liste sein.');
  for (const c of Array.isArray(compact.connections) ? compact.connections : []) {
    const parts = String(c).trim().split(ARROW);
    if (parts.length !== 2) {
      problems.push(`Verbindung „${String(c).slice(0, 60)}“: Erwartet wird die Form „knoten.ausgang -> knoten.eingang“.`);
      continue;
    }
    const ends = parts.map((part) => {
      const t = part.trim();
      const i = t.lastIndexOf('.');
      return i > 0 && i < t.length - 1 ? { node: t.slice(0, i), port: t.slice(i + 1) } : null;
    });
    if (!ends[0] || !ends[1]) {
      problems.push(`Verbindung „${String(c).slice(0, 60)}“: Jede Seite muss „knoten.port“ heißen.`);
      continue;
    }
    const [from, to] = ends as [{ node: string; port: string }, { node: string; port: string }];
    const a = byId.get(from.node);
    const b = byId.get(to.node);
    if (!a) problems.push(`Verbindung „${c}“: Es gibt keinen Knoten „${from.node}“. Vorhandene IDs: ${[...byId.keys()].join(', ') || 'keine'}.`);
    if (!b) problems.push(`Verbindung „${c}“: Es gibt keinen Knoten „${to.node}“. Vorhandene IDs: ${[...byId.keys()].join(', ') || 'keine'}.`);
    if (!a || !b) continue;
    if (!a.outputs.some((p) => p.id === from.port)) {
      problems.push(`Verbindung „${c}“: „${from.node}“ (${a.type}) hat keinen Ausgang „${from.port}“. Ausgänge: ${a.outputs.map((p) => p.id).join(', ') || 'keine'}.`);
      continue;
    }
    if (!b.inputs.some((p) => p.id === to.port)) {
      problems.push(`Verbindung „${c}“: „${to.node}“ (${b.type}) hat keinen Eingang „${to.port}“. Eingänge: ${b.inputs.map((p) => p.id).join(', ') || 'keine'}.`);
      continue;
    }
    edges.push({ from, to });
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return autoLayout({ version: 1, enabled: true, nodes, edges });
}

/** Gegenrichtung (für die KI, um bestehende Graphen zu lesen). Nur von den Standardwerten abweichende Parameter. */
export function graphToCompact(graph: GraphSpec): CompactGraph {
  return {
    nodes: graph.nodes.map((n) => {
      const d = getNodeDef(n.type);
      const params: Record<string, ParamValue> = {};
      for (const [k, v] of Object.entries(n.params ?? {})) {
        if (!d || d.params.find((p) => p.id === k)?.default !== v) params[k] = v;
      }
      return Object.keys(params).length ? { id: n.id, type: n.type, params } : { id: n.id, type: n.type };
    }),
    connections: graph.edges.map((e) => `${e.from.node}.${e.from.port} -> ${e.to.node}.${e.to.port}`),
  };
}

/** Ordnet Knoten von links nach rechts nach Ablauf an (setzt x/y). Gibt einen neuen Graphen zurück. */
export function autoLayout(graph: GraphSpec): GraphSpec {
  const ids = graph.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const hasFlow = new Map<string, boolean>();
  for (const n of graph.nodes) {
    const d = getNodeDef(n.type);
    hasFlow.set(n.id, !d || d.category === 'Ereignisse' || [...d.inputs, ...d.outputs].some((p) => p.kind === 'flow'));
  }
  const edges = graph.edges.filter((e) => index.has(e.from.node) && index.has(e.to.node));
  const col = new Map<string, number>(ids.map((id) => [id, 0]));
  // Ablaufknoten: längster Weg über Ablaufkanten (begrenzte Durchläufe, damit Zyklen nicht hängen)
  const flowEdges = edges.filter((e) => hasFlow.get(e.from.node) && hasFlow.get(e.to.node));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of flowEdges) {
      const want = col.get(e.from.node)! + 1;
      if (col.get(e.to.node)! < want) (col.set(e.to.node, want), (changed = true));
    }
    if (!changed) break;
  }
  // Reine Datenknoten: links von ihrem ersten Verbraucher
  const dataIds = ids.filter((id) => !hasFlow.get(id));
  const raw = new Map<string, number>(ids.map((id) => [id, col.get(id)!]));
  for (let pass = 0; pass < ids.length + 1; pass++) {
    let changed = false;
    for (const id of dataIds) {
      const consumers = edges.filter((e) => e.from.node === id).map((e) => raw.get(e.to.node)!);
      if (!consumers.length) continue;
      const want = Math.min(...consumers) - 1;
      if (raw.get(id) !== want) (raw.set(id, want), (changed = true));
    }
    if (!changed) break;
  }
  const minCol = Math.min(0, ...raw.values());
  const cols = new Map<number, string[]>();
  for (const id of ids) {
    const c = raw.get(id)! - minCol;
    cols.set(c, [...(cols.get(c) ?? []), id]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const c of [...cols.keys()].sort((a, b) => a - b)) {
    const members = cols.get(c)!;
    const key = (id: string) => {
      const preds = edges.filter((e) => e.to.node === id && pos.has(e.from.node)).map((e) => pos.get(e.from.node)!.y);
      return preds.length ? preds.reduce((s, y) => s + y, 0) / preds.length : Number.POSITIVE_INFINITY;
    };
    const sorted = [...members].sort((p, q) => key(p) - key(q) || index.get(p)! - index.get(q)!);
    sorted.forEach((id, row) => pos.set(id, { x: MARGIN + c * COL_W, y: MARGIN + row * ROW_H }));
  }
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, ...pos.get(n.id)! })), edges: graph.edges.map((e) => ({ from: { ...e.from }, to: { ...e.to } })) };
}
