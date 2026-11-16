/** Werkzeuge für das Plan-Board (plan_*). Titel und Notizen sind Nutzerinhalt = Daten. */
import { PLAN_LIMITS, compactPlan, type PlanSpec } from '../../../shared/plan';
import { PlanError, addNode, createPlan, getPlan, listPlans, removeNode, updateNode, type PlanCtx } from '../../plan/core/api';
import { fail, ok, str, ToolError, type Handler, type ToolContext } from './tools';
import { wrapData } from './summary';

function pctx(ctx: ToolContext): PlanCtx {
  return { store: ctx.store, bus: ctx.bus };
}

/** Plan-Fehler (deutsche Meldungen) werden zu Werkzeugfehlern. */
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof PlanError) throw new ToolError(error.message);
    throw error;
  }
}

function needPlan(ctx: ToolContext, id: unknown): PlanSpec {
  const planId = str(id, 'plan', 100);
  return getPlan(pctx(ctx), planId) ?? fail(`Den Plan „${planId.slice(0, 40)}“ gibt es nicht. Rufe plan_get ohne Argumente auf.`);
}
function needNode(plan: PlanSpec, id: unknown): string {
  const nodeId = str(id, 'node', 100);
  if (!plan.nodes.some((n) => n.id === nodeId)) fail(`Den Knoten „${nodeId.slice(0, 40)}“ gibt es in diesem Plan nicht.`);
  return nodeId;
}
function stringList(v: unknown, label: string, max: number): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return fail(`${label} muss eine Liste sein.`);
  return v.slice(0, max).map((x, i) => str(x, `${label}[${i}]`, 100));
}

function progress(plan: PlanSpec): string {
  const live = plan.nodes.filter((n) => n.status !== 'disabled');
  return `${live.filter((n) => n.status === 'done').length}/${live.length} fertig`;
}

