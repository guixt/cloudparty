/**
 * Plan-Board: gemeinsamer Bauplan aus Knoten, an dem Nutzer und KI arbeiten.
 * VERTRAG: nur der Koordinator ändert diese Datei.
 *
 * Konventionen
 * - Pläne liegen in `world.extensions['cloudparty.plans']` (Liste von PlanSpec) und reisen so mit
 *   Autosave, Export und Import der Welt.
 * - Eine Kante `from → to` heißt: `to` hängt von `from` ab (erst `from` ausführen).
 * - Status: open (noch zu tun), queued (zur Ausführung eingereiht, wartet), running (läuft gerade), done (fertig),
 *   failed (Fehler, kann wiederholt werden), disabled (wird übersprungen und blockiert nichts).
 *   queued und running sind flüchtig: beim Laden einer Welt werden sie zu open.
 * - `result` verknüpft einen fertigen Knoten mit dem, was er gebaut hat (Objekt-ids, optional Gruppe, Kurztext).
 * - Alle Texte sind Daten: die KI bekommt sie nur umrahmt (wrapData), nie als Anweisung.
 */

export const PLAN_EXTENSION_KEY = 'cloudparty.plans';

export const PLAN_LIMITS = {
  plans: 5,
  nodes: 120,
  edges: 400,
  title: 80,
  notes: 2000,
  summary: 400,
  resultEntities: 300,
} as const;

export const PLAN_STATUSES = ['open', 'queued', 'running', 'done', 'failed', 'disabled'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export interface PlanResult {
  entityIds: string[];
  group?: string;
  summary: string;
}

export interface PlanNode {
  id: string;
  title: string;
  /** Freier Text: Maße, Farben, Stil, Referenzpunkte – spätere Knoten lesen ihn. */
  notes: string;
  status: PlanStatus;
  /** Position im Editor (Pixel, ungezoomt). */
  x: number;
  y: number;
  result?: PlanResult;
}

export interface PlanEdge {
  from: string;
  to: string;
}

export interface PlanSpec {
  id: string;
  title: string;
  nodes: PlanNode[];
  edges: PlanEdge[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clipText = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e5, Math.min(1e5, v)) : fallback);

/** Kantenliste ohne Zyklus? (Kahn). */
export function hasCycle(nodeIds: string[], edges: PlanEdge[]): boolean {
  return topoOrder(nodeIds, edges) === null;
}

/** Topologische Reihenfolge (stabil nach Eingabereihenfolge); null bei Zyklus. */
export function topoOrder(nodeIds: string[], edges: PlanEdge[]): string[] | null {
  const ids = new Set(nodeIds);
  const indeg = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const next = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  }
  const queue = nodeIds.filter((id) => indeg.get(id) === 0);
  const out: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    out.push(id);
    for (const to of next.get(id) ?? []) {
      const d = (indeg.get(to) ?? 0) - 1;
      indeg.set(to, d);
      if (d === 0) queue.push(to);
    }
  }
  return out.length === nodeIds.length ? out : null;
}

/** Direkte Vorgänger eines Knotens. */
export function predecessors(plan: PlanSpec, nodeId: string): PlanNode[] {
  const from = new Set(plan.edges.filter((e) => e.to === nodeId).map((e) => e.from));
  return plan.nodes.filter((n) => from.has(n.id));
}

/** Ein Knoten ist jetzt ausführbar, wenn er offen/fehlgeschlagen/eingereiht ist und alle Vorgänger fertig oder deaktiviert sind. */
export function isRunnable(plan: PlanSpec, nodeId: string): boolean {
  const node = plan.nodes.find((n) => n.id === nodeId);
  if (!node || (node.status !== 'open' && node.status !== 'failed' && node.status !== 'queued')) return false;
  return predecessors(plan, nodeId).every((p) => p.status === 'done' || p.status === 'disabled');
}

/**
 * Ein Knoten darf eingereiht werden (auch während etwas läuft): offen oder fehlgeschlagen, und jeder Vorgänger ist
 * fertig, deaktiviert oder selbst schon eingereiht bzw. in Arbeit (dann ist er zum Zeitpunkt der Ausführung fertig).
 */
export function isQueueable(plan: PlanSpec, nodeId: string): boolean {
  const node = plan.nodes.find((n) => n.id === nodeId);
  if (!node || (node.status !== 'open' && node.status !== 'failed')) return false;
  return predecessors(plan, nodeId).every((p) => p.status === 'done' || p.status === 'disabled' || p.status === 'queued' || p.status === 'running');
}

