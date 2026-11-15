/** Sitzungszustand des Graph-Editors (zustand vanilla): Graph, Auswahl, Ansicht, Undo/Redo. */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { GraphEdge, GraphNode, GraphSpec, NodeDef, ParamValue } from '../../../shared/graph';
import { GRAPH_LIMITS } from '../../../shared/graph';
import { snap, type View } from './geometry';
import { connect, edgeKey, removeEdge, removeNodes, type DefLookup, type Side } from './rules';

export interface SessionState {
  graph: GraphSpec;
  baseline: GraphSpec;
  dirty: boolean;
  selection: string[];
  selectedEdge: string | null;
  view: View;
  past: GraphSpec[];
  future: GraphSpec[];
  clipboard: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
  hint: string | null;
}

export interface Session {
  store: StoreApi<SessionState>;
  getDef: DefLookup;
  commit(next: GraphSpec, coalesceKey?: string): void;
  select(ids: string[], additive?: boolean): void;
  selectEdge(key: string | null): void;
  addNode(type: string, x: number, y: number, params?: Record<string, ParamValue>): string | null;
  moveNodes(ids: string[], dx: number, dy: number, coalesceKey?: string): void;
  setNodePositions(pos: Record<string, { x: number; y: number }>, coalesceKey?: string): void;
  setParam(id: string, param: string, value: ParamValue): void;
  connectPorts(a: { node: string; port: string; side: Side }, b: { node: string; port: string; side: Side }): boolean;
  disconnect(key: string): void;
  deleteSelection(): void;
  duplicate(): void;
  copy(): void;
  paste(offset?: number): void;
  selectAll(): void;
  setEnabled(on: boolean): void;
  undo(): void;
  redo(): void;
  load(graph: GraphSpec, asBaseline?: boolean): void;
  markSaved(graph?: GraphSpec): void;
  setView(view: View): void;
  setHint(text: string | null): void;
}

const COALESCE_MS = 600;
const HISTORY = 100;

