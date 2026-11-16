/** Reine Logik des Plan-Editors: Geometrie, Kantenpfade, Fortschritt, Ausführbarkeits-Gründe. */
import { isQueueable, predecessors, queueableOrder, type PlanNode, type PlanSpec, type PlanStatus } from '../../../shared/plan';

export const NODE_W = 200;
export const NODE_H = 92;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

export interface Pt { x: number; y: number }
export interface View { x: number; y: number; zoom: number }

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const screenToWorld = (v: View, p: Pt): Pt => ({ x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom });

/** Zoomt so, dass der Punkt `at` (Bildschirm) an Ort und Stelle bleibt. */
export function zoomAt(v: View, at: Pt, zoom: number): View {
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const w = screenToWorld(v, at);
  return { zoom: z, x: at.x - w.x * z, y: at.y - w.y * z };
}

export const outPort = (n: Pick<PlanNode, 'x' | 'y'>): Pt => ({ x: n.x + NODE_W, y: n.y + NODE_H / 2 });
export const inPort = (n: Pick<PlanNode, 'x' | 'y'>): Pt => ({ x: n.x, y: n.y + NODE_H / 2 });

/** Bézier-Pfad von einem Ausgang (rechts) zu einem Eingang (links). */
export function edgePath(a: Pt, b: Pt): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

/** Fortschritt: deaktivierte Knoten zählen nicht mit. */
export function progress(plan: PlanSpec): { done: number; total: number } {
  const active = plan.nodes.filter((n) => n.status !== 'disabled');
  return { done: active.filter((n) => n.status === 'done').length, total: active.length };
}
export const progressText = (plan: PlanSpec): string => {
  const p = progress(plan);
  return `${p.done}/${p.total} fertig`;
};

/** Warum ist „Ausführen“ gesperrt? null = ausführbar. */
export function runBlockReason(plan: PlanSpec, nodeId: string, canBuild: boolean): string | null {
  if (!canBuild) return 'Auf dieser Insel darfst du nicht bauen.';
  const n = plan.nodes.find((x) => x.id === nodeId);
  if (!n) return 'Knoten nicht gefunden.';
  if (n.status === 'running') return 'Der Knoten läuft gerade.';
  if (n.status === 'queued') return 'Der Knoten wartet schon in der Warteschlange.';
  if (n.status === 'done') return 'Der Knoten ist schon fertig. Erst auf offen zurücksetzen.';
  if (n.status === 'disabled') return 'Der Knoten ist deaktiviert.';
  if (!isQueueable(plan, nodeId)) return 'Vorgänger noch nicht fertig (oder eingereiht).';
  return null;
}

export function runAllBlockReason(plan: PlanSpec, canBuild: boolean): string | null {
  if (!canBuild) return 'Auf dieser Insel darfst du nicht bauen.';
  if (queueableOrder(plan).length === 0) return plan.nodes.some((n) => n.status === 'queued' || n.status === 'running') ? 'Alles ist schon eingereiht oder läuft.' : 'Nichts mehr auszuführen.';
  return null;
}

export const STATUS_LABEL: Record<PlanStatus, string> = { open: 'Offen', queued: 'Wartet', running: 'Läuft', done: 'Fertig', failed: 'Fehler', disabled: 'Deaktiviert' };

export const previewNotes = (notes: string, max = 70): string => {
  const t = notes.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export const entityCount = (n: PlanNode): number => n.result?.entityIds.length ?? 0;

/** Anzeigenamen der Vorgänger (für die Seitenleiste). */
export const predecessorTitles = (plan: PlanSpec, nodeId: string): string[] => predecessors(plan, nodeId).map((p) => p.title);

/** Ansicht, die alle Knoten umfasst. */
export function fitView(nodes: Array<Pick<PlanNode, 'x' | 'y'>>, size: { w: number; h: number }): View {
  if (nodes.length === 0) return { x: 40, y: 40, zoom: 1 };
  const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)), maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
  const zoom = clamp(Math.min((size.w - 80) / (maxX - minX), (size.h - 80) / (maxY - minY), 1), MIN_ZOOM, MAX_ZOOM);
  return { zoom, x: (size.w - (maxX - minX) * zoom) / 2 - minX * zoom, y: (size.h - (maxY - minY) * zoom) / 2 - minY * zoom };
}
