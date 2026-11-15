/** Unendliche Arbeitsfläche: Schwenken, Zoomen, Knoten ziehen, Kabel verbinden, Auswahlrahmen, Minimap. */
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { useStore } from 'zustand';
import type { GraphNode, GraphSpec, NodeDef } from '../../../shared/graph';
import {
  GRID, bezierPath, boundsOf, fitView, hitNode, hitPort, normRect, nodesInRect, portPos, screenToWorld, snap, wireMid, zoomAt,
  type Pt, type Rect, type View,
} from './geometry';
import { KIND_COLOR } from './meta';
import { NodeView, type LinkInfo } from './NodeView';
import { Palette } from './Palette';
import { compatibleTypes, edgeKey, type Side } from './rules';
import type { Session } from './state';
import { nodesByCategory } from '../../../shared/graphNodes';

export interface CanvasControls {
  fit(): void;
  focusNode(id: string): void;
  openPalette(): void;
}

interface Props {
  session: Session;
  issues: Map<string, 'error' | 'warning'>;
  controlsRef: Ref<CanvasControls>;
  allDefs: NodeDef[];
}

interface Link extends LinkInfo {
  cursor: Pt;
  moved: boolean;
}
interface PalState {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  from?: LinkInfo;
}

const isField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

const WireLayer = memo(function WireLayer({ graph, getDef, hoverNode, selectedEdge, link, onEdgeDown, onRemove }: {
  graph: GraphSpec; getDef: (t: string) => NodeDef | undefined; hoverNode: string | null; selectedEdge: string | null; link: Link | null;
  onEdgeDown(e: React.PointerEvent, key: string): void; onRemove(key: string): void;
}) {
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const nodes = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const items = useMemo(() => {
    const out: { key: string; a: Pt; b: Pt; kind: string; from: string; to: string }[] = [];
    for (const e of graph.edges) {
      const fn = nodes.get(e.from.node);
      const tn = nodes.get(e.to.node);
      const fd = fn && getDef(fn.type);
      const td = tn && getDef(tn.type);
      if (!fn || !tn || !fd || !td) continue;
      const fi = fd.outputs.findIndex((p) => p.id === e.from.port);
      const ti = td.inputs.findIndex((p) => p.id === e.to.port);
      if (fi < 0 || ti < 0) continue;
      out.push({ key: edgeKey(e), a: portPos(fn, fd, 'out', fi), b: portPos(tn, td, 'in', ti), kind: fd.outputs[fi].kind, from: e.from.node, to: e.to.node });
    }
    return out;
  }, [graph.edges, nodes, getDef]);
  return (
    <svg className="ge-wires" width="1" height="1">
      {items.map((w) => {
        const hot = hoverNode === w.from || hoverNode === w.to || hoverEdge === w.key || selectedEdge === w.key;
        const d = bezierPath(w.a, w.b);
        return (
          <g key={w.key} data-testid="graph-wire" data-key={w.key}>
            <path d={d} className={`ge-wire${hot ? ' ge-wire-hot' : ''}${selectedEdge === w.key ? ' ge-wire-sel' : ''}`} stroke={KIND_COLOR[w.kind as keyof typeof KIND_COLOR]} strokeWidth={w.kind === 'flow' ? 3.5 : 2} />
            <path d={d} className="ge-wire-hit" onPointerDown={(e) => onEdgeDown(e, w.key)} onPointerEnter={() => setHoverEdge(w.key)} onPointerLeave={() => setHoverEdge(null)} />
            {(hoverEdge === w.key || selectedEdge === w.key) && (() => {
              const m = wireMid(w.a, w.b);
              return (
                <g className="ge-wire-x" transform={`translate(${m.x} ${m.y})`} onPointerEnter={() => setHoverEdge(w.key)} onPointerDown={(e) => { e.stopPropagation(); onRemove(w.key); }} data-testid="wire-remove">
                  <circle r={8} /><path d="M -3 -3 L 3 3 M 3 -3 L -3 3" />
                </g>
              );
            })()}
          </g>
        );
      })}
      {link && (() => {
        const n = nodes.get(link.node);
        const d = n && getDef(n.type);
        if (!n || !d) return null;
        const ports = link.side === 'out' ? d.outputs : d.inputs;
        const i = ports.findIndex((p) => p.id === link.port);
        const p0 = portPos(n, d, link.side, Math.max(0, i));
        const path = link.side === 'out' ? bezierPath(p0, link.cursor) : bezierPath(link.cursor, p0);
        return <path d={path} className="ge-wire ge-wire-pending" stroke={KIND_COLOR[link.kind]} strokeWidth={link.kind === 'flow' ? 3.5 : 2} />;
      })()}
    </svg>
  );
});

