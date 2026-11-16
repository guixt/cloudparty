import { describe, expect, it } from 'vitest';
import { compactPlan, hasCycle, isRunnable, normalizePlans, PLAN_EXTENSION_KEY, PLAN_LIMITS, runOrder } from '../../../shared/plan';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { addEdge, addNode, createPlan, deletePlan, getPlan, listPlans, PlanError, removeNode, updateNode, type PlanCtx } from './api';

function setup(): PlanCtx & { events: string[] } {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const events: string[] = [];
  bus.on('plan.changed', ({ planId }) => events.push(planId));
  return { bus, store, events };
}

const house = [
  { id: 'a', title: 'Fundament' },
  { id: 'b', title: 'Wände', after: ['a'] },
  { id: 'c', title: 'Dach', after: ['b'] },
];

describe('Plan-Kern', () => {
  it('legt einen Plan mit Abhängigkeiten an und speichert ihn in der Welt', () => {
    const ctx = setup();
    const plan = createPlan(ctx, 'Haus', house);
    expect(plan.nodes.map((n) => n.title)).toEqual(['Fundament', 'Wände', 'Dach']);
    expect(plan.edges).toHaveLength(2);
    expect(new Set(plan.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(3); // nicht übereinander
    expect(ctx.store.getState().world.extensions?.[PLAN_EXTENSION_KEY]).toBeTruthy();
    expect(ctx.events).toEqual([plan.id]);
    expect(ctx.store.getState().toWorldSpec().extensions?.[PLAN_EXTENSION_KEY]).toHaveLength(1);
  });

  it('weist Kreise, unbekannte Verweise und leere Titel ab', () => {
    const ctx = setup();
    expect(() => createPlan(ctx, 'x', [{ id: 'a', title: 'A', after: ['b'] }, { id: 'b', title: 'B', after: ['a'] }])).toThrow(PlanError);
    expect(() => createPlan(ctx, 'x', [{ title: 'A', after: ['nix'] }])).toThrow(/unbekannte/);
    expect(() => createPlan(ctx, 'x', [{ title: '  ' }])).toThrow(/Titel/);
    expect(() => createPlan(ctx, 'x', [])).toThrow(/mindestens/);
    expect(listPlans(ctx)).toHaveLength(0);
  });

  it('begrenzt Pläne und Knoten', () => {
    const ctx = setup();
    for (let i = 0; i < PLAN_LIMITS.plans; i++) createPlan(ctx, `P${i}`, [{ title: 'k' }]);
    expect(() => createPlan(ctx, 'zu viel', [{ title: 'k' }])).toThrow(/Pläne/);
    const plan = listPlans(ctx)[0];
    for (let i = plan.nodes.length; i < PLAN_LIMITS.nodes; i++) addNode(ctx, plan.id, { title: `n${i}` });
    expect(() => addNode(ctx, plan.id, { title: 'zu viel' })).toThrow(/Knoten/);
  });

  it('Reihenfolge und Ausführbarkeit folgen den Abhängigkeiten', () => {
    const ctx = setup();
    const plan = createPlan(ctx, 'Haus', house);
    const [a, b, c] = plan.nodes;
    expect(runOrder(plan)).toEqual([a.id, b.id, c.id]);
    expect(isRunnable(plan, a.id)).toBe(true);
    expect(isRunnable(plan, b.id)).toBe(false);
    updateNode(ctx, plan.id, a.id, { status: 'done' });
    let p = getPlan(ctx, plan.id)!;
    expect(isRunnable(p, b.id)).toBe(true);
    updateNode(ctx, plan.id, b.id, { status: 'disabled' });
    p = getPlan(ctx, plan.id)!;
    expect(isRunnable(p, c.id)).toBe(true); // deaktivierte Vorgänger blockieren nicht
    expect(runOrder(p)).toEqual([c.id]);
  });

  it('Kanten: Kreise werden verhindert, Löschen räumt Kanten auf', () => {
    const ctx = setup();
    const plan = createPlan(ctx, 'Haus', house);
    const [a, b, c] = plan.nodes;
    expect(() => addEdge(ctx, plan.id, { from: c.id, to: a.id })).toThrow(/Kreis/);
    expect(() => addEdge(ctx, plan.id, { from: a.id, to: a.id })).toThrow(PlanError);
    removeNode(ctx, plan.id, b.id);
    const p = getPlan(ctx, plan.id)!;
    expect(p.nodes).toHaveLength(2);
    expect(p.edges).toHaveLength(0);
    expect(hasCycle(p.nodes.map((n) => n.id), p.edges)).toBe(false);
  });

  it('Ergebnis speichern und Plan löschen', () => {
    const ctx = setup();
    const plan = createPlan(ctx, 'Haus', house);
    updateNode(ctx, plan.id, plan.nodes[0].id, { status: 'done', result: { entityIds: ['e1', 'e2'], summary: 'Platte gebaut' } });
    expect(getPlan(ctx, plan.id)!.nodes[0].result?.entityIds).toEqual(['e1', 'e2']);
    deletePlan(ctx, plan.id);
    expect(listPlans(ctx)).toHaveLength(0);
    expect(ctx.store.getState().world.extensions?.[PLAN_EXTENSION_KEY]).toBeUndefined();
  });

  it('normalizePlans bereinigt kaputte Dateien', () => {
    const dirty = [
      {
        id: 'p',
        title: 'x'.repeat(500),
        nodes: [
          { id: 'a', title: 'A', status: 'running', notes: 'n'.repeat(5000), x: 'kaputt' },
          { id: 'a', title: 'doppelt' },
          { id: 'b', title: 'B', status: 'unsinn' },
          null,
        ],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'zz' }, { from: 'a', to: 'a' }],
      },
      { title: 'ohne id' },
    ];
    const [plan] = normalizePlans(dirty);
    expect(normalizePlans(dirty)).toHaveLength(1);
    expect(plan.title.length).toBe(PLAN_LIMITS.title);
    expect(plan.nodes.map((n) => [n.id, n.status])).toEqual([['a', 'open'], ['b', 'open']]);
    expect(plan.nodes[0].notes.length).toBe(PLAN_LIMITS.notes);
    expect(plan.nodes[0].x).toBe(0);
    expect(plan.edges).toEqual([{ from: 'a', to: 'b' }]);
    expect(normalizePlans('müll')).toEqual([]);
  });

  it('Kompaktform enthält Notizen, Ergebnisse und Vorgänger; Einzelknoten nur mit Vorgängern', () => {
    const ctx = setup();
    const plan = createPlan(ctx, 'Haus', [{ id: 'a', title: 'Fundament', notes: '10 x 8 m' }, { id: 'b', title: 'Wände', after: ['a'] }, { id: 'c', title: 'Garten' }]);
    updateNode(ctx, plan.id, plan.nodes[0].id, { status: 'done', result: { entityIds: ['e1'], summary: 'Platte' } });
    const full = compactPlan(getPlan(ctx, plan.id)!) as any;
    expect(full.knoten).toHaveLength(3);
    expect(full.knoten[0].notizen).toBe('10 x 8 m');
    expect(full.knoten[0].ergebnis.text).toBe('Platte');
    const one = compactPlan(getPlan(ctx, plan.id)!, plan.nodes[1].id) as any;
    expect(one.knoten.map((n: any) => n.titel)).toEqual(['Fundament', 'Wände']);
    expect(one.knoten[1].nach).toEqual([plan.nodes[0].id]);
  });
});
