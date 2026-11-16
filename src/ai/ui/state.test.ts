import { describe, expect, it, vi } from 'vitest';
import type { AssistantApi, RunOptions } from '../api';
import { MAX_QUEUE, applyEvent, createAiStore, createController, formatTokens, initialView, usageLine } from './state';

function fakeApi(run: (prompt: string, o: RunOptions) => Promise<void>, hasKey = true): AssistantApi & { undo: ReturnType<typeof vi.fn> } {
  const undo = vi.fn(() => true);
  return {
    getSettings: () => ({ hasKey, model: 'm', approval: 'ask' as const, vision: false, maxInputTokens: 40000, maxOutputTokens: 4096 }),
    setVision: vi.fn(),
    setTokenLimits: vi.fn(),
    setApproval: vi.fn(),
    setApiKey: vi.fn(),
    setModel: vi.fn(),
    run,
    resetConversation: vi.fn(),
    undoLast: undo,
    undo,
  };
}

describe('applyEvent', () => {
  it('hängt Text-Deltas an dieselbe Sprechblase', () => {
    let s = initialView();
    s = applyEvent(s, { type: 'text', delta: 'Hal' });
    s = applyEvent(s, { type: 'text', delta: 'lo' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]).toMatchObject({ kind: 'assistant', text: 'Hallo' });
  });
  it('Werkzeug unterbricht Text, danach neue Blase', () => {
    let s = applyEvent(initialView(), { type: 'text', delta: 'a' });
    s = applyEvent(s, { type: 'tool', name: 'add_entity', summary: 'Bank hinzugefügt', ok: true });
    s = applyEvent(s, { type: 'text', delta: 'b' });
    expect(s.messages.map((m) => m.kind)).toEqual(['assistant', 'tool', 'assistant']);
  });
  it('Verbrauch, Fehler und done', () => {
    let s = { ...initialView(), running: true };
    s = applyEvent(s, { type: 'usage', inputTokens: 1234, outputTokens: 456 });
    s = applyEvent(s, { type: 'error', message: 'kaputt' });
    s = applyEvent(s, { type: 'done', stopped: false, changed: true });
    expect(usageLine(s.usage!)).toBe('1 234 Tokens ein / 456 aus');
    expect(s.messages[0]).toMatchObject({ kind: 'error', message: 'kaputt' });
    expect(s.running).toBe(false);
    expect(s.changed).toBe(true);
  });
  it('formatTokens', () => expect(formatTokens(1234567)).toBe('1 234 567'));
});