export const planHandlers: Record<string, Handler> = {
  plan_create(input, ctx) {
    const title = str(input.title, 'title', PLAN_LIMITS.title);
    if (!Array.isArray(input.nodes)) fail('nodes muss eine Liste sein.');
    const nodes = (input.nodes as unknown[]).slice(0, PLAN_LIMITS.nodes).map((raw, i) => {
      if (typeof raw !== 'object' || raw === null) return fail(`nodes[${i}] ist ungültig.`);
      const n = raw as Record<string, unknown>;
      return {
        id: n.id === undefined ? undefined : str(n.id, `nodes[${i}].id`, 40),
        title: str(n.title, `nodes[${i}].title`, PLAN_LIMITS.title),
        notes: n.notes === undefined ? undefined : str(n.notes, `nodes[${i}].notes`, PLAN_LIMITS.notes, true),
        after: stringList(n.after, `nodes[${i}].after`, 20),
      };
    });
    const plan = guard(() => createPlan(pctx(ctx), title, nodes));
    ctx.bus.emit('ui.openPlan', { planId: plan.id });
    const ids = plan.nodes.map((n, i) => `${nodes[i].id ?? i + 1} = ${n.id}`).join('; ');
    return ok(`Plan angelegt: plan="${plan.id}". Knoten-ids: ${ids}. Es wurde noch nichts gebaut.`, `Plan „${plan.title}“ mit ${plan.nodes.length} Knoten angelegt`, true);
  },

  plan_get(input, ctx) {
    if (input.plan === undefined) {
      const plans = listPlans(pctx(ctx)).map((p) => ({ id: p.id, titel: p.title, knoten: p.nodes.length, fortschritt: progress(p) }));
      return ok(wrapData(JSON.stringify({ plaene: plans })), `Pläne gelesen (${plans.length})`, false);
    }
    const plan = needPlan(ctx, input.plan);
    const only = input.node === undefined ? undefined : needNode(plan, input.node);
    return ok(wrapData(JSON.stringify(compactPlan(plan, only))), only ? 'Knoten gelesen' : `Plan „${plan.title}“ gelesen`, false);
  },

  plan_update_node(input, ctx) {
    const plan = needPlan(ctx, input.plan);
    const node = needNode(plan, input.node);
    const patch: Parameters<typeof updateNode>[3] = {};
    if (input.title !== undefined) patch.title = str(input.title, 'title', PLAN_LIMITS.title);
    if (input.notes !== undefined) patch.notes = str(input.notes, 'notes', PLAN_LIMITS.notes, true);
    if (input.status !== undefined) {
      if (input.status !== 'open' && input.status !== 'failed' && input.status !== 'disabled') fail('status muss open, failed oder disabled sein (fertig meldest du mit plan_complete_node).');
      patch.status = input.status as 'open' | 'failed' | 'disabled';
    }
    guard(() => updateNode(pctx(ctx), plan.id, node, patch));
    return ok('Knoten geändert.', 'Knoten geändert', true);
  },

  plan_add_node(input, ctx) {
    const plan = needPlan(ctx, input.plan);
    const afterIds = stringList(input.after, 'after', 20).map((id) => needNode(plan, id));
    const created = guard(() =>
      addNode(pctx(ctx), plan.id, {
        title: str(input.title, 'title', PLAN_LIMITS.title),
        notes: input.notes === undefined ? undefined : str(input.notes, 'notes', PLAN_LIMITS.notes, true),
        afterIds,
      }),
    );
    return ok(`Knoten angelegt: node="${created.id}".`, `Knoten „${created.title}“ hinzugefügt`, true);
  },

  plan_remove_node(input, ctx) {
    const plan = needPlan(ctx, input.plan);
    const node = needNode(plan, input.node);
    guard(() => removeNode(pctx(ctx), plan.id, node));
    return ok('Knoten entfernt.', 'Knoten entfernt', true);
  },

  plan_complete_node(input, ctx) {
    const plan = needPlan(ctx, input.plan);
    const node = needNode(plan, input.node);
    // Zu lange Zusammenfassungen kürzen statt ablehnen (spart eine Runde).
    const rawSummary = str(input.summary, 'summary', 5000, true);
    const summary = rawSummary.length > PLAN_LIMITS.summary ? `${rawSummary.slice(0, PLAN_LIMITS.summary - 1)}…` : rawSummary;
    if (summary.trim() === '') fail('summary darf nicht leer sein.');
    const wanted = stringList(input.entity_ids, 'entity_ids', PLAN_LIMITS.resultEntities * 4);
    const { entities, order } = ctx.store.getState();
    const ids: string[] = [];
    let dropped = 0;
    for (const id of wanted) {
      if (entities[id]) ids.push(id);
      else {
        const members = order.filter((eid) => entities[eid]?.group === id);
        if (members.length > 0) ids.push(...members);
        else dropped += 1;
      }
    }
    // Keine (gültigen) ids genannt: nimm, was in diesem Auftrag neu entstanden ist.
    let fromRun = false;
    if (ids.length === 0 && ctx.createdSince) {
      ids.push(...ctx.createdSince());
      fromRun = ids.length > 0;
    }
    const entityIds = [...new Set(ids)].slice(0, PLAN_LIMITS.resultEntities);
    let group = input.group === undefined ? undefined : str(input.group, 'group', 100);
    if (!group) {
      const groups = new Set(entityIds.map((id) => entities[id]?.group));
      if (groups.size === 1) group = [...groups][0];
    }
    guard(() => updateNode(pctx(ctx), plan.id, node, { status: 'done', result: { entityIds, summary, ...(group ? { group } : {}) } }));
    const note = (dropped > 0 ? ` (${dropped} unbekannte ids ignoriert)` : '') + (fromRun ? ' (die in diesem Auftrag neu gebauten Objekte wurden automatisch zugeordnet)' : '');
    return ok(`Knoten als fertig gespeichert mit ${entityIds.length} Objekten${note}.`, `Knoten fertig (${entityIds.length} Objekte)`, true);
  },
};
