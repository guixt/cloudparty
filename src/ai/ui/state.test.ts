import { describe, expect, it, vi } from 'vitest';
import type { AssistantApi, RunOptions } from '../api';
import { applyEvent, createAiStore, createController, formatTokens, initialView, usageLine } from './state';

function fakeApi(run: (prompt: string, o: RunOptions) => Promise<void>, hasKey = true): AssistantApi & { undo: ReturnType<typeof vi.fn> } {
  const undo = vi.fn(() => true);
  return {
    getSettings: () => ({ hasKey, model: 'm' }),
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
});
