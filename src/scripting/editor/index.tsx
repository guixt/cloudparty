/**
 * Paket 8: Skript-Editor. CodeMirror-Fenster im Build-Modus mit Konsole,
 * API-Referenz und Beispielen. Siehe ScriptEditorWindow.tsx.
 */
import { useStore } from 'zustand';
import type { GameContext, GameModule, } from '../../core/context';
import type { PanelProps } from '../../core/ui';
import { closeEditor, consoleStore, editorUi, openEditor } from './editorState';
import ScriptEditorWindow from './ScriptEditorWindow';
import './editor.css';

function tryOpen(ctx: GameContext, entityId: string): void {
  if (!ctx.store.getState().entities[entityId]) return;
  if (!openEditor(entityId)) {
    ctx.bus.emit('ui.toast', { text: 'Das offene Skript hat ungespeicherte Änderungen. Bitte erst speichern oder schließen.', kind: 'error' });
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.closest?.('[contenteditable="true"], .cm-editor');
}

function ToolbarButton({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const selection = useStore(ctx.store, (s) => s.selection);
  const exists = useStore(ctx.store, (s) => (s.selection ? !!s.entities[s.selection] : false));
  if (mode !== 'build' || !selection || !exists) return null;
  return (
    <button type="button" className="cp-button" data-testid="open-script-editor" title="Skript bearbeiten (E)" onClick={() => tryOpen(ctx, selection)}>
      Skript bearbeiten
    </button>
  );
}

function Overlay({ ctx }: PanelProps) {
  const entityId = useStore(editorUi, (s) => s.entityId);
  if (!entityId) return null;
  return <ScriptEditorWindow key={entityId} ctx={ctx} entityId={entityId} />;
}

let cleanups: Array<() => void> = [];

const mod: GameModule = {
  id: 'script-editor',
  init(ctx) {
    const { bus, store } = ctx;
    cleanups.push(
      bus.on('ui.openScriptEditor', ({ entityId }) => tryOpen(ctx, entityId)),
      bus.on('script.log', ({ entityId, level, message, ts }) => consoleStore.push(entityId, { ts, level, message })),
      bus.on('script.status', ({ entityId, status, message }) => consoleStore.setStatus(entityId, { status, message })),
      bus.on('entity.removed', ({ entity }) => {
        consoleStore.forget(entity.id);
        if (editorUi.getState().entityId === entity.id) closeEditor();
      }),
      bus.on('world.loaded', () => closeEditor()),
      ctx.ui.register({ id: 'script-editor-button', slot: 'toolbar', order: 30, component: ToolbarButton }),
      ctx.ui.register({ id: 'script-editor-window', slot: 'overlay', order: 50, component: Overlay }),
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'e' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
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
    closeEditor();
  },
};
export default mod;
