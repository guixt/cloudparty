/**
 * Plan-Kern: alle Änderungen an Plänen laufen über diese Funktionen (Editor, KI-Werkzeuge, Ausführung).
 * Sie lesen und schreiben `world.extensions['cloudparty.plans']` im WorldStore und melden `plan.changed`.
 * Alle Funktionen werfen `PlanError` mit deutscher Meldung bei ungültigen Eingaben.
 */
import { PLAN_EXTENSION_KEY, PLAN_LIMITS, hasCycle, normalizePlans, type PlanEdge, type PlanNode, type PlanResult, type PlanSpec, type PlanStatus } from '../../../shared/plan';
import { newEntityId } from '../../../shared/types';
import type { EventBus } from '../../core/events';
import type { WorldStore } from '../../core/store';

export class PlanError extends Error {}

export interface PlanCtx {
  store: WorldStore;
  bus: EventBus;
}

export interface NodeInput {
  /** Eigene Kennung (nur zum Verknüpfen innerhalb eines Aufrufs); fehlt sie, wird eine vergeben. */
  id?: string;
  title: string;
  notes?: string;
  /** Kennungen der Knoten, von denen dieser abhängt. */
  after?: string[];
}

export function listPlans(ctx: PlanCtx): PlanSpec[] {
  return normalizePlans(ctx.store.getState().world.extensions?.[PLAN_EXTENSION_KEY]);
}

/** Setzt flüchtige Status (queued, running) auf open – nach dem Laden einer Welt, wenn nichts mehr läuft. */
export function resetTransientStatuses(ctx: PlanCtx): void {
  const raw = ctx.store.getState().world.extensions?.[PLAN_EXTENSION_KEY];
  const reset = normalizePlans(raw, { resetTransient: true });
  if (JSON.stringify(reset) === JSON.stringify(normalizePlans(raw))) return;
  save(ctx, reset, '');
}

export function getPlan(ctx: PlanCtx, planId: string): PlanSpec | undefined {
  return listPlans(ctx).find((p) => p.id === planId);
}

function save(ctx: PlanCtx, plans: PlanSpec[], changed: string): void {
  ctx.store.getState().setExtension(PLAN_EXTENSION_KEY, plans.length > 0 ? plans : undefined);
  ctx.bus.emit('plan.changed', { planId: changed });
}

function mutate<T>(ctx: PlanCtx, planId: string, fn: (plan: PlanSpec) => T): T {
  const plans = listPlans(ctx);
  const plan = plans.find((p) => p.id === planId);
  if (!plan) throw new PlanError('Diesen Plan gibt es nicht.');
  const result = fn(plan);
  save(ctx, plans, planId);
  return result;
}

function node(plan: PlanSpec, nodeId: string): PlanNode {
  const n = plan.nodes.find((x) => x.id === nodeId);
  if (!n) throw new PlanError(`Knoten „${nodeId}“ gibt es nicht.`);
  return n;
}

function checkTitle(title: unknown): string {
  if (typeof title !== 'string' || !title.trim()) throw new PlanError('Der Titel darf nicht leer sein.');
  if (title.length > PLAN_LIMITS.title) throw new PlanError(`Der Titel ist zu lang (max. ${PLAN_LIMITS.title} Zeichen).`);
  return title.trim();
}
function checkNotes(notes: unknown): string {
  if (notes === undefined) return '';
  if (typeof notes !== 'string') throw new PlanError('Notizen müssen Text sein.');
  if (notes.length > PLAN_LIMITS.notes) throw new PlanError(`Die Notizen sind zu lang (max. ${PLAN_LIMITS.notes} Zeichen).`);
  return notes;
}

/** Einfache Spaltenanordnung nach Abhängigkeitstiefe, damit neue Knoten nicht übereinander liegen. */
export function layoutPlan(plan: PlanSpec): void {
  const depth = new Map<string, number>();
  const visit = (id: string): number => {
    if (depth.has(id)) return depth.get(id) as number;
    depth.set(id, 0);
    const d = Math.max(-1, ...plan.edges.filter((e) => e.to === id).map((e) => visit(e.from))) + 1;
    depth.set(id, d);
    return d;
  };
  const rows = new Map<number, number>();
  for (const n of plan.nodes) {
    const col = visit(n.id);
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    n.x = 40 + col * 260;
    n.y = 40 + row * 130;
  }
}

