// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { EntitySpec } from '../../shared/types';
import { MaterialSection } from './materialSection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setup(initial: EntitySpec) {
  const log: EntitySpec[] = [];
  function Host() {
    const [e, setE] = useState(initial);
    return (
      <MaterialSection
        entity={e}
        patch={(p) => {
          const next = { ...e, ...p };
          log.push(next);
          setE(next);
        }}
      />
    );
  }
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(<Host />));
  return { el, root, log };
}
const entity: EntitySpec = { id: 'a', ref: 'EntitySpec.box', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } };

describe('MaterialSection', () => {
  it('Klick auf Voreinstellung schreibt konkrete Werte und behält mirror', () => {
    const { el, root, log } = setup({ ...entity, material: { mirror: true } });
    act(() => (el.querySelector('[data-testid="insp-preset-gold"]') as HTMLButtonElement).click());
    const m = log.at(-1)!.material!;
    expect(m.preset).toBe('gold');
    expect(m.color).toBe('#d4af37');
    expect(m.metallic).toBe(1);
    expect(m.mirror).toBe(true);
    expect(el.querySelector('[data-testid="insp-preset-gold"]')!.className).toContain('cpb-preset-on');
    act(() => root.unmount());
  });
  it('Zahlenfeld, Muster und Spiegel schreiben entity.material', () => {
    const { el, root, log } = setup(entity);
    const input = el.querySelector('[data-testid="insp-reflect"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, '0.7');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(log.at(-1)!.material!.reflect).toBeCloseTo(0.7);
    const sel = el.querySelector('[data-testid="insp-pattern"]') as HTMLSelectElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'ziegel');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(log.at(-1)!.material!.pattern).toBe('ziegel');
    expect(el.querySelector('[data-testid="insp-pattern-color"]')).toBeTruthy();
    act(() => (el.querySelector('[data-testid="insp-mirror"]') as HTMLInputElement).click());
    expect(log.at(-1)!.material!.mirror).toBe(true);
    expect(el.textContent).toContain('kostet Leistung');
    act(() => root.unmount());
  });
});
