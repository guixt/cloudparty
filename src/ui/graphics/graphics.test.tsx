// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../../core/context';
import { createQualityController } from '../../engine/quality';
import { FpsOverlay, GraphicsDialog } from './index';
import { graphicsUi, setShowFps } from './state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  localStorage.clear();
  graphicsUi.setState({ open: false, showFps: false });
});

function mount(node: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement;
const click = (el: Element) => act(() => void (el as HTMLElement).click());

function makeCtx(): GameContext {
  localStorage.clear();
  return { quality: createQualityController('medium'), engine: { getGlInfo: () => ({ renderer: 'Test-GPU' }), getFps: () => 50 } } as unknown as GameContext;
}

describe('Grafik-Dialog', () => {
  it('Stufe wählen setzt manuell, Automatisch setzt zurück und startet die Messung neu', () => {
    const ctx = makeCtx();
    const restart = vi.fn();
    mount(<GraphicsDialog ctx={ctx} restartAuto={restart} onClose={() => {}} />);
    expect(q('graphics-tier-auto').checked).toBe(true);
    click(q('graphics-tier-high'));
    expect(ctx.quality.get()).toBe('high');
    expect(ctx.quality.isAuto()).toBe(false);
    expect(q('graphics-tier-high').checked).toBe(true);
    click(q('graphics-tier-auto'));
    expect(ctx.quality.isAuto()).toBe(true);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Test-GPU');
    expect(document.body.textContent).toContain('Auf schwächeren Rechnern wählt Cloudparty beim ersten Start automatisch eine passende Stufe.');
  });

  it('Erweitert: Override ändert features, Zurücksetzen löscht sie', () => {
    const ctx = makeCtx();
    mount(<GraphicsDialog ctx={ctx} restartAuto={() => {}} onClose={() => {}} />);
    click(q('graphics-advanced-toggle'));
    act(() => void (document.querySelector('details') as HTMLDetailsElement).dispatchEvent(new Event('toggle')));
    const ssao = q('graphics-f-ssao');
    expect(ssao.checked).toBe(false);
    click(ssao);
    expect(ctx.quality.features().ssao).toBe(true);
    expect(ctx.quality.getOverrides()).toEqual({ ssao: true });
    click(ssao); // zurück auf Stufenwert → Override entfällt
    expect(ctx.quality.getOverrides()).toEqual({});
    click(q('graphics-f-ssao'));
    click(q('graphics-reset'));
    expect(ctx.quality.getOverrides()).toEqual({});
    expect(ctx.quality.features().ssao).toBe(false);
  });

  it('Esc schließt und gibt die Taste nicht an die Welt weiter', () => {
    const ctx = makeCtx();
    const onClose = vi.fn();
    const world = vi.fn();
    window.addEventListener('keydown', world);
    mount(<GraphicsDialog ctx={ctx} restartAuto={() => {}} onClose={onClose} />);
    act(() => void q('graphics-fps').dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })));
    act(() => void q('graphics-fps').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    window.removeEventListener('keydown', world);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(world).not.toHaveBeenCalled();
  });

  it('FPS-Schalter wird gespeichert und blendet die Anzeige ein', () => {
    const ctx = makeCtx();
    mount(
      <>
        <GraphicsDialog ctx={ctx} restartAuto={() => {}} onClose={() => {}} />
        <FpsOverlay ctx={ctx} />
      </>,
    );
    expect(q('graphics-fps-overlay')).toBeNull();
    click(q('graphics-fps'));
    expect(localStorage.getItem('cloudparty.fps')).toBe('1');
    expect(q('graphics-fps-overlay').textContent).toContain('Mittel');
    act(() => setShowFps(false));
    expect(localStorage.getItem('cloudparty.fps')).toBeNull();
  });
});
