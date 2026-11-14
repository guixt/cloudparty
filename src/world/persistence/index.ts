/**
 * Paket 3: Speicherung (IndexedDB), Autosave, Datei-Export/-Import.
 */
import type { GameContext, GameModule, WorldPersistence } from '../../core/context';
import type { WorldSpec } from '../../../shared/types';
import { newEntityId } from '../../../shared/types';
import { createIndexedDbPersistence, openDatabase } from './db';
import { WorldFileButtons } from './ui';

export { exportWorldToFile, importWorldFromFile, importWorldFromText } from './io';

export const AUTOSAVE_DELAY_MS = 1500;

let cleanup: (() => void) | null = null;

/** Autosave: speichert die Welt entprellt, solange kein Server verbunden ist. */
export function startAutosave(ctx: GameContext, delayMs = AUTOSAVE_DELAY_MS): () => void {
  const { store, bus } = ctx;
  let online = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: WorldSpec | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const world = pending;
    pending = null;
    const id = world?.metadata.id;
    if (!world || !id) return;
    ctx.persistence.save(id, world).catch((error) => console.warn('[persistence] Speichern fehlgeschlagen', error));
  };

  const offBus = [
    bus.on('net.status', ({ online: next }) => {
      online = next;
      if (online) {
        // Der Server ist maßgeblich; offenes lokales Speichern verwerfen.
        if (timer) clearTimeout(timer);
        timer = null;
        pending = null;
      }
    }),
    // Neue Welt geladen: ausstehende Änderungen der vorherigen Welt noch sichern.
    bus.on('world.loaded', () => flush()),
  ];

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.revision === prev.revision || online) return;
    // revision 0 nach loadWorld: unverändert geladen, nichts zu speichern.
    if (state.revision === 0) return;
    if (!state.world.metadata.id) {
      state.setMetadata({ id: newEntityId('welt') }); // löst diese Funktion erneut aus
      return;
    }
    pending = state.toWorldSpec();
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);

  return () => {
    unsubscribe();
    offBus.forEach((off) => off());
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
    flush();
  };
}

const mod: GameModule = {
  id: 'persistence',
  async init(ctx) {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB nicht verfügbar');
      const db = await openDatabase();
      const persistence: WorldPersistence = createIndexedDbPersistence(db);
      ctx.persistence = persistence;
    } catch (error) {
      console.warn('[persistence] IndexedDB nicht nutzbar, Ersatzspeicher (localStorage) bleibt aktiv', error);
    }
    const stopAutosave = startAutosave(ctx);
    const unregister = ctx.ui.register({ id: 'persistence.worldfile', slot: 'top-right', order: 50, component: WorldFileButtons });
    cleanup = () => {
      stopAutosave();
      unregister();
    };
  },
  dispose() {
    cleanup?.();
    cleanup = null;
  },
};
export default mod;
