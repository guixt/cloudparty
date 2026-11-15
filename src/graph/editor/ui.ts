/** Modulweiter Zustand des Graph-Editors (welches Objekt ist offen, ungespeichert?). */
import { createStore } from 'zustand/vanilla';

export interface GraphUiState {
  entityId: string | null;
  dirty: boolean;
}

export const graphUi = createStore<GraphUiState>(() => ({ entityId: null, dirty: false }));

/** Öffnet den Editor; false, wenn ein anderes Fenster ungespeicherte Änderungen hat. */
export function openGraph(entityId: string): boolean {
  const { entityId: current, dirty } = graphUi.getState();
  if (current && current !== entityId && dirty) return false;
  graphUi.setState({ entityId, dirty: current === entityId ? dirty : false });
  return true;
}

export function closeGraph(): void {
  graphUi.setState({ entityId: null, dirty: false });
}
