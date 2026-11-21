/**
 * UI-Slots: Module melden React-Komponenten an, App.tsx rendert sie.
 * VERTRAG: nur der Koordinator ändert diese Datei.
 */
import type { ComponentType } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { GameContext } from './context';

/**
 * Slots (Layout siehe src/App.tsx und src/styles.css):
 * - 'toolbar'      Werkzeugleiste unten Mitte (Knöpfe nebeneinander)
 * - 'bottom-left'  unten links über der Leiste (Chat)
 * - 'top-left'     oben links (Titel, Status)
 * - 'top-right'    oben rechts (Online-Anzeige, Konto)
 * - 'left'         linke Seitenleiste (Palette im Build-Modus)
 * - 'right'        rechte Seitenleiste (Inspector)
 * - 'overlay'      vollflächig über allem (Menüs, Editor, Dialoge) – selbst positionieren
 */
export type UiSlot = 'toolbar' | 'bottom-left' | 'top-left' | 'top-right' | 'left' | 'right' | 'overlay';

export interface PanelProps {
  ctx: GameContext;
}
export interface UiPanel {
  id: string;
  slot: UiSlot;
  /** Kleinere Werte zuerst. */
  order?: number;
  component: ComponentType<PanelProps>;
}

export interface UiState {
  panels: UiPanel[];
}
export interface UiRegistry {
  store: StoreApi<UiState>;
  /** Meldet ein Panel an (gleiche id ersetzt); Rückgabewert meldet es ab. */
  register(panel: UiPanel): () => void;
}

export function createUiRegistry(): UiRegistry {
  const store = createStore<UiState>(() => ({ panels: [] }));
  return {
    store,
    register(panel) {
      store.setState((state) => ({
        panels: [...state.panels.filter((p) => p.id !== panel.id), panel].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
      }));
      return () => store.setState((state) => ({ panels: state.panels.filter((p) => p.id !== panel.id) }));
    },
  };
}
