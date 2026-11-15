// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import EditorWindow from './EditorWindow';
import { closeGraph } from './ui';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} disconnect() {} unobserve() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

function setup(graph?: unknown) {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().addEntity({ id: 'e1', name: 'Würfel', ref: 'EntitySpec.box', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, ...(graph ? { graph } : {}) } as never);
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const ctx = { store, bus } as never;
  act(() => root.render(<EditorWindow ctx={ctx} entityId="e1" />));
  return { store, bus, el, root };
}

describe('EditorWindow', () => {
  it('rendert Graph mit unbekanntem Knotentyp ohne Absturz', () => {
    const g = { version: 1, enabled: true, nodes: [{ id: 'x', type: 'gibt_es_nicht', x: 0, y: 0 }, { id: 'y', type: 'on_click', x: 300, y: 0 }], edges: [{ from: { node: 'y', port: 'then' }, to: { node: 'x', port: 'in' } }] };
    const { el, root } = setup(g);
    expect(el.querySelectorAll('[data-testid="graph-node"]')).toHaveLength(2);
    expect(el.textContent).toContain('Unbekannter Knoten');
    expect(el.textContent).toContain('Logik: Würfel');
    act(() => root.unmount());
    closeGraph();
  });
  it('leerer Zustand, Speichern schreibt entity.graph, Dirty-Anzeige', async () => {
    const { store, el, root } = setup();
    expect(el.querySelector('[data-testid="graph-empty"]')).toBeTruthy();
    const ed = (window as unknown as { __cloudpartyGraphEditor: { session: { addNode(t: string, x: number, y: number): string | null } } }).__cloudpartyGraphEditor;
    expect(el.querySelector('[data-testid="graph-dirty"]')!.textContent).toContain('Gespeichert');
    act(() => { ed.session.addNode('on_click', 100, 100); });
    expect(el.querySelector('[data-testid="graph-dirty"]')!.textContent).toContain('Ungespeichert');
    act(() => (el.querySelector('[data-testid="graph-save"]') as HTMLButtonElement).click());
    expect(store.getState().entities.e1.graph?.nodes).toHaveLength(1);
    expect(el.querySelector('[data-testid="graph-dirty"]')!.textContent).toContain('Gespeichert');
    // Fremdänderung wird übernommen, solange nicht dirty
    act(() => store.getState().updateEntity('e1', { graph: { version: 1, enabled: true, nodes: [], edges: [] } }, { source: 'remote' }));
    expect(el.querySelectorAll('[data-testid="graph-node"]')).toHaveLength(0);
    act(() => { ed.session.addNode('on_click', 0, 0); });
    act(() => store.getState().updateEntity('e1', { graph: { version: 1, enabled: true, nodes: [{ id: 'r', type: 'number', x: 0, y: 0 }], edges: [] } }, { source: 'remote' }));
    expect(el.querySelector('[data-node-id="r"]')).toBeNull();
    expect(el.querySelector('[data-testid="graph-dirty"]')!.textContent).toContain('Ungespeichert');
    vi.useRealTimers();
    act(() => root.unmount());
    closeGraph();
  });
});