describe('controller', () => {
  it('sendet, streamt und merkt changed', async () => {
    const store = createAiStore();
    const api = fakeApi(async (_p, o) => {
      o.onEvent({ type: 'text', delta: 'ok' });
      o.onEvent({ type: 'done', stopped: false, changed: true });
    });
    const ctl = createController({ store, getApi: () => api, notify: vi.fn(), needKey: vi.fn() });
    await ctl.send('  Hallo ');
    const s = store.getState();
    expect(s.messages.map((m) => m.kind)).toEqual(['user', 'assistant']);
    expect(s.running).toBe(false);
    expect(s.changed).toBe(true);
  });
  it('ohne Key: needKey statt run', async () => {
    const run = vi.fn();
    const needKey = vi.fn();
    const ctl = createController({ store: createAiStore(), getApi: () => fakeApi(run, false), notify: vi.fn(), needKey });
    await ctl.send('x');
    expect(needKey).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it('Rückfrage wartet bis zur Antwort', async () => {
    const store = createAiStore();
    let answer: boolean | null = null;
    const api = fakeApi(async (_p, o) => {
      answer = await o.confirm('Skript speichern?', 'code');
    });
    const ctl = createController({ store, getApi: () => api, notify: vi.fn(), needKey: vi.fn() });
    const p = ctl.send('x');
    await Promise.resolve();
    const card = store.getState().messages.find((m) => m.kind === 'confirm')!;
    expect(card).toMatchObject({ status: 'pending', detail: 'code' });
    expect(answer).toBeNull();
    ctl.answer(card.id, true);
    await p;
    expect(answer).toBe(true);
    expect(store.getState().messages.find((m) => m.kind === 'confirm')).toMatchObject({ status: 'yes' });
  });
  it('Stopp löst offene Rückfragen mit false auf; Event und Callback ergeben eine Karte', async () => {
    const store = createAiStore();
    let answer: boolean | null = null;
    let signal: AbortSignal | undefined;
    const api = fakeApi(async (_p, o) => {
      signal = o.signal;
      o.onEvent({ type: 'confirm', id: '1', question: 'Löschen?' });
      answer = await o.confirm('Löschen?');
    });
    const ctl = createController({ store, getApi: () => api, notify: vi.fn(), needKey: vi.fn() });
    const p = ctl.send('x');
    await Promise.resolve();
    expect(store.getState().messages.filter((m) => m.kind === 'confirm')).toHaveLength(1);
    ctl.stop();
    await p;
    expect(signal?.aborted).toBe(true);
    expect(answer).toBe(false);
    expect(store.getState().messages.find((m) => m.kind === 'confirm')).toMatchObject({ status: 'no' });
    expect(store.getState().running).toBe(false);
  });
  it('Rückgängig ruft undoLast und meldet per Toast', async () => {
    const store = createAiStore();
    store.setState({ ...initialView(), changed: true });
    const api = fakeApi(async () => {});
    const notify = vi.fn();
    createController({ store, getApi: () => api, notify, needKey: vi.fn() }).undo();
    expect(api.undo).toHaveBeenCalled();
    expect(notify).toHaveBeenCalled();
    expect(store.getState().changed).toBe(false);
  });
  it('Neues Gespräch leert Ansicht und Verlauf', async () => {
    const store = createAiStore();
    const api = fakeApi(async (_p, o) => o.onEvent({ type: 'text', delta: 'x' }));
    const ctl = createController({ store, getApi: () => api, notify: vi.fn(), needKey: vi.fn() });
    await ctl.send('a');
    ctl.reset();
    expect(store.getState().messages).toHaveLength(0);
    expect(api.resetConversation).toHaveBeenCalled();
  });
describe('Warteschlange', () => {
  /** Ein Lauf, der erst beim Aufruf von release() endet. */
  function gated() {
    const started: string[] = [];
    const gates: (() => void)[] = [];
    const run = (prompt: string, o: RunOptions) =>
      new Promise<void>((resolve) => {
        started.push(prompt);
        gates.push(() => {
          o.onEvent({ type: 'done', stopped: false, changed: false });
          resolve();
        });
      });
    return { run, started, release: (i = 0) => gates[i]?.() };
  }
  const setup = (run: (p: string, o: RunOptions) => Promise<void>) => {
    const store = createAiStore();
    const notify = vi.fn();
    const controller = createController({ store, getApi: () => fakeApi(run), notify, needKey: vi.fn() });
    return { store, controller, notify };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('Nachrichten während eines Laufs warten und laufen danach der Reihe nach', async () => {
    const g = gated();
    const { store, controller } = setup(g.run);
    void controller.send('eins');
    void controller.send('zwei');
    void controller.send('drei');
    await tick();
    expect(g.started).toEqual(['eins']);
    expect(store.getState().queue.map((q) => q.text)).toEqual(['zwei', 'drei']);
    g.release(0);
    await tick();
    expect(g.started).toEqual(['eins', 'zwei']);
    g.release(1);
    await tick();
    expect(g.started).toEqual(['eins', 'zwei', 'drei']);
    g.release(2);
    await tick();
    expect(store.getState().queue).toEqual([]);
    expect(store.getState().running).toBe(false);
    expect(store.getState().messages.filter((m) => m.kind === 'user').map((m) => (m as { text: string }).text)).toEqual(['eins', 'zwei', 'drei']);
  });

  it('Stopp hält die Schlange an, Fortsetzen arbeitet sie weiter ab', async () => {
    const g = gated();
    const { store, controller } = setup(g.run);
    void controller.send('eins');
    void controller.send('zwei');
    await tick();
    controller.stop();
    g.release(0);
    await tick();
    expect(store.getState().paused).toBe(true);
    expect(g.started).toEqual(['eins']);
    void controller.resume();
    await tick();
    expect(store.getState().paused).toBe(false);
    expect(g.started).toEqual(['eins', 'zwei']);
    g.release(1);
    await tick();
    expect(store.getState().queue).toEqual([]);
  });

  it('ein Fehler pausiert die Schlange', async () => {
    const started: string[] = [];
    const run = async (prompt: string, o: RunOptions) => {
      started.push(prompt);
      o.onEvent({ type: 'error', message: 'kaputt' });
      o.onEvent({ type: 'done', stopped: false, changed: false });
    };
    const { store, controller } = setup(run);
    void controller.send('eins');
    void controller.send('zwei');
    await tick();
    await tick();
    expect(started).toEqual(['eins']);
    expect(store.getState().paused).toBe(true);
    expect(store.getState().queue.map((q) => q.text)).toEqual(['zwei']);
  });

  it('einzelne Einträge entfernen und die Schlange leeren', async () => {
    const g = gated();
    const { store, controller } = setup(g.run);
    void controller.send('eins');
    void controller.send('zwei');
    void controller.send('drei');
    await tick();
    const id = store.getState().queue[0].id;
    controller.removeQueued(id);
    expect(store.getState().queue.map((q) => q.text)).toEqual(['drei']);
    controller.clearQueue();
    expect(store.getState().queue).toEqual([]);
    g.release(0);
    await tick();
    expect(g.started).toEqual(['eins']);
  });

  it('Begrenzung auf MAX_QUEUE Nachrichten, Neues Gespräch leert die Schlange', async () => {
    const g = gated();
    const { store, controller, notify } = setup(g.run);
    void controller.send('läuft');
    for (let i = 0; i < MAX_QUEUE; i++) void controller.send(`n${i}`);
    await tick();
    expect(store.getState().queue).toHaveLength(MAX_QUEUE);
    await controller.send('zu viel');
    expect(store.getState().queue).toHaveLength(MAX_QUEUE);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('voll'), 'error');
    controller.reset();
    expect(store.getState().queue).toEqual([]);
    expect(store.getState().paused).toBe(false);
  });

  it('ohne Key wird nichts eingereiht', async () => {
    const store = createAiStore();
    const needKey = vi.fn();
    const controller = createController({ store, getApi: () => fakeApi(async () => {}, false), notify: vi.fn(), needKey });
    await controller.send('hallo');
    expect(needKey).toHaveBeenCalled();
    expect(store.getState().queue).toEqual([]);
  });
});
});

describe('runPrompt (Plan-Knoten)', () => {
  it('führt sofort aus und meldet Erfolg, Fehler und Abbruch', async () => {
    const ok = createController({ store: createAiStore(), getApi: () => fakeApi(async (_p, o) => o.onEvent({ type: 'done', stopped: false, changed: true })), notify: vi.fn(), needKey: vi.fn() });
    expect(await ok.runPrompt('Knoten')).toBe('ok');
    const bad = createController({ store: createAiStore(), getApi: () => fakeApi(async (_p, o) => o.onEvent({ type: 'error', message: 'kaputt' })), notify: vi.fn(), needKey: vi.fn() });
    expect(await bad.runPrompt('Knoten')).toBe('failed');
    const stopped = createController({ store: createAiStore(), getApi: () => fakeApi(async (_p, o) => o.onEvent({ type: 'done', stopped: true, changed: false })), notify: vi.fn(), needKey: vi.fn() });
    expect(await stopped.runPrompt('Knoten')).toBe('failed');
  });

  it('startet nichts ohne Key oder während ein Auftrag läuft', async () => {
    const needKey = vi.fn();
    const noKey = createController({ store: createAiStore(), getApi: () => fakeApi(async () => {}, false), notify: vi.fn(), needKey });
    expect(await noKey.runPrompt('x')).toBe('skipped');
    expect(needKey).toHaveBeenCalled();

    const notify = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = createAiStore();
    const busy = createController({ store, getApi: () => fakeApi(async (_p, o) => { await gate; o.onEvent({ type: 'done', stopped: false, changed: false }); }), notify, needKey: vi.fn() });
    const first = busy.send('lang');
    await Promise.resolve();
    expect(await busy.runPrompt('zweiter')).toBe('skipped');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('arbeitet'), 'error');
    release();
    await first;
  });
});
