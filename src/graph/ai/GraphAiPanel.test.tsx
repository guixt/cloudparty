// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { GraphSpec } from '../../../shared/graph';

vi.mock('../../../shared/graphCompact', () => ({
  compactToGraph: (c: { nodes: { id: string; type: string }[] }): GraphSpec => ({ version: 1, enabled: true, nodes: c.nodes.map((n, i) => ({ id: n.id, type: n.type, x: i, y: 0 })), edges: [] }),
  graphToCompact: (g: GraphSpec) => ({ nodes: g.nodes.map((n) => ({ id: n.id, type: n.type })), connections: [] }),
  autoLayout: (g: GraphSpec) => g,
}));
vi.mock('../../../shared/graphCompile', () => ({
  compileGraph: (g: GraphSpec) => ({ source: 'x', warnings: [], errors: g.nodes.some((n) => n.type === 'bad') ? [{ nodeId: 'q', message: 'Typ unbekannt' }] : [] }),
  validateGraph: () => [],
  entityScriptSource: () => null,
}));

import { extractJson, generateGraph } from './graphAiLogic';
import { GraphAiPanel } from './GraphAiPanel';

const empty: GraphSpec = { version: 1, enabled: true, nodes: [], edges: [] };
const reply = (text: string) => ({ text, inputTokens: 1, outputTokens: 1 });
const good = '{"nodes":[{"id":"k","type":"on_click"}],"connections":[]}';

describe('graphAiLogic', () => {
  it('extrahiert JSON aus Zäunen und Text', () => {
    expect(extractJson('Hier:\n```json\n{"a":{"b":"}"}}\n```')).toEqual({ a: { b: '}' } });
    expect(extractJson('{kaputt} dann {"x":1}')).toEqual({ x: 1 });
    expect(extractJson('nichts')).toBeNull();
  });
  it('korrigiert höchstens zweimal', async () => {
    const bad = '{"nodes":[{"id":"q","type":"bad"}],"connections":[]}';
    const ask = vi.fn().mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply('Quatsch')).mockResolvedValueOnce(reply(good));
    const status: string[] = [];
    const r = await generateGraph({ ask, goal: 'x', onStatus: (m) => status.push(m) });
    expect(r.errors).toEqual([]);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(ask.mock.calls[1][0].prompt).toContain('Typ unbekannt');
    expect(status.some((m) => m.includes('korrigiert'))).toBe(true);
    const never = vi.fn().mockResolvedValue(reply(bad));
    const r2 = await generateGraph({ ask: never, goal: 'x' });
    expect(never).toHaveBeenCalledTimes(3);
    expect(r2.errors.length).toBeGreaterThan(0);
  });
  it('bricht ab', async () => {
    const c = new AbortController();
    c.abort();
    await expect(generateGraph({ ask: vi.fn(), goal: 'x', signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});


(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(props: Partial<Parameters<typeof GraphAiPanel>[0]>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(GraphAiPanel, { entityId: 'a', entityName: 'Tür', graph: empty, onApply: () => {}, ...props }));
  });
  const btn = (t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLButtonElement | undefined;
  const type = async (v: string) => {
    const ta = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, v);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const click = async (t: string) => {
    await act(async () => void btn(t)!.click());
    await act(async () => {});
  };
  return { host, btn, type, click, unmount: () => act(() => root.unmount()) };
}

describe('GraphAiPanel', () => {
  it('ohne Key: Hinweis, Knopf aus', async () => {
    const m = await mount({ hasKey: () => false, ask: vi.fn() });
    expect(m.host.textContent).toContain('KI-Key in den KI-Einstellungen eintragen');
    expect(m.btn('Graph erzeugen')!.disabled).toBe(true);
    expect(m.host.textContent).not.toContain('Aktuellen Graphen verbessern');
    m.unmount();
  });
  it('erzeugen und übernehmen', async () => {
    const onApply = vi.fn();
    const ask = vi.fn().mockResolvedValue(reply(good));
    const g: GraphSpec = { ...empty, nodes: [{ id: 'z', type: 'say', x: 0, y: 0 }] };
    const m = await mount({ graph: g, onApply, hasKey: () => true, ask });
    expect(m.host.textContent).toContain('Aktuellen Graphen verbessern');
    await m.type('Bei Klick grün');
    await m.click('Graph erzeugen');
    expect(m.host.textContent).toContain('1 Knoten');
    await m.click('Übernehmen');
    expect(onApply.mock.calls[0][0].nodes[0].id).toBe('k');
    m.unmount();
  });
  it('zeigt Fehler als Text, kein Übernehmen', async () => {
    const ask = vi.fn().mockResolvedValue(reply('{"nodes":[{"id":"q","type":"bad"}],"connections":[]}<img src=x onerror=1>'));
    const m = await mount({ hasKey: () => true, ask });
    await m.type('x');
    await m.click('Graph erzeugen');
    expect(m.host.textContent).toContain('Typ unbekannt');
    expect(m.btn('Übernehmen')).toBeUndefined();
    expect(m.host.querySelector('img')).toBeNull();
    expect(m.btn('Verwerfen')).toBeTruthy();
    m.unmount();
  });
});
