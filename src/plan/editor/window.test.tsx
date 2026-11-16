// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { createPlan, updateNode, type PlanCtx } from '../core/api';
import PlanWindow from './PlanWindow';
import { planUi } from './ui';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

function setup(withPlan = true) {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const pctx: PlanCtx = { store, bus };
  const plan = withPlan ? createPlan(pctx, 'Haus', [{ id: 'a', title: 'Fundament' }, { id: 'b', title: 'Wände', after: ['a'] }]) : undefined;
  planUi.setState({ open: true, planId: plan?.id ?? null });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<PlanWindow ctx={{ store, bus } as never} />));
  return { store, bus, pctx, plan, el, root };
}
const click = (el: Element | null) => act(() => (el as HTMLElement).click());

describe('PlanWindow', () => {
  it('Leerzustand', () => {
    const { el, root } = setup(false);
    expect(el.textContent).toContain('Noch kein Plan.');
    act(() => root.unmount());
  });
  it('zeigt Knoten, Ausführen emittiert, Baurecht sperrt', () => {
    const { store, bus, pctx, plan, el, root } = setup();
    const runs: unknown[] = [];
    bus.on('plan.run.request', (p) => runs.push(p));
    expect(el.querySelectorAll('[data-testid="plan-node"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="plan-progress"]')!.textContent).toBe('0/2 fertig');
    const first = el.querySelectorAll('[data-testid="plan-node"]')[0] as HTMLElement;
    act(() => { first.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })); });
    const run = el.querySelector('[data-testid="plan-run-node"]') as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    click(run);
    expect(runs).toEqual([{ planId: plan!.id, nodeId: plan!.nodes[0].id }]);
    // Zweiter Knoten: Vorgänger offen
    const second = el.querySelectorAll('[data-testid="plan-node"]')[1] as HTMLElement;
    act(() => { second.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })); });
    const run2 = el.querySelector('[data-testid="plan-run-node"]') as HTMLButtonElement;
    expect(run2.disabled).toBe(true);
    expect(run2.title).toContain('Vorgänger');
    act(() => { updateNode(pctx, plan!.id, plan!.nodes[0].id, { status: 'done' }); });
    expect((el.querySelector('[data-testid="plan-run-node"]') as HTMLButtonElement).disabled).toBe(false);
    expect(el.querySelector('[data-testid="plan-progress"]')!.textContent).toBe('1/2 fertig');
    // Kein Baurecht
    act(() => store.getState().setCanBuild(false));
    expect((el.querySelector('[data-testid="plan-run-node"]') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('[data-testid="plan-run-all"]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('[data-testid="plan-readonly"]')).toBeTruthy();
    act(() => store.getState().setCanBuild(true));
    click(el.querySelector('[data-testid="plan-run-all"]'));
    expect(runs[runs.length - 1]).toEqual({ planId: plan!.id });
    act(() => root.unmount());
  });
});
