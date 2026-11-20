/** Werkzeuge für das Plan-Board (plan_*). Titel und Notizen sind Nutzerinhalt = Daten. */
import { PLAN_LIMITS, compactPlan, type PlanSpec } from '../../../shared/plan';
import { PlanError, addEdge, addNode, createPlan, deletePlan, getPlan, listPlans, removeEdge, removeNode, renamePlan, updateNode, type PlanCtx } from '../../plan/core/api';
import { fail, ok, str, ToolError, type Handler, type ToolContext } from './tools';
import { registerHandlers } from './registry';
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
/** Knoten über echte id, eigene Kennung (`key`) oder Titel-Anfang („8“, „n08“ ↔ „8 Hauswand …“); sonst Fehler mit der Knotenliste. */
function needNode(plan: PlanSpec, id: unknown): string {
  const nodeId = str(id, 'node', 100).trim();
  const exact = plan.nodes.find((n) => n.id === nodeId) ?? plan.nodes.find((n) => n.key === nodeId);
  if (exact) return exact.id;
  const digits = /^n?0*(\d+)$/i.exec(nodeId)?.[1];
  if (digits) {
    const byTitle = plan.nodes.filter((n) => new RegExp(`^0*${digits}(\\D|$)`).test(n.title.trim()));
    if (byTitle.length === 1) return byTitle[0].id;
  }
  const list = plan.nodes.slice(0, 30).map((n) => `${n.id}${n.key ? ` (${n.key})` : ''} = ${n.title.slice(0, 40)}`).join('; ');
  return fail(`Den Knoten „${nodeId.slice(0, 40)}“ gibt es in diesem Plan nicht. Vorhandene Knoten: ${list}.`);
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

/** Knoten ohne jede Verbindung in einem Plan mit mehreren Knoten: Hinweis, dass plan_connect sie verbinden kann. */
function isolatedHint(plan: PlanSpec): string {
  if (plan.nodes.length < 2) return '';
  const linked = new Set(plan.edges.flatMap((e) => [e.from, e.to]));
  const alone = plan.nodes.filter((n) => !linked.has(n.id) && n.status !== 'disabled');
  if (alone.length === 0 || alone.length === plan.nodes.length && plan.nodes.length < 3) return '';
  return `\nHinweis: ${alone.length} Knoten haben keine Verbindungen (${alone.slice(0, 8).map((n) => n.key ?? n.id).join(', ')}). Mit plan_connect (edges oder chain) setzt du die Reihenfolge nachträglich, ohne Knoten neu anzulegen.`;
}

function edgeList(v: unknown, plan: PlanSpec): Array<{ from: string; to: string }> {
  if (!Array.isArray(v) || v.length === 0) return fail('edges muss eine nicht leere Liste aus { from, to } sein.');
  if (v.length > 100) return fail('Höchstens 100 Verbindungen pro Aufruf.');
  return v.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`edges[${i}] ist ungültig.`);
    const e = raw as Record<string, unknown>;
    return { from: needNode(plan, e.from), to: needNode(plan, e.to) };
  });
}

export const planHandlers: Record<string, Handler> = registerHandlers({
  plan_connect(input, ctx) {
    const plan = needPlan(ctx, input.plan);
    const remove = input.remove === true;
    let edges: Array<{ from: string; to: string }> = [];
    if (input.chain !== undefined) {
      const chain = stringList(input.chain, 'chain', 120).map((id) => needNode(plan, id));
      if (chain.length < 2) fail('chain braucht mindestens 2 Knoten (in Ausführungsreihenfolge).');
      edges = chain.slice(1).map((to, i) => ({ from: chain[i], to }));
    }
    if (input.edges !== undefined) edges = edges.concat(edgeList(input.edges, plan));
    if (edges.length === 0) fail('Gib chain (Knoten in Reihenfolge) oder edges ([{ from, to }]) an. „from → to“ heißt: to hängt von from ab.');
    let changed = 0;
    for (const e of edges) {
      const before = getPlan(pctx(ctx), plan.id)?.edges.length ?? 0;
      guard(() => (remove ? removeEdge(pctx(ctx), plan.id, e) : addEdge(pctx(ctx), plan.id, e)));
      if ((getPlan(pctx(ctx), plan.id)?.edges.length ?? 0) !== before) changed += 1;
    }
    return ok(`${remove ? 'Entfernt' : 'Verbunden'}: ${changed} von ${edges.length} Verbindungen (${remove ? 'gab es nicht mehr' : 'schon vorhanden'}: ${edges.length - changed}).`, `${changed} Verbindung${changed === 1 ? '' : 'en'} ${remove ? 'entfernt' : 'gesetzt'}`, changed > 0);
  },

  async plan_edit(input, ctx) {
    const plan = needPlan(ctx, input.plan);
    if (input.delete === true) {
      if (!ctx.autoApprove && !(await ctx.confirm(`Die KI möchte den Plan „${plan.title}“ mit ${plan.nodes.length} Knoten löschen (gebaute Objekte bleiben stehen). Erlauben?`))) fail('Nutzer hat abgelehnt');
      guard(() => deletePlan(pctx(ctx), plan.id));
      return ok('Plan gelöscht.', `Plan „${plan.title}“ gelöscht`, true);
    }
    if (input.title === undefined) fail('Gib title (umbenennen) oder delete: true an.');
    guard(() => renamePlan(pctx(ctx), plan.id, str(input.title, 'title', PLAN_LIMITS.title)));
    return ok('Plan umbenannt.', 'Plan umbenannt', true);
  },

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
    // Gruppen-ids aus alten Ergebnissen können veraltet sein (group_entities vergibt neue): aktuelle aus den Objekten ableiten.
    const compact = compactPlan(plan, only) as { knoten: { ergebnis?: { gruppe?: string; ids: string[]; objekte: number } }[] };
    const { entities } = ctx.store.getState();
    for (const k of compact.knoten) {
      if (!k.ergebnis) continue;
      const alive = k.ergebnis.ids.map((i) => entities[i]).filter((e) => !!e);
      const groups = new Set(alive.map((e) => e.group));
      k.ergebnis.gruppe = groups.size === 1 ? ([...groups][0] ?? undefined) : undefined;
      k.ergebnis.ids = alive.map((e) => e.id);
    }
    const hint = only ? '' : isolatedHint(plan);
    return ok(wrapData(JSON.stringify(compact)) + hint, only ? 'Knoten gelesen' : `Plan „${plan.title}“ gelesen`, false);
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
        ...(input.key === undefined ? {} : { key: str(input.key, 'key', 40) }),
        afterIds,
      }),
    );
    const beforeIds = stringList(input.before, 'before', 20).map((id) => needNode(plan, id));
    for (const to of beforeIds) guard(() => addEdge(pctx(ctx), plan.id, { from: created.id, to }));
    return ok(`Knoten angelegt: node="${created.id}"${created.key ? ` (key ${created.key})` : ''}${beforeIds.length ? `, davor eingefügt vor ${beforeIds.length} Knoten` : ''}.`, `Knoten „${created.title}“ hinzugefügt`, true);
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
});
