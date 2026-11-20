import { afterEach, describe, expect, it } from 'vitest';
import { AI_LIMITS, AI_RUN_LIMITS } from '../../../shared/aiTools';
import { History } from '../../build/history';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import type { AssistantEvent } from '../api';
import { createAssistant } from './loop';
import { clampRunLimit, getRunLimits, getStoredRunLimits, isLongRunMode, resetRunLimits, setLongRunMode, setStoredRunLimits } from './runLimits';
import { installLocalStorage, mockFetch, textResponse, toolResponse } from './testUtils';

function installSession() {
  const data = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}
afterEach(() => {
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

describe('Laufzeit-Grenzen', () => {
  it('Standardwerte entsprechen den bisherigen Festwerten', () => {
    installLocalStorage();
    installSession();
    const l = getRunLimits();
    expect(l.maxRounds).toBe(AI_LIMITS.maxRounds);
    expect(l.maxToolCalls).toBe(AI_LIMITS.maxToolCalls);
    expect(l.maxNewEntities).toBe(AI_LIMITS.maxNewEntities);
    expect(l.confirmNewEntitiesAt).toBe(AI_LIMITS.confirmNewEntitiesAt);
    expect(l.confirmRemovalsAt).toBe(AI_LIMITS.confirmRemovalsAt);
    expect(l.maxScreenshots).toBe(AI_LIMITS.maxScreenshotsPerRun);
    expect(l.maxScriptTests).toBe(AI_LIMITS.maxScriptTestsPerRun);
    expect(l.planNodesPerRun).toBe(20);
    expect(l.planTokensPerRun).toBe(600_000);
  });

  it('gespeicherte Werte werden begrenzt, ungültige ignoriert, Zurücksetzen geht', () => {
    installLocalStorage({ 'cloudparty.ai.runLimits': '{kaputt' });
    installSession();
    expect(getStoredRunLimits()).toEqual({});
    setStoredRunLimits({ maxRounds: 40, maxToolCalls: 99999, maxScreenshots: 0 });
    expect(getRunLimits().maxRounds).toBe(40);
    expect(getRunLimits().maxToolCalls).toBe(AI_RUN_LIMITS.maxToolCalls.max);
    expect(getRunLimits().maxScreenshots).toBe(AI_RUN_LIMITS.maxScreenshots.min);
    expect(clampRunLimit('maxRounds', 'abc')).toBe(12);
    resetRunLimits();
    expect(getRunLimits().maxRounds).toBe(12);
  });

  it('Modus „Lange Pläne“ hebt nur an, nie ab, und gilt nur in der Sitzung', () => {
    installLocalStorage();
    installSession();
    setStoredRunLimits({ maxRounds: 100, maxToolCalls: 30 });
    setLongRunMode(true);
    expect(isLongRunMode()).toBe(true);
    const l = getRunLimits();
    expect(l.maxRounds).toBe(100); // eigener Wert war größer
    expect(l.maxToolCalls).toBe(AI_RUN_LIMITS.maxToolCalls.long);
    expect(getStoredRunLimits().maxToolCalls).toBe(30); // gespeicherter Wert unverändert
    setLongRunMode(false);
    expect(getRunLimits().maxToolCalls).toBe(30);
    installSession(); // neue Sitzung: Modus ist aus
    expect(isLongRunMode()).toBe(false);
  });
});

describe('Schleife nutzt die Einstellungen', () => {
  function setup(stored: Record<string, number>) {
    installLocalStorage({ 'cloudparty.ai.key': 'sk-ant-test-0123456789', 'cloudparty.ai.runLimits': JSON.stringify(stored) });
    installSession();
    const bus = new EventBus();
    const store = createWorldStore(bus);
    store.getState().setCanBuild(true);
    const history = new History(store, bus);
    history.attach();
    const assistant = createAssistant({ store, bus, getAvatar: () => null, getHistory: () => history });
    const events: AssistantEvent[] = [];
    const run = () => assistant.run('los', { onEvent: (e) => void events.push(e), confirm: async () => true });
    return { run, events };
  }

  it('Werkzeuglimit pro Auftrag aus den Einstellungen', async () => {
    const s = setup({ maxToolCalls: 5 });
    const calls = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, name: 'get_world', input: {} }));
    mockFetch([toolResponse(calls), textResponse('fertig')]);
    await s.run();
    const tools = s.events.filter((e) => e.type === 'tool') as { ok: boolean; summary: string }[];
    expect(tools.filter((t) => t.ok)).toHaveLength(5);
    expect(tools.at(-1)!.summary).toContain('Werkzeuglimit');
  });

  it('Rundenlimit aus den Einstellungen mit Hinweis auf die Einstellung', async () => {
    const s = setup({ maxRounds: 2 });
    mockFetch([toolResponse([{ id: 'a', name: 'get_world', input: {} }]), toolResponse([{ id: 'b', name: 'get_world', input: {} }]), toolResponse([{ id: 'c', name: 'get_world', input: {} }])]);
    await s.run();
    const err = s.events.find((e) => e.type === 'error') as { message: string };
    expect(err.message).toContain('Grenze von 2 Runden');
    expect(err.message).toContain('Limits');
  });
});
