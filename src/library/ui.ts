/** Zustand der Bibliotheks-Oberfläche (Fenster offen, Drag-Hinweis, Speichern-Dialog). */
import { createStore } from 'zustand/vanilla';

export interface LibraryUiState {
  open: boolean;
  saveOpen: boolean;
  /** Name des Bausteins, der gerade auf die Welt gezogen wird. */
  dragging: string | null;
}
export const libraryUi = createStore<LibraryUiState>(() => ({ open: false, saveOpen: false, dragging: null }));
export const DRAG_TYPE = 'application/x-cloudparty-library';
