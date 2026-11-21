/**
 * Paket 19: Graph-Editor (Logik-Graph). Öffnet auf `ui.openGraphEditor` { entityId } ein Fenster,
 * Knopf „Logik“ in der Werkzeugleiste (Build-Modus mit Auswahl) und Kürzel `L`.
 * Testzugang im Browser: `window.__cloudpartyGraphEditor` = { session, getGraph(), getCompile() } (solange ein Editor offen ist).
 */
import { useStore } from 'zustand';
import type { GameContext, GameModule } from '../../core/context';
import type { PanelProps } from '../../core/ui';
import EditorWindow from './EditorWindow';
import { graphLog } from './meta';
import { closeGraph, graphUi, openGraph } from './ui';
import './editor.css';

function tryOpen(ctx: GameContext, entityId: string): void {
  if (!ctx.store.getState().entities[entityId]) return;
  if (!openGraph(entityId)) ctx.bus.emit('ui.toast', { text: 'Der offene Graph hat ungespeicherte Änderungen. Bitte erst speichern oder schließen.', kind: 'error' });
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.closest?.('[contenteditable="true"], .cm-editor, .ge-window');
}

function ToolbarButton({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const selection = useStore(ctx.store, (s) => s.selection);
  const exists = useStore(ctx.store, (s) => (s.selection ? !!s.entities[s.selection] : false));
  if (mode !== 'build' || !selection || !exists) return null;
  return (
    <button type="button" className="cp-button" data-testid="graph-toggle" title="Logik-Graph bearbeiten (L)" onClick={() => tryOpen(ctx, selection)}>
      Logik
    </button>
  );
}

function Overlay({ ctx }: PanelProps) {
  const entityId = useStore(graphUi, (s) => s.entityId);
  if (!entityId) return null;
  return <EditorWindow key={entityId} ctx={ctx} entityId={entityId} />;
}

let cleanups: Array<() => void> = [];

const mod: GameModule = {
  id: 'graph-editor',
  init(ctx) {
    const { bus, store } = ctx;
    cleanups.push(
      bus.on('ui.openGraphEditor', ({ entityId }) => tryOpen(ctx, entityId)),
      bus.on('script.log', ({ entityId, level, message, ts }) => graphLog.push(entityId, { ts, level, message })),
      bus.on('script.status', ({ entityId, status, message }) => graphLog.setStatus(entityId, { status, message })),
      bus.on('entity.removed', ({ entity }) => {
        graphLog.forget(entity.id);
        if (graphUi.getState().entityId === entity.id) closeGraph();
      }),
      bus.on('world.loaded', () => closeGraph()),
      ctx.ui.register({ id: 'graph-editor-button', slot: 'toolbar', order: 35, component: ToolbarButton }),
      ctx.ui.register({ id: 'graph-editor-window', slot: 'overlay', order: 52, component: Overlay }),
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'l' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
      if (isTyping(event.target) || isTyping(document.activeElement)) return;
      const { mode, selection } = store.getState();
      if (mode !== 'build' || !selection) return;
      event.preventDefault();
      tryOpen(ctx, selection);
    };
    window.addEventListener('keydown', onKey);
    cleanups.push(() => window.removeEventListener('keydown', onKey));
  },
  dispose() {
    for (const c of cleanups) c();
    cleanups = [];
    closeGraph();
  },
};
export default mod;
