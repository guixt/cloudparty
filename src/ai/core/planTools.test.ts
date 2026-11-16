import { describe, expect, it } from 'vitest';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { listPlans } from '../../plan/core/api';
import { buildSystemPrompt } from './prompt';
import { executeTool, type RunCounters, type ToolContext } from './tools';

function setup(canBuild = true) {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().setCanBuild(canBuild);
  const opened: (string | undefined)[] = [];
  bus.on('ui.openPlan', ({ planId }) => opened.push(planId));
  const ctx: ToolContext = { store, bus, getAvatar: () => null, confirm: async () => true };
  const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  const run = (name: string, input: unknown) => executeTool(name, input, ctx, counters);
  return { store, bus, ctx, run, opened };
}

const house = {
  title: 'Haus',
  nodes: [
    { id: 'f', title: 'Fundament', notes: '10 x 8 m' },
    { id: 'w', title: 'Wände', after: ['f'] },
  ],
};

describe('Plan-Werkzeuge', () => {
  it('plan_create legt den Plan an, öffnet das Fenster und nennt die Knoten-ids', async () => {
    const t = setup();
    const r = await t.run('plan_create', house);
    expect(r.ok).toBe(true);
    const [plan] = listPlans(t.ctx);
    expect(plan.nodes).toHaveLength(2);
    expect(r.content).toContain(plan.id);
    expect(r.content).toContain(plan.nodes[1].id);
    expect(t.opened).toEqual([plan.id]);
  });

  it('plan_get: Übersicht, ganzer Plan, einzelner Knoten – alles als Daten umrahmt', async () => {
    const t = setup();
    await t.run('plan_create', house);
    const [plan] = listPlans(t.ctx);
    const list = await t.run('plan_get', {});
    expect(list.content).toContain('welt_daten');
    expect(list.content).toContain('0/2 fertig');
    const one = await t.run('plan_get', { plan: plan.id, node: plan.nodes[1].id });
    expect(one.content).toContain('Fundament');
    expect(one.content).toContain('Wände');
    expect((await t.run('plan_get', { plan: 'nix' })).ok).toBe(false);
    expect((await t.run('plan_get', { plan: plan.id, node: 'nix' })).ok).toBe(false);
  });

  it('plan_complete_node verknüpft nur vorhandene Objekte und setzt den Status', async () => {
    const t = setup();
    await t.run('plan_create', house);
    const [plan] = listPlans(t.ctx);
    const add = await t.run('add_entity', { ref: 'EntitySpec.box', position: [0, 0.5, 0] });
    const id = /id="([^"]+)"/.exec(add.content)?.[1] ?? Object.keys(t.store.getState().entities).at(-1)!;
    const r = await t.run('plan_complete_node', { plan: plan.id, node: plan.nodes[0].id, summary: 'Platte 10 x 8', entity_ids: [id, 'gibt-es-nicht'] });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('1 unbekannte');
    const done = listPlans(t.ctx)[0].nodes[0];
    expect(done.status).toBe('done');
    expect(done.result?.entityIds).toEqual([id]);
  });

  it('plan_complete_node: Gruppen-id wird aufgelöst, leere Liste nimmt neue Objekte, lange Summary wird gekürzt', async () => {
    const t = setup();
    await t.run('plan_create', house);
    const [plan] = listPlans(t.ctx);
    const startIds = new Set(t.store.getState().order);
    t.ctx.createdSince = () => t.store.getState().order.filter((i) => !startIds.has(i));
    const w = await t.run('add_wall', { from: [0, 0], to: [6, 0], height: 3, openings: [{ at: 2, width: 1, height: 2 }] });
    const group = /group="(grp_[^"]+)"/.exec(w.content)![1];
    const members = t.store.getState().order.filter((i) => t.store.getState().entities[i].group === group);
    const a = await t.run('plan_complete_node', { plan: plan.id, node: plan.nodes[0].id, summary: 'x'.repeat(900), entity_ids: [group] });
    expect(a.ok).toBe(true);
    const n0 = listPlans(t.ctx)[0].nodes[0];
    expect([...(n0.result?.entityIds ?? [])].sort()).toEqual([...members].sort());
    expect(n0.result?.summary.length).toBeLessThanOrEqual(400);
    expect(n0.result?.group).toBe(group);
    const b = await t.run('plan_complete_node', { plan: plan.id, node: plan.nodes[1].id, summary: 'ohne ids' });
    expect(b.ok).toBe(true);
    expect(listPlans(t.ctx)[0].nodes[1].result?.entityIds.length).toBe(members.length);
  });

  it('plan_update_node verbietet „done“ und „running“, erlaubt open/failed/disabled', async () => {
    const t = setup();
    await t.run('plan_create', house);
    const [plan] = listPlans(t.ctx);
    const node = plan.nodes[0].id;
    expect((await t.run('plan_update_node', { plan: plan.id, node, status: 'done' })).ok).toBe(false);
    expect((await t.run('plan_update_node', { plan: plan.id, node, status: 'running' })).ok).toBe(false);
    expect((await t.run('plan_update_node', { plan: plan.id, node, status: 'disabled', title: 'Neu' })).ok).toBe(true);
    expect(listPlans(t.ctx)[0].nodes[0]).toMatchObject({ status: 'disabled', title: 'Neu' });
  });

  it('plan_add_node und plan_remove_node, Kreise werden gemeldet', async () => {
    const t = setup();
    await t.run('plan_create', house);
    const [plan] = listPlans(t.ctx);
    const add = await t.run('plan_add_node', { plan: plan.id, title: 'Dach', after: [plan.nodes[1].id] });
    expect(add.ok).toBe(true);
    expect(listPlans(t.ctx)[0].nodes).toHaveLength(3);
    expect((await t.run('plan_add_node', { plan: plan.id, title: 'X', after: ['nix'] })).ok).toBe(false);
    const cyc = await t.run('plan_create', { title: 'K', nodes: [{ id: 'a', title: 'A', after: ['b'] }, { id: 'b', title: 'B', after: ['a'] }] });
    expect(cyc.ok).toBe(false);
    expect(cyc.content).toContain('Kreis');
    expect((await t.run('plan_remove_node', { plan: plan.id, node: plan.nodes[0].id })).ok).toBe(true);
    expect(listPlans(t.ctx)[0].nodes).toHaveLength(2);
  });

  it('ohne Baurecht ändern Plan-Werkzeuge nichts, lesen geht', async () => {
    const t = setup(false);
    const r = await t.run('plan_create', house);
    expect(r.ok).toBe(false);
    expect(listPlans(t.ctx)).toHaveLength(0);
    expect((await t.run('plan_get', {})).ok).toBe(true);
  });

  it('ungültige Argumente werden abgewiesen, der Systemprompt kennt den Plan-Ablauf', async () => {
    const t = setup();
    expect((await t.run('plan_create', { title: 'x', nodes: 'kaputt' })).ok).toBe(false);
    expect((await t.run('plan_create', { title: 'x', nodes: [{ title: 5 }] })).ok).toBe(false);
    expect((await t.run('plan_complete_node', { plan: 'a', node: 'b' })).ok).toBe(false);
    expect(buildSystemPrompt(t.store.getState())).toContain('plan_create');
  });
});

