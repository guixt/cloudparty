// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LIMITS } from '../../../shared/aiTools';
import { PLAN_LIMITS, compactPlan, type PlanSpec } from '../../../shared/plan';
import { History } from '../../build/history';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { addEdge, addNode, createPlan, updateNode } from '../../plan/core/api';
import { createRunQueue } from '../../plan/run/queue';
import { buildNodePrompt, buildReviewPrompt, runPlan, runReview, type RunDeps } from '../../plan/run/runner';
import type { AssistantApi, AssistantEvent, RunOptions } from '../api';
import { createAiStore, createController } from '../ui/state';
import { createAssistant } from './loop';
import { buildSystemPrompt, planModePrompt, reviewModePrompt } from './prompt';
import { getEffectiveModel, getReviewAfterRun, getRoleModel, setReviewAfterRun, setRoleModel } from './settings';
import { installLocalStorage, mockFetch, textResponse } from './testUtils';

beforeEach(() => {
  installLocalStorage({ 'cloudparty.ai.key': 'sk-ant-test-0123456789' });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Modelle je Rolle', () => {
  it('ohne Einstellung gilt das Hauptmodell; ungültige Werte werden ignoriert', () => {
    expect(getRoleModel('plan')).toBe('');
    expect(getEffectiveModel('exec')).toBe('claude-sonnet-5-5');
    setRoleModel('plan', 'claude-opus-5-5');
    setRoleModel('exec', 'quatsch');
    expect(getRoleModel('plan')).toBe('claude-opus-5-5');
    expect(getRoleModel('exec')).toBe('');
    expect(getEffectiveModel('plan')).toBe('claude-opus-5-5');
    setRoleModel('plan', '');
    expect(getRoleModel('plan')).toBe('');
    setReviewAfterRun(true);
    expect(getReviewAfterRun()).toBe(true);
  });

  it('der Auftrag nutzt das übergebene Modell, sonst das Hauptmodell', async () => {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    const history = new History(store, bus);
    history.attach();
    const assistant = createAssistant({ store, bus, getAvatar: () => null, getHistory: () => history });
    const events: AssistantEvent[] = [];
    const run = (o: Partial<RunOptions>) => assistant.run('hallo', { onEvent: (e) => void events.push(e), confirm: async () => true, ...o });
    const requests = mockFetch([textResponse('a'), textResponse('b'), textResponse('c')]);
    await run({});
    await run({ model: 'claude-haiku-5-5' });
    await run({ model: 'claude-opus-5-5', mode: 'plan' });
    expect(requests.map((r) => r.body.model)).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']);
    expect(requests[0].body.system).not.toBeUndefined();
    const sys = (r: (typeof requests)[number]) => JSON.stringify(r.body.system);
    expect(sys(requests[2])).toContain('Planungsmodus (nur planen');
    expect(sys(requests[0])).not.toContain('Planungsmodus (nur planen');
  });
});

describe('Prompt-Modi', () => {
  const state = { world: createWorldStore(new EventBus()).getState().world };
  it('Planungsmodus verlangt ausführliche Bauanleitungen mit den echten Grenzen', () => {
    const p = buildSystemPrompt(state, { mode: 'plan' });
    expect(p).toContain('Planungsmodus (nur planen');
    expect(p).toContain('Bauanleitung');
    expect(p).toContain(String(PLAN_LIMITS.notes));
    expect(p).toContain('Nummerierte Schritte');
    expect(p).not.toContain('Prüfmodus (Ergebnis kontrollieren)');
    expect(buildSystemPrompt(state)).not.toContain('Planungsmodus (nur planen');
    expect(p.startsWith(buildSystemPrompt(state))).toBe(true); // Basis (Cache-Präfix) bleibt gleich
  });
  it('Prüfmodus nennt Kontrollwerkzeuge und plan_add_node', () => {
    const p = buildSystemPrompt(state, { mode: 'review' });
    expect(p).toContain('Prüfmodus');
    expect(p).toContain('check_overlaps');
    expect(p).toContain('plan_add_node');
  });
  it('keine unmaskierten Backticks im neuen Text', () => {
    expect(planModePrompt({ toolCalls: 8 }).includes('`')).toBe(false);
    expect(reviewModePrompt().includes('`')).toBe(false);
    void AI_LIMITS;
  });
});

describe('Plan-Notizen', () => {
  const plan: PlanSpec = {
    id: 'p',
    title: 'T',
    nodes: [
      { id: 'a', title: 'A', notes: 'x'.repeat(3000), status: 'done', x: 0, y: 0 },
      { id: 'b', title: 'B', notes: 'y'.repeat(3000), status: 'open', x: 0, y: 0 },
    ],
    edges: [{ from: 'a', to: 'b' }],
  };
  it('Übersicht und Vorgänger gekürzt, der eigene Knoten voll', () => {
    const all = compactPlan(plan) as { knoten: { notizen: string }[] };
    expect(all.knoten[0].notizen.length).toBeLessThanOrEqual(400);
    const one = compactPlan(plan, 'b') as { knoten: { id: string; notizen: string }[] };
    expect(one.knoten.find((k) => k.id === 'b')!.notizen.length).toBe(3000);
    expect(one.knoten.find((k) => k.id === 'a')!.notizen.length).toBeLessThanOrEqual(400);
  });
});

