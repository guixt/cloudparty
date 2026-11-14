/** Kleiner Zustand zwischen Controller und Oberfläche (nur dieses Paket). */
import { createStore } from 'zustand/vanilla';

export interface AvatarUiState {
  flying: boolean;
  canFly: boolean;
  sitting: boolean;
  appearanceOpen: boolean;
}

export const avatarUi = createStore<AvatarUiState>(() => ({ flying: false, canFly: true, sitting: false, appearanceOpen: false }));

/** Vom Modul gesetzte Aktionen, die die Oberfläche auslöst. */
export const avatarActions: { toggleFly: () => void } = { toggleFly: () => {} };
