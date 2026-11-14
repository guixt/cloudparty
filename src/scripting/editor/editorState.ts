/** Modulweiter Zustand des Skript-Editors (welches Objekt ist offen, Konsole). */
import { createStore } from 'zustand/vanilla';
import { ConsoleStore } from './logic';

export interface EditorUiState {
  entityId: string | null;
  /** Hat das offene Fenster ungespeicherte Änderungen? (vom Fenster gesetzt) */
  dirty: boolean;
}

export const editorUi = createStore<EditorUiState>(() => ({ entityId: null, dirty: false }));

/** Konsole/Status je Objekt; sammelt auch bei geschlossenem Fenster. */
export const consoleStore = new ConsoleStore(200);

/** Öffnet den Editor; gibt false zurück, wenn ein anderes Fenster ungespeicherte Änderungen hat. */
export function openEditor(entityId: string): boolean {
  const { entityId: current, dirty } = editorUi.getState();
  if (current && current !== entityId && dirty) return false;
  editorUi.setState({ entityId, dirty: current === entityId ? dirty : false });
  return true;
}

export function closeEditor(): void {
  editorUi.setState({ entityId: null, dirty: false });
}
