// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { FREEFORM_REF } from '../../../../shared/freeform';
import type { EntitySpec } from '../../../../shared/types';
import { FreeformSection } from './FreeformSection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = { pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] };
const sweep: EntitySpec = { id: 'a', ref: FREEFORM_REF, transform: T, state: { kind: 'sweep', path: [{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], height: 2.4, thickness: 0.2 } };
const lathe: EntitySpec = { id: 'b', ref: FREEFORM_REF, transform: T, state: { kind: 'lathe', profile: [[0.4, 0], [0.5, 1]] } };
const patchE: EntitySpec = {
  id: 'c',
  ref: FREEFORM_REF,
  transform: T,
  state: { kind: 'patch', grid: [[[0, 0, 0], [1, 0, 0]], [[0, 0, 1], [1, 0, 1]]], degree: 1 },
};

function setup(initial: EntitySpec) {
  const log: EntitySpec[] = [];
  function Host() {
    const [e, setE] = useState(initial);
    return (
      <FreeformSection
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
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const type = (id: string, text: string) => {
    const input = q(id) as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
  };
  const click = (id: string) => act(() => (q(id) as HTMLButtonElement).click());
  return { el, root, log, q, type, click };
}

describe('FreeformSection', () => {
  it('erscheint nicht bei anderen Refs', () => {
    const { el, root } = setup({ ...sweep, ref: 'EntitySpec.box' });
    expect(el.innerHTML).toBe('');
    act(() => root.unmount());
  });

  it('zeigt je Art die passenden Felder', () => {
    const a = setup(sweep);
    expect(a.q('freeform-kind')!.textContent).toContain('Sweep');
    expect(a.q('freeform-height')).toBeTruthy();
    expect(a.q('freeform-path-1-x')).toBeTruthy();
    expect(a.q('freeform-profile-0-r')).toBeNull();
    act(() => a.root.unmount());
    const b = setup(lathe);
    expect(b.q('freeform-kind')!.textContent).toContain('Drehkörper');
    expect(b.q('freeform-profile-1-y')).toBeTruthy();
    expect(b.q('freeform-sweep-deg')).toBeTruthy();
    expect(b.q('freeform-height')).toBeNull();
    act(() => b.root.unmount());
    const c = setup(patchE);
    expect(c.q('freeform-kind')!.textContent).toContain('Fläche');
    expect(c.q('freeform-grid-1-1-z')).toBeTruthy();
    expect(c.q('freeform-degree')).toBeTruthy();
    act(() => c.root.unmount());
  });

  it('Eingabe schreibt den neuen State', () => {
    const { root, log, type } = setup(sweep);
    type('freeform-height', '3,5');
    expect((log.at(-1)!.state as { height: number }).height).toBe(3.5);
    type('freeform-path-0-x', '1.5');
    expect((log.at(-1)!.state as { path: { p: number[] }[] }).path[0].p[0]).toBe(1.5);
    type('freeform-height-end', '1');
    expect((log.at(-1)!.state as { heightEnd: number }).heightEnd).toBe(1);
    type('freeform-height-end', '');
    // Leer = kein Höhenverlauf: die Prüfung setzt heightEnd auf die Höhe.
    const last = log.at(-1)!.state as { height: number; heightEnd?: number };
    expect(last.heightEnd ?? last.height).toBe(last.height);
    act(() => root.unmount());
  });

  it('ungültige Eingabe zeigt Fehler und ändert nichts', () => {
    const { root, log, type, q } = setup(sweep);
    type('freeform-height', 'abc');
    expect(log.length).toBe(0);
    expect(q('freeform-height-error')).toBeTruthy();
    act(() => root.unmount());
  });

  it('Punkt hinzufügen, verschieben und löschen', () => {
    const { root, log, click } = setup(sweep);
    click('freeform-path-add');
    expect((log.at(-1)!.state as { path: unknown[] }).path.length).toBe(3);
    click('freeform-path-0-down');
    expect((log.at(-1)!.state as { path: { p: number[] }[] }).path[1].p[0]).toBe(0);
    click('freeform-path-2-del');
    expect((log.at(-1)!.state as { path: unknown[] }).path.length).toBe(2);
    act(() => root.unmount());
  });

  it('Schnitte: hinzufügen bis maxCuts, löschen', () => {
    const { root, log, click, q } = setup(sweep);
    for (let i = 0; i < 8; i++) click('freeform-cut-add');
    expect((log.at(-1)!.state as { cuts: unknown[] }).cuts.length).toBe(8);
    expect((q('freeform-cut-add') as HTMLButtonElement).disabled).toBe(true);
    click('freeform-cut-0-del');
    expect((log.at(-1)!.state as { cuts: unknown[] }).cuts.length).toBe(7);
    act(() => root.unmount());
  });

  it('Zurücksetzen stellt die Vorlage der Art her', () => {
    const { root, log, click } = setup({ ...lathe, state: { kind: 'lathe', profile: [[1, 0], [1, 1]], cuts: [{ shape: 'box', pos: [0, 0, 0], size: [1, 1, 1] }] } });
    click('freeform-reset');
    const st = log.at(-1)!.state as { kind: string; profile: unknown[]; cuts?: unknown };
    expect(st.kind).toBe('lathe');
    expect(st.profile.length).toBe(4);
    expect(st.cuts).toBeUndefined();
    act(() => root.unmount());
  });
});
