/** Reine Geometrie des Graph-Editors: Größen, Anschlusspositionen, Bézier-Pfade, Treffer, Raster, Ansicht. */
import type { GraphNode, NodeDef } from '../../../shared/graph';

export const NODE_W = 220;
export const HEADER_H = 26;
export const ROW_H = 24;
export const PAD = 6;
export const GRID = 20;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const PORT_R = 6;

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** Parameter, die nicht zu einem Daten-Eingang gehören, bekommen eigene Zeilen unter den Anschlüssen. */
export function extraParams(def: NodeDef | undefined) {
  if (!def) return [];
  const inputIds = new Set(def.inputs.filter((p) => p.kind !== 'flow').map((p) => p.id));
  return def.params.filter((p) => !inputIds.has(p.id));
}

export function nodeSize(def: NodeDef | undefined): { w: number; h: number } {
  if (!def) return { w: NODE_W, h: HEADER_H + ROW_H + PAD * 2 };
  const rows = Math.max(def.inputs.length, def.outputs.length) + extraParams(def).length;
  return { w: NODE_W, h: HEADER_H + PAD * 2 + Math.max(1, rows) * ROW_H };
}

export function portPos(node: Pt, def: NodeDef | undefined, side: 'in' | 'out', index: number): Pt {
  const { w } = nodeSize(def);
  return { x: node.x + (side === 'out' ? w : 0), y: node.y + HEADER_H + PAD + index * ROW_H + ROW_H / 2 };
}

export function bezierPath(a: Pt, b: Pt): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export function bezierPoint(a: Pt, b: Pt, t: number): Pt {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  const c1 = { x: a.x + dx, y: a.y };
  const c2 = { x: b.x - dx, y: b.y };
  const u = 1 - t;
  const f = (p0: number, p1: number, p2: number, p3: number) => u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  return { x: f(a.x, c1.x, c2.x, b.x), y: f(a.y, c1.y, c2.y, b.y) };
}

export const wireMid = (a: Pt, b: Pt): Pt => bezierPoint(a, b, 0.5);

/** Kleinster Abstand eines Punktes zur Kurve (abgetastet). */
export function distToWire(a: Pt, b: Pt, p: Pt, steps = 24): number {
  let best = Infinity;
  for (let i = 0; i <= steps; i++) {
    const q = bezierPoint(a, b, i / steps);
    best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
  }
  return best;
}

export function snap(v: number, step = GRID): number {
  return Math.round(v / step) * step;
}

export function rectOf(node: GraphNode, def: NodeDef | undefined): Rect {
  const s = nodeSize(def);
  return { x: node.x, y: node.y, w: s.w, h: s.h };
}

export function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function nodesInRect(nodes: GraphNode[], getDef: (t: string) => NodeDef | undefined, rect: Rect): string[] {
  return nodes.filter((n) => rectsIntersect(rectOf(n, getDef(n.type)), rect)).map((n) => n.id);
}

export function hitNode(nodes: GraphNode[], getDef: (t: string) => NodeDef | undefined, p: Pt): string | null {
  for (let i = nodes.length - 1; i >= 0; i--) if (pointInRect(p, rectOf(nodes[i], getDef(nodes[i].type)))) return nodes[i].id;
  return null;
}

export interface PortHit {
  node: string;
  port: string;
  side: 'in' | 'out';
}
export function hitPort(nodes: GraphNode[], getDef: (t: string) => NodeDef | undefined, p: Pt, radius = PORT_R + 4): PortHit | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const def = getDef(n.type);
    if (!def) continue;
    for (const side of ['in', 'out'] as const) {
      const ports = side === 'in' ? def.inputs : def.outputs;
      for (let k = 0; k < ports.length; k++) {
        const pp = portPos(n, def, side, k);
        if (Math.hypot(pp.x - p.x, pp.y - p.y) <= radius) return { node: n.id, port: ports[k].id, side };
      }
    }
  }
  return null;
}

export const screenToWorld = (view: View, p: Pt): Pt => ({ x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom });
export const worldToScreen = (view: View, p: Pt): Pt => ({ x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y });
export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zoomt so, dass der Punkt `at` (Bildschirm) an Ort und Stelle bleibt. */
export function zoomAt(view: View, at: Pt, zoom: number): View {
  const z = clampZoom(zoom);
  const w = screenToWorld(view, at);
  return { zoom: z, x: at.x - w.x * z, y: at.y - w.y * z };
}

export function boundsOf(nodes: GraphNode[], getDef: (t: string) => NodeDef | undefined): Rect | null {
  if (nodes.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) {
    const r = rectOf(n, getDef(n.type));
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function fitView(bounds: Rect | null, size: { w: number; h: number }, margin = 40): View {
  if (!bounds) return { x: size.w / 2, y: size.h / 2, zoom: 1 };
  const z = clampZoom(Math.min((size.w - margin * 2) / Math.max(bounds.w, 1), (size.h - margin * 2) / Math.max(bounds.h, 1), 1));
  return { zoom: z, x: size.w / 2 - (bounds.x + bounds.w / 2) * z, y: size.h / 2 - (bounds.y + bounds.h / 2) * z };
}