/** Alle noch auszuführenden Knoten in Abhängigkeitsreihenfolge (offen, fehlgeschlagen oder schon eingereiht). */
export function runOrder(plan: PlanSpec): string[] {
  const order = topoOrder(plan.nodes.map((n) => n.id), plan.edges) ?? [];
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  return order.filter((id) => {
    const s = byId.get(id)?.status;
    return s === 'open' || s === 'failed' || s === 'queued';
  });
}

/** Knoten, die „Alle ausführen“ neu einreihen würde (offen/fehlgeschlagen, noch nicht eingereiht). */
export function queueableOrder(plan: PlanSpec): string[] {
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  return runOrder(plan).filter((id) => byId.get(id)?.status !== 'queued');
}

/**
 * Bereinigt unbekannte Eingaben (aus Welt-Datei oder KI) zu gültigen Plänen (mit `resetTransient` werden queued/running zu open):
 * kürzt Texte, verwirft Unbrauchbares, Doppelte, Kanten ins Leere und Kanten, die einen Zyklus bilden.
 */
export function normalizePlans(raw: unknown, options: { resetTransient?: boolean } = {}): PlanSpec[] {
  if (!Array.isArray(raw)) return [];
  const plans: PlanSpec[] = [];
  for (const p of raw.slice(0, PLAN_LIMITS.plans)) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id) continue;
    const nodes: PlanNode[] = [];
    const seen = new Set<string>();
    for (const n of Array.isArray(p.nodes) ? p.nodes.slice(0, PLAN_LIMITS.nodes) : []) {
      if (!isObj(n) || typeof n.id !== 'string' || !n.id || seen.has(n.id)) continue;
      seen.add(n.id);
      const status = PLAN_STATUSES.includes(n.status as PlanStatus) ? (n.status as PlanStatus) : 'open';
      const node: PlanNode = {
        id: n.id.slice(0, 80),
        title: clipText(n.title, PLAN_LIMITS.title) || 'Knoten',
        notes: clipText(n.notes, PLAN_LIMITS.notes),
        // Mit resetTransient (beim Laden einer Welt) ist ein „laufender“ oder „eingereihter“ Knoten ein Überbleibsel: zurück auf offen.
        status: options.resetTransient && (status === 'running' || status === 'queued') ? 'open' : status,
        x: num(n.x, 0),
        y: num(n.y, 0),
      };
      if (isObj(n.result)) {
        node.result = {
          entityIds: (Array.isArray(n.result.entityIds) ? n.result.entityIds : []).filter((x): x is string => typeof x === 'string').slice(0, PLAN_LIMITS.resultEntities),
          summary: clipText(n.result.summary, PLAN_LIMITS.summary),
          ...(typeof n.result.group === 'string' ? { group: n.result.group.slice(0, 80) } : {}),
        };
      }
      nodes.push(node);
    }
    const ids = nodes.map((n) => n.id);
    const edges: PlanEdge[] = [];
    for (const e of Array.isArray(p.edges) ? p.edges.slice(0, PLAN_LIMITS.edges) : []) {
      if (!isObj(e) || typeof e.from !== 'string' || typeof e.to !== 'string' || e.from === e.to) continue;
      if (!seen.has(e.from) || !seen.has(e.to) || edges.some((x) => x.from === e.from && x.to === e.to)) continue;
      if (hasCycle(ids, [...edges, { from: e.from, to: e.to }])) continue;
      edges.push({ from: e.from, to: e.to });
    }
    plans.push({ id: p.id.slice(0, 80), title: clipText(p.title, PLAN_LIMITS.title) || 'Plan', nodes, edges });
  }
  return plans;
}

/** Kompakte Darstellung für die KI. `only` beschränkt auf einen Knoten (mit Vorgängern). */
export function compactPlan(plan: PlanSpec, only?: string): Record<string, unknown> {
  const nodes = only ? plan.nodes.filter((n) => n.id === only || predecessors(plan, only).some((p) => p.id === n.id)) : plan.nodes;
  return {
    plan: plan.id,
    titel: plan.title,
    knoten: nodes.map((n) => ({
      id: n.id,
      titel: n.title,
      status: n.status,
      ...(n.notes ? { notizen: n.notes } : {}),
      ...(n.result ? { ergebnis: { objekte: n.result.entityIds.length, gruppe: n.result.group, text: n.result.summary, ids: n.result.entityIds.slice(0, 40) } } : {}),
      nach: plan.edges.filter((e) => e.to === n.id).map((e) => e.from),
    })),
  };
}