describe('Plan: eigene Kennungen und aktuelle Gruppen', () => {
  it('plan_add_node(after=["n07"]) findet Knoten über key, Nummer oder Titel; Fehler nennt die Liste', async () => {
    const t = setup();
    await t.run('plan_create', { title: 'T', nodes: [{ id: 'n01', title: '1 Start' }, { id: 'n02', title: '2 Boden', after: ['n01'] }] });
    const [plan] = listPlans(t.ctx);
    const a = await t.run('plan_add_node', { plan: plan.id, title: '3 Wände', key: 'n03', after: ['n02'] });
    expect(a.ok).toBe(true);
    const b = await t.run('plan_add_node', { plan: plan.id, title: '4 Dach', after: ['n03'] }); // über key
    expect(b.ok).toBe(true);
    const c = await t.run('plan_add_node', { plan: plan.id, title: '5 Tür', after: ['4'] }); // über Nummer im Titel
    expect(c.ok).toBe(true);
    const bad = await t.run('plan_add_node', { plan: plan.id, title: 'x', after: ['n99'] });
    expect(bad.ok).toBe(false);
    expect(bad.content).toContain('Vorhandene Knoten');
    expect(listPlans(t.ctx)[0].nodes).toHaveLength(5);
  });
  it('plan_get zeigt die aktuelle Gruppen-id, auch nach group_entities', async () => {
    const t = setup();
    await t.run('plan_create', { title: 'T', nodes: [{ id: 'a', title: 'A' }] });
    const [plan] = listPlans(t.ctx);
    const w = await t.run('add_wall', { from: [0, 0], to: [6, 0], height: 3, name: 'Q', openings: [{ at: 2, width: 1, height: 2 }] });
    const oldGroup = /group="(grp_[^"]+)"/.exec(w.content)![1];
    const ids = t.store.getState().order.filter((i) => t.store.getState().entities[i].group === oldGroup);
    await t.run('plan_complete_node', { plan: plan.id, node: plan.nodes[0].id, summary: 's', entity_ids: ids, group: oldGroup });
    await t.run('group_entities', { ids, name: 'Neu' });
    const got = await t.run('plan_get', { plan: plan.id });
    const newGroup = t.store.getState().entities[ids[0]].group!;
    expect(newGroup).not.toBe(oldGroup);
    expect(got.content).toContain(newGroup);
    expect(got.content).not.toContain(oldGroup);
  });
});
