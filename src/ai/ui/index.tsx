/**
 * Paket 14: Assistent-Oberfläche. Knopf „KI" in der Werkzeugleiste (Taste K) und ein
 * schwebendes Fenster mit Verlauf, Werkzeugschritten, Rückfragen und Einstellungen.
 * Logik nur über `AssistantApi` (src/ai/api.ts); Zustand siehe state.ts.
 *
 * TEST-HOOK: Ist `window.__cloudpartyAiMock` gesetzt (Objekt, das `AssistantApi` umsetzt),
 * nutzt `useAssistant()` es statt des echten Kerns. Ohne Wert ändert sich nichts.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { GameModule } from '../../core/context';
import type { PanelProps } from '../../core/ui';
import type { AssistantApi } from '../api';
import { getAssistant } from '../core';
import { AssistantPanel, AssistantWindow } from './panel';
import { SettingsDialog } from './settings';
import { aiStore, aiWindow, createController, setActiveController, setOpen } from './state';
import './ui.css';

export function resolveAssistant(): AssistantApi | null {
  const mock = (globalThis as { __cloudpartyAiMock?: AssistantApi }).__cloudpartyAiMock;
  return mock ?? getAssistant();
}
/** Einziger Zugang der Oberfläche zum Assistenten (Tests können einen falschen einhängen). */
export function useAssistant(): AssistantApi | null {
  return resolveAssistant();
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function ToggleButton() {
  const open = useStore(aiWindow, (s) => s.open);
  return (
    <button type="button" className={`cp-button ${open ? 'cp-button-active' : ''}`} data-testid="ai-toggle" title="KI-Assistent (K)" onClick={() => setOpen(!open)}>
      KI
    </button>
  );
}

function Overlay({ ctx }: PanelProps) {
  const open = useStore(aiWindow, (s) => s.open);
  const canBuild = useStore(ctx.store, (s) => s.canBuild);
  const api = useAssistant();
  const [settings, setSettings] = useState<{ explain: boolean } | null>(null);
  const controller = useMemo(
    () =>
      createController({
        store: aiStore,
        getApi: resolveAssistant,
        notify: (text, kind) => ctx.bus.emit('ui.toast', { text, kind }),
        needKey: () => setSettings({ explain: true }),
      }),
    [ctx],
  );
  useEffect(() => {
    setActiveController(controller);
    return () => setActiveController(null);
  }, [controller]);
  if (!open) return null;
  return (
    <>
      <AssistantWindow title="KI-Assistent" badge={api?.getSettings().approval === 'auto' ? 'Auto' : undefined} onClose={() => setOpen(false)} onSettings={() => setSettings({ explain: false })}>
        <AssistantPanel api={api} store={aiStore} controller={controller} canBuild={canBuild} onOpenSettings={() => setSettings({ explain: true })} />
      </AssistantWindow>
      {settings && api && <SettingsDialog api={api} explain={settings.explain} onClose={() => setSettings(null)} />}
    </>
  );
}

let cleanups: Array<() => void> = [];

const mod: GameModule = {
  id: 'ai-ui',
  init(ctx) {
    cleanups.push(
      ctx.ui.register({ id: 'ai-toggle', slot: 'toolbar', order: 25, component: ToggleButton }),
      ctx.ui.register({ id: 'ai-window', slot: 'overlay', order: 60, component: Overlay }),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      e.preventDefault();
      setOpen(!aiWindow.getState().open);
    };
    window.addEventListener('keydown', onKey);
    cleanups.push(() => window.removeEventListener('keydown', onKey));
  },
  dispose() {
    for (const c of cleanups) c();
    cleanups = [];
  },
};
export default mod;
