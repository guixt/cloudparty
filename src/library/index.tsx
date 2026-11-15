/**
 * Paket 17: Bibliothek wiederverwendbarer Bausteine. Test-Hook: `window.__cloudpartyLibrary`.
 * Öffnen: Knopf „Bibliothek", Taste B, Ereignis `ui.openLibrary`. Strg+Umschalt+S speichert die Auswahl.
 */
import { useStore } from 'zustand';
import type { GameModule } from '../core/context';
import type { PanelProps } from '../core/ui';
import type { LibraryApi } from './api';
import { groundPointAtClient } from './ground';
import { getLibrary, setLibrary } from './instance';
import { LibraryOverlay } from './panel';
import { createLibrary, type LibraryService } from './service';
import { DRAG_TYPE, libraryUi } from './ui';
import './library.css';

export { getLibrary };

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || !!el.closest?.('.cm-editor');
}

function ToolbarButton() {
  const open = useStore(libraryUi, (s) => s.open);
  return (
    <button type="button" className={`cp-button ${open ? 'cp-button-active' : ''}`} data-testid="library-toggle" title="Bibliothek (B)" onClick={() => libraryUi.setState({ open: !open })}>
      Bibliothek
    </button>
  );
}

let service: LibraryService | null = null;
let cleanups: Array<() => void> = [];

const mod: GameModule = {
  id: 'library',
  init(ctx) {
    service = createLibrary(ctx);
    setLibrary(service);
    (globalThis as { __cloudpartyLibrary?: LibraryApi }).__cloudpartyLibrary = service;
    const toast = (text: string) => ctx.bus.emit('ui.toast', { text, kind: 'error' });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isTyping(e.target) || isTyping(document.activeElement)) return;
      const key = e.key.toLowerCase();
      if (key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        libraryUi.setState((s) => ({ open: !s.open }));
      } else if (key === 's' && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const state = ctx.store.getState();
        if (state.mode !== 'build') return;
        if (state.selectedIds.length === 0) toast('Zuerst Objekte auswählen, die als Baustein gespeichert werden sollen.');
        else libraryUi.setState({ saveOpen: true });
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const canvas = ctx.canvas;
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = ctx.store.getState().mode === 'build' ? 'copy' : 'none';
    };
    const onDrop = (e: DragEvent) => {
      const id = e.dataTransfer?.getData(DRAG_TYPE);
      libraryUi.setState({ dragging: null });
      if (!id) return;
      e.preventDefault();
      const state = ctx.store.getState();
      if (state.mode !== 'build' || !state.canBuild) return toast('Zum Platzieren zuerst in den Baumodus wechseln (Tab).');
      const at = groundPointAtClient(ctx, e.clientX, e.clientY);
      if (!at) return toast('Hier kann nichts platziert werden – bitte auf die Insel ziehen.');
      service?.place(id, { at }).catch((err: Error) => toast(err.message));
    };
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);
    const onDragEnd = () => libraryUi.setState({ dragging: null });
    window.addEventListener('dragend', onDragEnd);

    cleanups.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => canvas.removeEventListener('dragover', onDragOver),
      () => canvas.removeEventListener('drop', onDrop),
      () => window.removeEventListener('dragend', onDragEnd),
      ctx.bus.on('ui.openLibrary', () => libraryUi.setState({ open: true })),
      ctx.bus.on('world.loaded', () => libraryUi.setState({ saveOpen: false })),
      ctx.ui.register({ id: 'library-button', slot: 'toolbar', order: 45, component: ToolbarButton }),
      ctx.ui.register({ id: 'library-overlay', slot: 'overlay', component: (props: PanelProps) => <LibraryOverlay {...props} /> }),
    );
  },
  dispose() {
    for (const c of cleanups) c();
    cleanups = [];
    service?.dispose();
    service = null;
    setLibrary(null);
    libraryUi.setState({ open: false, saveOpen: false, dragging: null });
    delete (globalThis as { __cloudpartyLibrary?: LibraryApi }).__cloudpartyLibrary;
  },
};
export default mod;
