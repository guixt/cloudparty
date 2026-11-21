/**
 * Einfache Fenster-Reihenfolge für schwebende Fenster: das zuletzt angeklickte Fenster liegt vorn.
 * z-index 3 (hinten) bzw. 4 (vorn) – bleibt unter Dialogen (z-index 5).
 */
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export const windowStack = createStore<{ front: string | null }>(() => ({ front: null }));

export function bringToFront(id: string): void {
  if (windowStack.getState().front !== id) windowStack.setState({ front: id });
}

/** z-index für das Fenster `id`. */
export function useWindowZ(id: string): number {
  return useStore(windowStack, (s) => (s.front === id ? 4 : 3));
}
