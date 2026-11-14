/** Lokaler UI-Zustand des Build-Modus (Werkzeug, Raster, gewählter Baustein, Suche). */
import { createStore } from 'zustand/vanilla';

export type Tool = 'move' | 'rotate' | 'scale';

export interface BuildUiState {
  tool: Tool;
  snap: boolean;
  /** Katalog-Schlüssel des Bausteins, der per Klick auf den Boden wiederholt platziert wird. */
  armed: string | null;
  search: string;
}

export const buildState = createStore<BuildUiState>(() => ({ tool: 'move', snap: true, armed: null, search: '' }));

export const resetBuildState = () => buildState.setState({ tool: 'move', snap: true, armed: null, search: '' });

/** true, wenn ein Eingabeelement den Tastaturfokus hat (Kurzbefehle dann ignorieren). */
export function isTyping(target: EventTarget | null = document.activeElement): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