describe('Ausführung und Prüfung im Plan', () => {
  function setup() {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    store.getState().setCanBuild(true);
    const ctx = { bus, store };
    const calls: { prompt: string; hooks: Parameters<RunDeps['runPrompt']>[1] }[] = [];
    const deps: RunDeps = {
      runPrompt: async (prompt, hooks) => {
        calls.push({ prompt, hooks });
        hooks.beforeRun();
        return 'ok';
      },
      resetContext: () => {},
      lastRunTokens: () => 100,
      notify: () => {},
    };
    return { ctx, deps, calls };
  }
  const complete = (ctx: ReturnType<typeof setup>['ctx'], planId: string) => (deps: RunDeps): RunDeps => ({
    ...deps,
    runPrompt: async (prompt, hooks) => {
      const r = await deps.runPrompt(prompt, hooks);
      if (hooks.mode !== 'review') {
        const id = /node="([^"]+)"/.exec(prompt)?.[1];
        if (id) updateNode(ctx, planId, id, { status: 'done', result: { entityIds: [], summary: 'ok' } });
      }
      return r;
    },
  });

  it('Knoten laufen mit dem Ausführungsmodell und einer Anleitung für die Bauanleitung', async () => {
    setRoleModel('exec', 'claude-haiku-5-5');
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', [{ id: 'a', title: 'A', notes: '1. add_wall …' }]);
    await runPlan(t.ctx, plan.id, undefined, complete(t.ctx, plan.id)(t.deps));
    expect(t.calls[0].hooks.model).toBe('claude-haiku-5-5');
    expect(t.calls[0].prompt).toContain('Bauanleitung');
    expect(t.calls[0].prompt).toContain('Schritt für Schritt');
    expect(buildNodePrompt('p', 'n')).toContain('rechne nichts um');
  });

  it('ohne Ausführungsmodell kein Modell-Override', async () => {
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', [{ id: 'a', title: 'A' }]);
    await runPlan(t.ctx, plan.id, undefined, complete(t.ctx, plan.id)(t.deps));
    expect(t.calls[0].hooks.model).toBeUndefined();
  });

  it('Prüfung nutzt das Prüfmodell im Prüfmodus', async () => {
    setRoleModel('review', 'claude-opus-5-5');
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', [{ id: 'a', title: 'A' }]);
    expect(await runReview(t.ctx, plan.id, t.deps)).toBe('ok');
    expect(t.calls[0].hooks).toMatchObject({ model: 'claude-opus-5-5', mode: 'review' });
    expect(t.calls[0].prompt).toBe(buildReviewPrompt(plan.id));
    t.ctx.store.getState().setCanBuild(false);
    expect(await runReview(t.ctx, plan.id, t.deps)).toBe('skipped');
  });

  it('Warteschlange: manuelle Prüfung, automatische Prüfung nach „Alle ausführen“ nur mit Schalter und Prüfmodell', async () => {
    const t = setup();
    const plan = createPlan(t.ctx, 'Haus', [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', after: ['a'] }]);
    const wrapped = complete(t.ctx, plan.id)(t.deps);
    const queue = createRunQueue(t.ctx, () => wrapped, () => {});
    queue.request({ planId: plan.id, review: true });
    await queue.idle();
    expect(t.calls.map((c) => c.hooks.mode)).toEqual(['review']);

    t.calls.length = 0;
    setRoleModel('review', 'claude-opus-5-5');
    updateNode(t.ctx, plan.id, plan.nodes[0].id, { status: 'open', result: null });
    updateNode(t.ctx, plan.id, plan.nodes[1].id, { status: 'open', result: null });
    queue.request({ planId: plan.id });
    await queue.idle();
    expect(t.calls.some((c) => c.hooks.mode === 'review')).toBe(false); // Schalter aus

    t.calls.length = 0;
    setReviewAfterRun(true);
    updateNode(t.ctx, plan.id, plan.nodes[0].id, { status: 'open', result: null });
    updateNode(t.ctx, plan.id, plan.nodes[1].id, { status: 'open', result: null });
    queue.request({ planId: plan.id });
    await queue.idle();
    expect(t.calls.at(-1)!.hooks).toMatchObject({ mode: 'review', model: 'claude-opus-5-5' });
    void addNode;
    void addEdge;
  });
});

describe('Planen im Chat', () => {
  it('„Planen“ reiht mit Planungsmodell, Planungsmodus und mehr Ausgabe ein', async () => {
    setRoleModel('plan', 'claude-opus-5-5');
    const seen: RunOptions[] = [];
    const api = {
      getSettings: () => ({ hasKey: true, model: 'claude-sonnet-5-5', approval: 'ask' as const, vision: false, imageSearch: false, maxInputTokens: 40000, maxOutputTokens: 4096 }),
      setVision: vi.fn(),
      setImageSearch: vi.fn(),
      setTokenLimits: vi.fn(),
      setApproval: vi.fn(),
      setApiKey: vi.fn(),
      setModel: vi.fn(),
      run: async (_p: string, o: RunOptions) => void seen.push(o),
      resetConversation: vi.fn(),
      undoLast: vi.fn(() => true),
    } as unknown as AssistantApi;
    const store = createAiStore();
    const c = createController({ store, getApi: () => api, notify: vi.fn(), needKey: vi.fn() });
    await c.send('plane ein Haus', undefined, { mode: 'plan' });
    await c.send('baue eine Bank');
    expect(seen[0]).toMatchObject({ mode: 'plan', model: 'claude-opus-5-5' });
    expect(seen[0].maxOutputTokens).toBeGreaterThanOrEqual(8000);
    expect(seen[1].mode).toBeUndefined();
    expect(seen[1].model).toBeUndefined();
  });
});
