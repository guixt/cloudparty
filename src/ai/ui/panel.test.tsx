// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantApi, RunOptions } from '../api';
import { AssistantPanel, AssistantWindow } from './panel';
import { SettingsDialog, validateApiKey } from './settings';
import { createAiStore, createController, SUGGESTIONS } from './state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
});

function makeApi(run: (p: string, o: RunOptions) => Promise<void> = async () => {}) {
  let hasKey = true;
  let model = 'claude-sonnet-5-5';
  let approval: 'ask' | 'auto' = 'ask';
  const api = {
    getSettings: () => ({ hasKey, model, approval, maxInputTokens: 40000, maxOutputTokens: 4096 }),
    setTokenLimits: vi.fn(),
    setApproval: vi.fn((m: 'ask' | 'auto') => {
      approval = m;
    }),
    setApiKey: vi.fn((k: string) => {
      hasKey = k !== '';
    }),
    setModel: vi.fn((m: string) => {
      model = m;
    }),
    run: vi.fn(run),
    resetConversation: vi.fn(),
    undoLast: vi.fn(() => true),
  };
  return api satisfies AssistantApi;
}

function mountPanel(api: AssistantApi | null, canBuild = true) {
  const store = createAiStore();
  const controller = createController({ store, getApi: () => api, notify: vi.fn(), needKey: vi.fn() });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<AssistantPanel api={api} store={store} controller={controller} canBuild={canBuild} onOpenSettings={() => {}} />));
  return { store, controller };
}

function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const q = <T extends HTMLElement>(id: string) => host!.querySelector<T>(`[data-testid="${id}"]`);

describe('AssistantPanel', () => {
  it('zeigt Hinweis ohne Kern', () => {
    mountPanel(null);
    expect(q('ai-unavailable')?.textContent).toContain('noch nicht verfügbar');
  });
  it('Klick auf Vorschlag sendet den Text', async () => {
    const api = makeApi();
    mountPanel(api);
    await act(async () => q('ai-suggestion')!.click());
    expect(api.run).toHaveBeenCalledWith(SUGGESTIONS[0], expect.anything());
  });
  it('Enter sendet, Shift+Enter nicht', async () => {
    const api = makeApi();
    mountPanel(api);
    const input = q<HTMLTextAreaElement>('ai-input')!;
    type(input, 'Hallo');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(api.run).not.toHaveBeenCalled();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(api.run).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });
  it('Tasten im Eingabefeld erreichen window nicht', () => {
    mountPanel(makeApi());
    const spy = vi.fn();
    window.addEventListener('keydown', spy);
    q('ai-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    window.removeEventListener('keydown', spy);
    expect(spy).not.toHaveBeenCalled();
  });
  it('HTML in Antworten bleibt reiner Text', async () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    mountPanel(
      makeApi(async (_p, o) => {
        o.onEvent({ type: 'text', delta: evil });
        o.onEvent({ type: 'tool', name: 't', summary: '<b>fett</b>', ok: true });
        o.onEvent({ type: 'done', stopped: false, changed: false });
      }),
    );
    await act(async () => q('ai-suggestion')!.click());
    const bubble = q('ai-msg-assistant')!;
    expect(bubble.textContent).toBe(evil);
    expect(host!.querySelector('script, img, b')).toBeNull();
  });
  it('Rückfrage-Karte blockiert bis Klick', async () => {
    let result: boolean | null = null;
    mountPanel(
      makeApi(async (_p, o) => {
        result = await o.confirm('Skript speichern?', 'self.on("click")');
      }),
    );
    await act(async () => q('ai-suggestion')!.click());
    expect(q('ai-confirm')!.textContent).toContain('self.on("click")');
    expect(result).toBeNull();
    await act(async () => q('ai-confirm-no')!.click());
    expect(result).toBe(false);
  });
  it('Hinweis ohne Baurecht', () => {
    mountPanel(makeApi(), false);
    expect(q('ai-no-build')?.textContent).toContain('kein Baurecht');
  });
});

describe('SettingsDialog', () => {
  function mountSettings(api: AssistantApi) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<SettingsDialog api={api} explain onClose={() => {}} />));
  }
  it('speichert Key über setApiKey und zeigt ihn nie wieder an', () => {
    const api = makeApi();
    api.setApiKey('');
    mountSettings(api);
    expect(q('ai-need-key')).not.toBeNull();
    type(q<HTMLInputElement>('ai-key-input')!, 'sk-ant-geheim-12345');
    act(() => q('ai-key-save')!.click());
    expect(api.setApiKey).toHaveBeenLastCalledWith('sk-ant-geheim-12345');
    expect(q('ai-key-saved')!.textContent).toContain('Key gespeichert');
    expect(host!.innerHTML).not.toContain('geheim');
  });
  it('Key löschen', () => {
    const api = makeApi();
    mountSettings(api);
    act(() => q('ai-key-clear')!.click());
    expect(api.setApiKey).toHaveBeenLastCalledWith('');
    expect(q('ai-key-input')).not.toBeNull();
  });
  it('Freigabe: Standard fragen; alles erlauben erst nach Warnung und Bestätigung', () => {
    const api = makeApi();
    mountSettings(api);
    expect(q<HTMLInputElement>('ai-approval-ask')!.checked).toBe(true);
    expect(q<HTMLInputElement>('ai-approval-auto')!.checked).toBe(false);
    act(() => q('ai-approval-auto')!.click());
    expect(q('ai-approval-warning')!.textContent).toContain('ohne Prüfung gespeichert');
    expect(api.setApproval).not.toHaveBeenCalled();
    act(() => q('ai-approval-cancel')!.click());
    expect(q('ai-approval-warning')).toBeNull();
    expect(api.setApproval).not.toHaveBeenCalled();
    act(() => q('ai-approval-auto')!.click());
    act(() => q('ai-approval-confirm')!.click());
    expect(api.setApproval).toHaveBeenLastCalledWith('auto');
    expect(q<HTMLInputElement>('ai-approval-auto')!.checked).toBe(true);
    expect(q('ai-approval-warning')).toBeNull();
  });
  it('Freigabe: zurück auf fragen braucht keine Bestätigung', () => {
    const api = makeApi();
    api.setApproval('auto');
    api.setApproval.mockClear();
    mountSettings(api);
    expect(q<HTMLInputElement>('ai-approval-auto')!.checked).toBe(true);
    act(() => q('ai-approval-ask')!.click());
    expect(api.setApproval).toHaveBeenLastCalledWith('ask');
    expect(q<HTMLInputElement>('ai-approval-ask')!.checked).toBe(true);
  });
  it('Abzeichen im Fensterkopf nur im Modus auto', () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<AssistantWindow title="KI" onClose={() => {}} onSettings={() => {}}>x</AssistantWindow>));
    expect(q('ai-badge')).toBeNull();
    act(() => root!.render(<AssistantWindow title="KI" badge="Auto" onClose={() => {}} onSettings={() => {}}>x</AssistantWindow>));
    expect(q('ai-badge')!.textContent).toBe('Auto');
  });
  it('validateApiKey', () => {
    expect(validateApiKey('  ')).not.toBeNull();
    expect(validateApiKey('sk-ant a b c d e f')).not.toBeNull();
    expect(validateApiKey('sk-ant-api03-abcdef')).toBeNull();
  });
});