/** Legt einen Plan mit Knoten an; `after` verweist auf `id`s im selben Aufruf. */
export function createPlan(ctx: PlanCtx, title: string, inputs: NodeInput[]): PlanSpec {
  const plans = listPlans(ctx);
  if (plans.length >= PLAN_LIMITS.plans) throw new PlanError(`Es gibt schon ${PLAN_LIMITS.plans} Pläne. Lösche zuerst einen.`);
  if (!Array.isArray(inputs) || inputs.length === 0) throw new PlanError('Ein Plan braucht mindestens einen Knoten.');
  if (inputs.length > PLAN_LIMITS.nodes) throw new PlanError(`Zu viele Knoten (max. ${PLAN_LIMITS.nodes}).`);
  const plan: PlanSpec = { id: newEntityId('plan'), title: checkTitle(title), nodes: [], edges: [] };
  const names = new Map<string, string>();
  for (const input of inputs) {
    const id = newEntityId('pk');
    if (input.id) {
      if (names.has(input.id)) throw new PlanError(`Die Kennung „${input.id}“ kommt doppelt vor.`);
      names.set(input.id, id);
    }
    plan.nodes.push({ id, title: checkTitle(input.title), notes: checkNotes(input.notes), status: 'open', x: 0, y: 0 });
  }
  inputs.forEach((input, i) => {
    for (const ref of input.after ?? []) {
      const from = names.get(ref);
      if (!from) throw new PlanError(`„after“ verweist auf unbekannte Kennung „${ref}“.`);
      const edge = { from, to: plan.nodes[i].id };
      if (hasCycle(plan.nodes.map((n) => n.id), [...plan.edges, edge])) throw new PlanError('Die Abhängigkeiten bilden einen Kreis.');
      if (!plan.edges.some((e) => e.from === edge.from && e.to === edge.to)) plan.edges.push(edge);
    }
  });
  layoutPlan(plan);
  plans.push(plan);
  save(ctx, plans, plan.id);
  return plan;
}

export function renamePlan(ctx: PlanCtx, planId: string, title: string): void {
  mutate(ctx, planId, (p) => {
    p.title = checkTitle(title);
  });
}

export function deletePlan(ctx: PlanCtx, planId: string): void {
  const plans = listPlans(ctx);
  if (!plans.some((p) => p.id === planId)) throw new PlanError('Diesen Plan gibt es nicht.');
  save(ctx, plans.filter((p) => p.id !== planId), planId);
}

export function addNode(ctx: PlanCtx, planId: string, input: Omit<NodeInput, 'id'> & { afterIds?: string[]; x?: number; y?: number }): PlanNode {
  return mutate(ctx, planId, (plan) => {
    if (plan.nodes.length >= PLAN_LIMITS.nodes) throw new PlanError(`Zu viele Knoten (max. ${PLAN_LIMITS.nodes}).`);
    const n: PlanNode = { id: newEntityId('pk'), title: checkTitle(input.title), notes: checkNotes(input.notes), status: 'open', x: input.x ?? 0, y: input.y ?? 0 };
    for (const from of input.afterIds ?? []) node(plan, from);
    plan.nodes.push(n);
    for (const from of input.afterIds ?? []) plan.edges.push({ from, to: n.id });
    if (input.x === undefined && input.y === undefined) layoutPlan(plan);
    return n;
  });
}

export interface NodePatch {
  title?: string;
  notes?: string;
  status?: PlanStatus;
  x?: number;
  y?: number;
  result?: PlanResult | null;
}

export function updateNode(ctx: PlanCtx, planId: string, nodeId: string, patch: NodePatch): PlanNode {
  return mutate(ctx, planId, (plan) => {
    const n = node(plan, nodeId);
    if (patch.title !== undefined) n.title = checkTitle(patch.title);
    if (patch.notes !== undefined) n.notes = checkNotes(patch.notes);
    if (patch.status !== undefined) n.status = patch.status;
    if (patch.x !== undefined && Number.isFinite(patch.x)) n.x = patch.x;
    if (patch.y !== undefined && Number.isFinite(patch.y)) n.y = patch.y;
    if (patch.result === null) delete n.result;
    else if (patch.result) n.result = patch.result;
    return n;
  });
}

export function removeNode(ctx: PlanCtx, planId: string, nodeId: string): void {
  mutate(ctx, planId, (plan) => {
    node(plan, nodeId);
    plan.nodes = plan.nodes.filter((n) => n.id !== nodeId);
    plan.edges = plan.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
  });
}

export function addEdge(ctx: PlanCtx, planId: string, edge: PlanEdge): void {
  mutate(ctx, planId, (plan) => {
    node(plan, edge.from);
    node(plan, edge.to);
    if (edge.from === edge.to) throw new PlanError('Ein Knoten kann nicht von sich selbst abhängen.');
    if (plan.edges.some((e) => e.from === edge.from && e.to === edge.to)) return;
    if (plan.edges.length >= PLAN_LIMITS.edges) throw new PlanError('Zu viele Verbindungen.');
    if (hasCycle(plan.nodes.map((n) => n.id), [...plan.edges, edge])) throw new PlanError('Diese Verbindung würde einen Kreis bilden.');
    plan.edges.push({ from: edge.from, to: edge.to });
  });
}

export function removeEdge(ctx: PlanCtx, planId: string, edge: PlanEdge): void {
  mutate(ctx, planId, (plan) => {
    plan.edges = plan.edges.filter((e) => !(e.from === edge.from && e.to === edge.to));
  });
}