export function Canvas({ session, issues, controlsRef, allDefs }: Props) {
  const graph = useStore(session.store, (s) => s.graph);
  const selection = useStore(session.store, (s) => s.selection);
  const selectedEdge = useStore(session.store, (s) => s.selectedEdge);
  const view = useStore(session.store, (s) => s.view);
  const hint = useStore(session.store, (s) => s.hint);
  const getDef = session.getDef;
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const linkRef = useRef<Link | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [pal, setPal] = useState<PalState | null>(null);
  const [space, setSpace] = useState(false);
  const [mini, setMini] = useState(true);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const gesture = useRef<null | { kind: 'pan' | 'drag' | 'marquee'; start: Pt; view?: View; orig?: Record<string, Pt>; ids?: string[]; base?: string[]; key?: string; moved: boolean; button: number }>(null);
  const dragCounter = useRef(0);
  const lastPointer = useRef<Pt>({ x: 0, y: 0 });

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = ref.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const world = (e: { clientX: number; clientY: number }): Pt => screenToWorld(viewRef.current, local(e));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Rad: Strg = Zoomen, sonst Schwenken
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        session.setView(zoomAt(v, { x: e.clientX - r.left, y: e.clientY - r.top }, v.zoom * Math.exp(-e.deltaY * 0.0015)));
      } else {
        session.setView({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [session]);

  const fit = useCallback(() => {
    const el = ref.current;
    const g = session.store.getState().graph;
    session.setView(fitView(boundsOf(g.nodes, getDef), { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 500 }));
  }, [session, getDef]);

  const openPaletteAt = useCallback((sx: number, sy: number, from?: LinkInfo) => {
    const w = screenToWorld(viewRef.current, { x: sx, y: sy });
    setPal({ sx, sy, wx: w.x, wy: w.y, from });
  }, []);

  useImperativeHandle(controlsRef, () => ({
    fit,
    focusNode(id) {
      const n = session.store.getState().graph.nodes.find((x) => x.id === id);
      if (!n) return;
      session.select([id]);
      const v = viewRef.current;
      session.setView({ ...v, x: size.w / 2 - (n.x + 110) * v.zoom, y: size.h / 2 - (n.y + 30) * v.zoom });
    },
    openPalette() {
      const c = lastPointer.current;
      openPaletteAt(c.x, c.y);
    },
  }), [fit, session, size, openPaletteAt]);

  const connectedMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of graph.edges) {
      const list = m.get(e.to.node) ?? [];
      list.push(e.to.port);
      m.set(e.to.node, list);
    }
    return new Map([...m].map(([k, v]) => [k, v.sort().join(',')]));
  }, [graph.edges]);
  const selSet = useMemo(() => new Set(selection), [selection]);

  const onNodeDown = useCallback((e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || space) return;
    if ((e.target as HTMLElement).closest('input, select, textarea, .ge-port')) return;
    e.stopPropagation();
    ref.current?.focus();
    const st = session.store.getState();
    let ids = st.selection;
    if (e.shiftKey) {
      session.select([id], true);
      return;
    }
    if (!ids.includes(id)) {
      session.select([id]);
      ids = [id];
    }
    const set = new Set(ids);
    const orig: Record<string, Pt> = {};
    for (const n of st.graph.nodes) if (set.has(n.id)) orig[n.id] = { x: n.x, y: n.y };
    gesture.current = { kind: 'drag', start: local(e), orig, ids, key: `drag${++dragCounter.current}`, moved: false, button: 0 };
    ref.current?.setPointerCapture(e.pointerId);
  }, [session, space]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPortDown = useCallback((e: React.PointerEvent, node: string, port: string, side: Side) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    ref.current?.focus();
    const st = session.store.getState();
    const n = st.graph.nodes.find((x) => x.id === node);
    const def = n && getDef(n.type);
    if (!n || !def) return;
    let from: LinkInfo = { node, port, side, kind: (side === 'in' ? def.inputs : def.outputs).find((p) => p.id === port)!.kind };
    if (side === 'in') {
      // Bestehendes Kabel am Eingang greifen und neu verlegen
      const existing = [...st.graph.edges].reverse().find((x) => x.to.node === node && x.to.port === port);
      if (existing) {
        const fd = st.graph.nodes.find((x) => x.id === existing.from.node);
        const fdef = fd && getDef(fd.type);
        const fp = fdef?.outputs.find((p) => p.id === existing.from.port);
        if (fp) {
          session.disconnect(edgeKey(existing));
          from = { node: existing.from.node, port: existing.from.port, side: 'out', kind: fp.kind };
        }
      }
    }
    const l: Link = { ...from, cursor: world(e), moved: false };
    linkRef.current = l;
    setLink(l);
    ref.current?.setPointerCapture(e.pointerId);
  }, [session, getDef]); // eslint-disable-line react-hooks/exhaustive-deps

  const onEdgeDown = useCallback((e: React.PointerEvent, key: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    ref.current?.focus();
    if (e.altKey) session.disconnect(key);
    else session.selectEdge(key);
  }, [session]);

  const onPointerDown = (e: React.PointerEvent) => {
    ref.current?.focus();
    if (pal) return;
    const p = local(e);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && space)) {
      e.preventDefault();
      gesture.current = { kind: 'pan', start: p, view: viewRef.current, moved: false, button: e.button };
      ref.current?.setPointerCapture(e.pointerId);
    } else if (e.button === 0) {
      const base = e.shiftKey ? session.store.getState().selection : [];
      if (!e.shiftKey) session.select([]);
      gesture.current = { kind: 'marquee', start: p, base, moved: false, button: 0 };
      ref.current?.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    lastPointer.current = p;
    const l = linkRef.current;
    if (l) {
      const n = { ...l, cursor: world(e), moved: true };
      linkRef.current = n;
      setLink(n);
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 3) return;
    g.moved = true;
    if (g.kind === 'pan' && g.view) session.setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    else if (g.kind === 'drag' && g.orig) {
      const z = viewRef.current.zoom;
      const pos: Record<string, Pt> = {};
      for (const id of Object.keys(g.orig)) {
        const o = g.orig[id];
        pos[id] = e.altKey ? { x: Math.round(o.x + dx / z), y: Math.round(o.y + dy / z) } : { x: snap(o.x + dx / z), y: snap(o.y + dy / z) };
      }
      session.setNodePositions(pos, g.key);
    } else if (g.kind === 'marquee') {
      const a = screenToWorld(viewRef.current, g.start);
      const b = screenToWorld(viewRef.current, p);
      const r = normRect(a, b);
      setMarquee(r);
      const ids = nodesInRect(session.store.getState().graph.nodes, getDef, r);
      const set = new Set([...(g.base ?? []), ...ids]);
      session.store.setState({ selection: [...set], selectedEdge: null });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* egal */ }
    const l = linkRef.current;
    if (l) {
      linkRef.current = null;
      setLink(null);
      const w = world(e);
      const st = session.store.getState();
      const hit = hitPort(st.graph.nodes, getDef, w, 14);
      if (hit) {
        if (!(hit.node === l.node && hit.port === l.port && hit.side === l.side)) session.connectPorts({ node: l.node, port: l.port, side: l.side }, hit);
      } else if (l.moved) {
        const hitNodeBody = hitNode(st.graph.nodes, getDef, w) !== null;
        if (!hitNodeBody) {
          const s = local(e);
          openPaletteAt(s.x, s.y, l);
        }
      }
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    if (g?.kind === 'pan' && g.button === 2 && !g.moved) {
      const s = local(e);
      openPaletteAt(s.x, s.y);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isField(e.target)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); setSpace(true); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); session.deleteSelection(); }
    else if (e.key === 'Home') { e.preventDefault(); fit(); }
    else if (e.key === 'Escape') { if (pal) setPal(null); else session.select([]); }
    else if (ctrl && k === 'a') { e.preventDefault(); session.selectAll(); }
    else if (ctrl && k === 'd') { e.preventDefault(); session.duplicate(); }
    else if (ctrl && k === 'c') { e.preventDefault(); session.copy(); }
    else if (ctrl && k === 'v') { e.preventDefault(); session.paste(); }
    else if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); session.undo(); }
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); session.redo(); }
  };
  const onKeyUp = (e: React.KeyboardEvent) => { if (e.key === ' ') setSpace(false); };

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => session.setHint(null), 3500);
    return () => clearTimeout(t);
  }, [hint, session]);

  const pickFromPalette = (def: NodeDef) => {
    if (!pal) return;
    const from = pal.from;
    const id = session.addNode(def.type, pal.wx, pal.wy);
    if (id && from) {
      const cands = compatibleTypes([def], from.kind, from.side);
      const port = cands[0]?.port;
      if (port) session.connectPorts({ node: from.node, port: from.port, side: from.side }, { node: id, port: port.id, side: from.side === 'out' ? 'in' : 'out' });
    }
    setPal(null);
    ref.current?.focus();
  };

  const allowed = useMemo(() => {
    if (!pal?.from) return null;
    return new Set(compatibleTypes(allDefs, pal.from.kind, pal.from.side).map((c) => c.def.type));
  }, [pal, allDefs]);
  const groups = useMemo(() => nodesByCategory(), [allDefs]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkInfo: LinkInfo | null = link ? { node: link.node, port: link.port, side: link.side, kind: link.kind } : null;
  const linkKey = link ? `${link.node}.${link.port}.${link.side}` : '';
  const stableLink = useMemo(() => linkInfo, [linkKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const bounds = useMemo(() => boundsOf(graph.nodes, getDef), [graph.nodes, getDef]);

  return (
    <div
      ref={ref}
      className={`ge-canvas${space ? ' ge-canvas-pan' : ''}${link ? ' ge-linking' : ''}`}
      data-testid="graph-canvas"
      tabIndex={0}
      style={{ backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('ge-world')) { const s = local(e); openPaletteAt(s.x, s.y); } }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onScroll={(e) => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; }}
    >
      <div className="ge-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <WireLayer graph={graph} getDef={getDef} hoverNode={hoverNode} selectedEdge={selectedEdge} link={link} onEdgeDown={onEdgeDown} onRemove={session.disconnect} />
        {graph.nodes.map((n: GraphNode) => (
          <NodeView
            key={n.id}
            node={n}
            def={getDef(n.type)}
            selected={selSet.has(n.id)}
            issue={issues.get(n.id) ?? null}
            connected={connectedMap.get(n.id) ?? ''}
            link={stableLink}
            session={session}
            onPortDown={onPortDown}
            onNodeDown={onNodeDown}
            onHover={setHoverNode}
          />
        ))}
        {marquee && <div className="ge-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
      </div>
      {graph.nodes.length === 0 && (
        <div className="ge-empty" data-testid="graph-empty">
          <strong>Noch leer</strong>
          <span>Ziehe Knoten aus der Palette oder wähle eine Vorlage</span>
          <span className="cp-muted">Rechtsklick oder Doppelklick öffnet die Palette</span>
        </div>
      )}
      {hint && <div className="ge-hint" data-testid="graph-hint" role="status">{hint}</div>}
      <div className="ge-zoombar" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button type="button" className="cp-button ge-small" title="Verkleinern" onClick={() => session.setView(zoomAt(view, { x: size.w / 2, y: size.h / 2 }, view.zoom / 1.25))}>−</button>
        <span className="ge-zoomval" data-testid="graph-zoom">{Math.round(view.zoom * 100)} %</span>
        <button type="button" className="cp-button ge-small" title="Vergrößern" onClick={() => session.setView(zoomAt(view, { x: size.w / 2, y: size.h / 2 }, view.zoom * 1.25))}>+</button>
        <button type="button" className="cp-button ge-small" data-testid="graph-fit" title="Alles zeigen (Pos1)" onClick={fit}>Alles zeigen</button>
        <button type="button" className={`cp-button ge-small${mini ? ' cp-button-active' : ''}`} title="Minimap" onClick={() => setMini(!mini)}>Karte</button>
      </div>
      {mini && graph.nodes.length > 0 && bounds && <Minimap graph={graph} getDef={getDef} bounds={bounds} view={view} size={size} selSet={selSet} onJump={(w) => session.setView({ ...view, x: size.w / 2 - w.x * view.zoom, y: size.h / 2 - w.y * view.zoom })} />}
      {pal && <Palette x={Math.max(0, Math.min(pal.sx, size.w - 300))} y={Math.max(0, Math.min(pal.sy, size.h - 200))} groups={groups} allowed={allowed} title={pal.from ? 'Passenden Knoten verbinden' : undefined} onPick={pickFromPalette} onClose={() => { setPal(null); ref.current?.focus(); }} />}
    </div>
  );
}

function Minimap({ graph, getDef, bounds, view, size, selSet, onJump }: { graph: GraphSpec; getDef: (t: string) => NodeDef | undefined; bounds: Rect; view: View; size: { w: number; h: number }; selSet: Set<string>; onJump(w: Pt): void }) {
  const W = 160, H = 100;
  const vp: Rect = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };
  const x1 = Math.min(bounds.x, vp.x), y1 = Math.min(bounds.y, vp.y);
  const x2 = Math.max(bounds.x + bounds.w, vp.x + vp.w), y2 = Math.max(bounds.y + bounds.h, vp.y + vp.h);
  const sc = Math.min(W / (x2 - x1), H / (y2 - y1));
  const ox = (W - (x2 - x1) * sc) / 2 - x1 * sc;
  const oy = (H - (y2 - y1) * sc) / 2 - y1 * sc;
  return (
    <svg className="ge-minimap" width={W} height={H} data-testid="graph-minimap" onPointerDown={(e) => {
      e.stopPropagation();
      const r = (e.currentTarget as SVGElement).getBoundingClientRect();
      onJump({ x: (e.clientX - r.left - ox) / sc, y: (e.clientY - r.top - oy) / sc });
    }}>
      {graph.nodes.map((n) => {
        const d = getDef(n.type);
        return <rect key={n.id} x={n.x * sc + ox} y={n.y * sc + oy} width={Math.max(2, 220 * sc)} height={Math.max(2, (d ? 24 + 12 + Math.max(d.inputs.length, d.outputs.length) * 24 : 40) * sc)} className={selSet.has(n.id) ? 'ge-mm-sel' : 'ge-mm-node'} />;
      })}
      <rect x={vp.x * sc + ox} y={vp.y * sc + oy} width={vp.w * sc} height={vp.h * sc} className="ge-mm-view" />
    </svg>
  );
}
