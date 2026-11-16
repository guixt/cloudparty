import { describe, expect, it } from 'vitest';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { createPlan, getPlan, updateNode, type PlanCtx } from '../core/api';
import { createRunQueue } from './queue';
import type { PromptResult, RunDeps } from './runner';

function setup() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const ctx: PlanCtx = { bus, store };
  const toasts: string[] = [];
  const order: string[] = [];
  /** Gesteuerte „KI“: jeder Auftrag wartet, bis release(label) aufgerufen wird (oder läuft sofort durch). */
  const gates = new Map<string, () => void>();
  let hold = false;
  const deps: RunDeps = {
    runPrompt: async (prompt, hooks) => {
      const nodeId = /node="([^"]+)"/.exec(prompt)![1];
      const plan = [...[store.getState().world.extensions?.['cloudparty.plans'] as { id: string; nodes: { id: string; title: string }[] }[]][0]][0];
      const title = plan.nodes.find((n) => n.id === nodeId)!.title;
      if (hold) await new Promise<void>((r) => gates.set(title, r));
      hooks.beforeRun();
      order.push(title);
      updateNode(ctx, plan.id, nodeId, { status: 'done', result: { entityIds: [], summary: 'ok' } });
      return 'ok' as PromptResult;
    },
    resetContext: () => {},
    lastRunTokens: () => 10,
    notify: (t) => toasts.push(t),
  };
  const queue = createRunQueue(ctx, () => deps, (t) => toasts.push(t));
  return { ctx, queue, toasts, order, gates, setHold: (v: boolean) => (hold = v) };
}

const house = [
  { id: 'a', title: 'Fundament' },
  { id: 'b', title: 'Wände', after: ['a'] },
  { id: 'c', title: 'Dach', after: ['b'] },
  { id: 'd', title: 'Garten' },
];

describe('Einreihen von Plan-Läufen', () => {
  it('Knoten werden sofort als „queued“ markiert und laufen nacheinander, auch wenn noch etwas arbeitet', async () => {
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', house);
    const [a, b, c, d] = plan.nodes;
    t.setHold(true);
    t.queue.request({ planId: plan.id, nodeId: a.id }); // läuft an und wartet auf die „KI“
    t.queue.request({ planId: plan.id, nodeId: b.id }); // Vorgänger a ist eingereiht → erlaubt
    t.queue.request({ planId: plan.id, nodeId: d.id });
    await Promise.resolve();
    const status = () => getPlan(t.ctx, plan.id)!.nodes.map((n) => n.status);
    expect(status()).toEqual(['queued', 'queued', 'open', 'queued']);
    expect(t.queue.pending()).toBeGreaterThanOrEqual(2);
    expect(t.toasts.some((x) => /eingereiht/.test(x))).toBe(true);

    t.setHold(false);
    t.gates.get('Fundament')?.();
    await t.queue.idle();
    expect(t.order).toEqual(['Fundament', 'Wände', 'Garten']);
    expect(status()).toEqual(['done', 'done', 'open', 'done']);
    expect(c.id).toBeTruthy();
  });

  it('„Alle ausführen“ reiht alle offenen Knoten ein; ein zweites Mal bringt nichts Neues', async () => {
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', house);
    t.setHold(true);
    t.queue.request({ planId: plan.id });
    await Promise.resolve();
    expect(getPlan(t.ctx, plan.id)!.nodes.every((n) => n.status === 'queued')).toBe(true);
    const before = t.queue.pending();
    t.queue.request({ planId: plan.id });
    expect(t.queue.pending()).toBe(before);
    expect(t.toasts.at(-1)).toMatch(/nichts einzureihen/i);
    t.setHold(false);
    t.gates.get('Fundament')?.();
    await t.queue.idle();
    expect(t.order).toEqual(['Fundament', 'Garten', 'Wände', 'Dach']); // Abhängigkeitsreihenfolge
    expect(getPlan(t.ctx, plan.id)!.nodes.every((n) => n.status === 'done')).toBe(true);
  });

  it('blockierte Anfragen werden abgelehnt und ändern nichts', () => {
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', house);
    t.queue.request({ planId: plan.id, nodeId: plan.nodes[1].id }); // Vorgänger a weder fertig noch eingereiht
    expect(t.toasts.at(-1)).toMatch(/Vorgänger/);
    expect(getPlan(t.ctx, plan.id)!.nodes.every((n) => n.status === 'open')).toBe(true);
    t.queue.request({ planId: 'nix' });
    expect(t.toasts.at(-1)).toMatch(/nicht mehr/);
    t.ctx.store.getState().setCanBuild(false);
    t.queue.request({ planId: plan.id });
    expect(t.toasts.at(-1)).toMatch(/Baurecht/);
  });

  it('keine KI verfügbar: Knoten werden wieder freigegeben', async () => {
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', house);
    const toasts: string[] = [];
    const q = createRunQueue(t.ctx, () => null, (x) => toasts.push(x));
    q.request({ planId: plan.id, nodeId: plan.nodes[0].id });
    await q.idle();
    expect(toasts.at(-1)).toMatch(/nicht verfügbar/);
    expect(getPlan(t.ctx, plan.id)!.nodes[0].status).toBe('open');
  });

  it('nach einem Fehler werden abhängige eingereihte Knoten freigegeben statt endlos zu warten', async () => {
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', house);
    const failing: RunDeps = {
      runPrompt: async (_p, h) => {
        h.beforeRun();
        return 'failed';
      },
      resetContext: () => {},
      lastRunTokens: () => 0,
      notify: (x) => t.toasts.push(x),
    };
    const q = createRunQueue(t.ctx, () => failing, (x) => t.toasts.push(x));
    q.request({ planId: plan.id, nodeId: plan.nodes[0].id });
    q.request({ planId: plan.id, nodeId: plan.nodes[1].id });
    await q.idle();
    expect(getPlan(t.ctx, plan.id)!.nodes.map((n) => n.status)).toEqual(['failed', 'open', 'open', 'open']);
  });
});
