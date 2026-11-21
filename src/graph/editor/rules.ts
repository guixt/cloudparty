/** Verbindungsregeln des Logik-Graphen (reine Funktionen, siehe shared/graph.ts). */
import type { GraphEdge, GraphEndpoint, GraphNode, GraphSpec, NodeDef, PortDef, PortKind } from '../../../shared/graph';

export type DefLookup = (type: string) => NodeDef | undefined;
export type Side = 'in' | 'out';

export function kindsCompatible(from: PortKind, to: PortKind): boolean {
  return from === to || (from === 'number' && to === 'text');
}

export function edgeKey(e: GraphEdge): string {
  return `${e.from.node}.${e.from.port}->${e.to.node}.${e.to.port}`;
}

export function findPort(graph: GraphSpec, getDef: DefLookup, ep: GraphEndpoint, side: Side): PortDef | undefined {
  const node = graph.nodes.find((n) => n.id === ep.node);
  const def = node && getDef(node.type);
  return (side === 'in' ? def?.inputs : def?.outputs)?.find((p) => p.id === ep.port);
}

export interface ConnectResult {
  ok: boolean;
  graph: GraphSpec;
  reason?: string;
}

/** Verbindet zwei Anschlüsse. Die Richtung wird erkannt (Ausgang → Eingang), ein bestehender Zufluss eines Daten-Eingangs wird ersetzt. */
export function connect(graph: GraphSpec, getDef: DefLookup, a: { ep: GraphEndpoint; side: Side }, b: { ep: GraphEndpoint; side: Side }): ConnectResult {
  const fail = (reason: string): ConnectResult => ({ ok: false, graph, reason });
  if (a.side === b.side) return fail(a.side === 'out' ? 'Ein Ausgang kann nur mit einem Eingang verbunden werden.' : 'Ein Eingang kann nur mit einem Ausgang verbunden werden.');
  const [from, to] = a.side === 'out' ? [a.ep, b.ep] : [b.ep, a.ep];
  if (from.node === to.node) return fail('Ein Knoten kann nicht mit sich selbst verbunden werden.');
  const fp = findPort(graph, getDef, from, 'out');
  const tp = findPort(graph, getDef, to, 'in');
  if (!fp || !tp) return fail('Dieser Anschluss ist unbekannt.');
  if (!kindsCompatible(fp.kind, tp.kind)) return fail(fp.kind === 'flow' || tp.kind === 'flow' ? 'Ablauf und Werte lassen sich nicht verbinden.' : 'Diese Anschlussarten passen nicht zusammen.');
  if (graph.edges.some((e) => e.from.node === from.node && e.from.port === from.port && e.to.node === to.node && e.to.port === to.port)) return fail('Diese Verbindung gibt es schon.');
  const kept = tp.kind === 'flow' ? graph.edges : graph.edges.filter((e) => !(e.to.node === to.node && e.to.port === to.port));
  return { ok: true, graph: { ...graph, edges: [...kept, { from: { ...from }, to: { ...to } }] } };
}

export function removeEdge(graph: GraphSpec, key: string): GraphSpec {
  return { ...graph, edges: graph.edges.filter((e) => edgeKey(e) !== key) };
}

export function removeNodes(graph: GraphSpec, ids: string[]): GraphSpec {
  const set = new Set(ids);
  return { ...graph, nodes: graph.nodes.filter((n) => !set.has(n.id)), edges: graph.edges.filter((e) => !set.has(e.from.node) && !set.has(e.to.node)) };
}

/** Ist der Anschluss (node/port/side) ein gültiges Ziel für ein Ziehen von `from`? */
export function portAccepts(graph: GraphSpec, getDef: DefLookup, from: { ep: GraphEndpoint; side: Side }, target: { ep: GraphEndpoint; side: Side }): boolean {
  if (from.ep.node === target.ep.node && from.ep.port === target.ep.port && from.side === target.side) return false;
  const r = connect(graph, getDef, from, target);
  return r.ok || r.reason === 'Diese Verbindung gibt es schon.';
}

/** Knotentypen, die einen zu `kind`/`side` passenden Anschluss haben; liefert den ersten passenden Anschluss. */
export function compatibleTypes(defs: NodeDef[], kind: PortKind, draggedSide: Side): { def: NodeDef; port: PortDef }[] {
  const out: { def: NodeDef; port: PortDef }[] = [];
  for (const def of defs) {
    const ports = draggedSide === 'out' ? def.inputs : def.outputs;
    const port = ports.find((p) => (draggedSide === 'out' ? kindsCompatible(kind, p.kind) : kindsCompatible(p.kind, kind)));
    if (port) out.push({ def, port });
  }
  return out;
}

export function nodeById(graph: GraphSpec, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}