export function sameGraph(a: GraphSpec, b: GraphSpec): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function freshId(taken: Set<string>, base: string): string {
  const b = base.replace(/[^a-z0-9_]/gi, '').slice(0, 12) || 'n';
  for (let i = 1; ; i++) {
    const id = `${b}_${i}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

export function cloneNodes(graph: GraphSpec, ids: string[], offset: number, taken: Set<string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const set = new Set(ids);
  const map = new Map<string, string>();
  const nodes: GraphNode[] = [];
  for (const n of graph.nodes) {
    if (!set.has(n.id)) continue;
    const id = freshId(taken, n.type);
    map.set(n.id, id);
    nodes.push({ ...n, id, x: n.x + offset, y: n.y + offset, params: n.params ? { ...n.params } : undefined });
  }
  const edges = graph.edges
    .filter((e) => map.has(e.from.node) && map.has(e.to.node))
    .map((e) => ({ from: { node: map.get(e.from.node)!, port: e.from.port }, to: { node: map.get(e.to.node)!, port: e.to.port } }));
  return { nodes, edges };
}

export function createSession(initial: GraphSpec, getDef: (type: string) => NodeDef | undefined): Session {
  const store = createStore<SessionState>(() => ({
    graph: initial, baseline: initial, dirty: false, selection: [], selectedEdge: null,
    view: { x: 60, y: 60, zoom: 1 }, past: [], future: [], clipboard: null, hint: null,
  }));
  const get = store.getState;
  let lastKey: string | null = null;
  let lastAt = 0;

  const commit: Session['commit'] = (next, key) => {
    const s = get();
    if (next === s.graph) return;
    const now = Date.now();
    const coalesce = key !== undefined && key === lastKey && now - lastAt < COALESCE_MS && s.past.length > 0;
    lastKey = key ?? null;
    lastAt = now;
    const past = coalesce ? s.past : [...s.past, s.graph].slice(-HISTORY);
    store.setState({ graph: next, past, future: [], dirty: !sameGraph(next, s.baseline) });
  };

  const sel = (ids: string[]) => store.setState({ selection: ids, selectedEdge: null });
  const nodeIds = () => new Set(get().graph.nodes.map((n) => n.id));

  const session: Session = {
    store, getDef, commit,
    select(ids, additive) {
      const cur = get().selection;
      if (!additive) return sel(ids);
      const set = new Set(cur);
      for (const id of ids) (set.has(id) ? set.delete(id) : set.add(id));
      sel([...set]);
    },
    selectEdge(key) {
      store.setState({ selectedEdge: key, selection: [] });
    },
    addNode(type, x, y, params) {
      const g = get().graph;
      const def = getDef(type);
      if (g.nodes.length >= GRAPH_LIMITS.maxNodes) {
        store.setState({ hint: `Mehr als ${GRAPH_LIMITS.maxNodes} Knoten sind nicht erlaubt.` });
        return null;
      }
      const id = freshId(nodeIds(), type);
      const p: Record<string, ParamValue> = {};
      for (const d of def?.params ?? []) p[d.id] = d.default;
      Object.assign(p, params);
      const node: GraphNode = { id, type, x: snap(x), y: snap(y), ...(Object.keys(p).length ? { params: p } : {}) };
      commit({ ...g, nodes: [...g.nodes, node] });
      sel([id]);
      return id;
    },
    moveNodes(ids, dx, dy, key = 'move') {
      const set = new Set(ids);
      const g = get().graph;
      commit({ ...g, nodes: g.nodes.map((n) => (set.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) }, key);
    },
    setNodePositions(pos, key = 'move') {
      const g = get().graph;
      commit({ ...g, nodes: g.nodes.map((n) => (pos[n.id] ? { ...n, ...pos[n.id] } : n)) }, key);
    },
    setParam(id, param, value) {
      const g = get().graph;
      commit({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [param]: value } } : n)) }, `param:${id}:${param}`);
    },
    connectPorts(a, b) {
      const g = get().graph;
      const r = connect(g, getDef, { ep: { node: a.node, port: a.port }, side: a.side }, { ep: { node: b.node, port: b.port }, side: b.side });
      if (!r.ok) {
        store.setState({ hint: r.reason ?? 'Diese Verbindung geht nicht.' });
        return false;
      }
      if (r.graph.edges.length > GRAPH_LIMITS.maxEdges) {
        store.setState({ hint: `Mehr als ${GRAPH_LIMITS.maxEdges} Verbindungen sind nicht erlaubt.` });
        return false;
      }
      commit(r.graph);
      return true;
    },
    disconnect(key) {
      commit(removeEdge(get().graph, key));
      if (get().selectedEdge === key) store.setState({ selectedEdge: null });
    },
    deleteSelection() {
      const { selection, selectedEdge, graph } = get();
      if (selectedEdge) return session.disconnect(selectedEdge);
      if (selection.length === 0) return;
      commit(removeNodes(graph, selection));
      sel([]);
    },
    duplicate() {
      const { selection, graph } = get();
      if (selection.length === 0 || graph.nodes.length + selection.length > GRAPH_LIMITS.maxNodes) return;
      const c = cloneNodes(graph, selection, 40, nodeIds());
      commit({ ...graph, nodes: [...graph.nodes, ...c.nodes], edges: [...graph.edges, ...c.edges] });
      sel(c.nodes.map((n) => n.id));
    },
    copy() {
      const { selection, graph } = get();
      if (selection.length === 0) return;
      const set = new Set(selection);
      store.setState({
        clipboard: {
          nodes: graph.nodes.filter((n) => set.has(n.id)).map((n) => ({ ...n, params: n.params ? { ...n.params } : undefined })),
          edges: graph.edges.filter((e) => set.has(e.from.node) && set.has(e.to.node)),
        },
      });
    },
    paste(offset = 40) {
      const { clipboard, graph } = get();
      if (!clipboard || graph.nodes.length + clipboard.nodes.length > GRAPH_LIMITS.maxNodes) return;
      const tmp: GraphSpec = { ...graph, nodes: clipboard.nodes, edges: clipboard.edges };
      const c = cloneNodes(tmp, clipboard.nodes.map((n) => n.id), offset, nodeIds());
      commit({ ...graph, nodes: [...graph.nodes, ...c.nodes], edges: [...graph.edges, ...c.edges] });
      sel(c.nodes.map((n) => n.id));
      // Beim nächsten Einfügen weiter versetzen
      store.setState({ clipboard: { nodes: clipboard.nodes.map((n) => ({ ...n, x: n.x + offset, y: n.y + offset })), edges: clipboard.edges } });
    },
    selectAll() {
      sel(get().graph.nodes.map((n) => n.id));
    },
    setEnabled(on) {
      const g = get().graph;
      if (g.enabled !== on) commit({ ...g, enabled: on });
    },
    undo() {
      const s = get();
      if (s.past.length === 0) return;
      const prev = s.past[s.past.length - 1];
      lastKey = null;
      store.setState({ graph: prev, past: s.past.slice(0, -1), future: [s.graph, ...s.future], dirty: !sameGraph(prev, s.baseline), selection: s.selection.filter((id) => prev.nodes.some((n) => n.id === id)) });
    },
    redo() {
      const s = get();
      if (s.future.length === 0) return;
      const next = s.future[0];
      lastKey = null;
      store.setState({ graph: next, past: [...s.past, s.graph], future: s.future.slice(1), dirty: !sameGraph(next, s.baseline) });
    },
    load(graph, asBaseline = false) {
      if (asBaseline) store.setState({ graph, baseline: graph, dirty: false, past: [], future: [], selection: [], selectedEdge: null });
      else {
        commit(graph);
        store.setState({ selection: [], selectedEdge: null });
      }
    },
    markSaved(graph) {
      const g = graph ?? get().graph;
      store.setState({ baseline: g, dirty: !sameGraph(get().graph, g) });
    },
    setView(view) {
      store.setState({ view });
    },
    setHint(text) {
      store.setState({ hint: text });
    },
  };
  return session;
}

export { edgeKey };
