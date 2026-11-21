/** Schwebendes Editor-Fenster: CodeMirror, Konsole, Referenz, Beispiele. */
import { autocompletion, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentWithTab } from '@codemirror/commands';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import type { GameContext } from '../../core/context';
import { AiPanel } from './ai/AiPanel';
import { closeEditor, consoleStore, editorUi } from './editorState';
import { SCRIPT_EXAMPLES, type ScriptExample } from './examples';
import {
  buildCompletionSets,
  buildReference,
  checkSyntax,
  describeIssue,
  filterReference,
  formatTime,
  type CompletionItem,
  type ReferenceEntry,
  type SyntaxIssue,
} from './logic';

type Tab = 'code' | 'ref' | 'examples' | 'ai';
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Baseline {
  source: string;
  enabled: boolean;
}

const MIN_W = 380;
const MIN_H = 320;
const COMPLETIONS = buildCompletionSets();
const REFERENCE = buildReference();

function toCompletion(item: CompletionItem): Completion {
  const base = { label: item.label, detail: item.detail, info: item.info, type: item.type };
  return item.template ? snippetCompletion(item.template, base) : base;
}
const SELF_OPTIONS = COMPLETIONS.self.map(toCompletion);
const WORLD_OPTIONS = COMPLETIONS.world.map(toCompletion);
const GLOBAL_OPTIONS = COMPLETIONS.globals.map(toCompletion);

function apiCompletionSource(context: CompletionContext): CompletionResult | null {
  const dotted = context.matchBefore(/\b(self|world)\.\w*$/);
  if (dotted) {
    return {
      from: dotted.from + dotted.text.indexOf('.') + 1,
      options: dotted.text.startsWith('self') ? SELF_OPTIONS : WORLD_OPTIONS,
      validFor: /^\w*$/,
    };
  }
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  if (context.state.sliceDoc(Math.max(0, word.from - 1), word.from) === '.') return null;
  return { from: word.from, options: GLOBAL_OPTIONS, validFor: /^\w*$/ };
}

function initialRect(): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(MIN_W, Math.min(vw - 24, Math.floor(vw / 2) - 12));
  const h = Math.max(MIN_H, vh - 64 - 76);
  return { x: Math.max(0, vw - w - 12), y: 64, w, h };
}

const KIND_LABEL: Record<ReferenceEntry['kind'], string> = { event: 'Ereignis', self: 'self', world: 'world' };

export default function ScriptEditorWindow({ ctx, entityId }: { ctx: GameContext; entityId: string }) {
  const entity = useStore(ctx.store, (s) => s.entities[entityId]);
  const mode = useStore(ctx.store, (s) => s.mode);
  const script = entity?.script;

  const initial = useMemo<Baseline>(() => ({ source: script?.source ?? '', enabled: script?.enabled ?? true }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [baseline, setBaseline] = useState<Baseline>(initial);
  const [text, setText] = useState(initial.source);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [issue, setIssue] = useState<SyntaxIssue | null>(null);
  const [tab, setTab] = useState<Tab>('code');
  const [rect, setRect] = useState<Rect>(initialRect);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [confirm, setConfirm] = useState<{ message: string; yes: () => void } | null>(null);
  const [query, setQuery] = useState('');

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const baselineRef = useRef(baseline);
  const enabledRef = useRef(enabled);
  baselineRef.current = baseline;
  enabledRef.current = enabled;

  const dirty = text !== baseline.source || enabled !== baseline.enabled;
  useEffect(() => {
    editorUi.setState({ dirty });
  }, [dirty]);

  // --- CodeMirror aufbauen
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial.source,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          javascript(),
          javascriptLanguage.data.of({ autocomplete: apiCompletionSource }),
          autocompletion({ icons: true }),
          oneDark,
          lintGutter(),
          linter(
            (v): Diagnostic[] => {
              const found = checkSyntax(v.state.doc.toString());
              setIssue(found);
              return found ? [{ from: found.from, to: found.to, severity: 'error', message: found.message }] : [];
            },
            { delay: 300 },
          ),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { fontFamily: "ui-monospace, 'Cascadia Code', Consolas, Menlo, monospace", overflow: 'auto' },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) setText(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initial.source]);

  // --- Objekt entfernt: Fenster schließen
  useEffect(() => {
    if (!entity) closeEditor();
  }, [entity]);

  // --- Änderung von außen übernehmen, solange nichts Ungespeichertes vorliegt
  useEffect(() => {
    const next: Baseline = { source: script?.source ?? '', enabled: script?.enabled ?? true };
    const base = baselineRef.current;
    if (next.source === base.source && next.enabled === base.enabled) return;
    const view = viewRef.current;
    const current = view ? view.state.doc.toString() : base.source;
    const localChanges = current !== base.source || enabledRef.current !== base.enabled;
    setBaseline(next);
    if (!localChanges && view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next.source } });
      setEnabled(next.enabled);
    }
  }, [script]);

  const save = useCallback((): boolean => {
    const view = viewRef.current;
    if (!view || !ctx.store.getState().entities[entityId]) return false;
    const source = view.state.doc.toString();
    const on = enabledRef.current;
    if (source.trim() === '') {
      ctx.store.getState().updateEntity(entityId, { script: undefined });
      setBaseline({ source, enabled: true });
      setEnabled(true);
    } else {
      ctx.store.getState().updateEntity(entityId, { script: { source, enabled: on } });
      setBaseline({ source, enabled: on });
    }
    return true;
  }, [ctx, entityId]);
  saveRef.current = save;

  const saveAndTest = () => {
    if (!save()) return;
    if (checkSyntax(viewRef.current?.state.doc.toString() ?? '')) {
      ctx.bus.emit('ui.toast', { text: 'Das Skript enthält Syntaxfehler und wird nicht laufen.', kind: 'error' });
    }
    ctx.store.getState().setMode('play');
  };

  const requestClose = () => {
    if (dirty) setConfirm({ message: 'Ungespeicherte Änderungen verwerfen?', yes: closeEditor });
    else closeEditor();
  };

  const insertAtCursor = (insert: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(insert));
    setTab('code');
    requestAnimationFrame(() => view.focus());
  };

  const insertExample = (example: ScriptExample) => {
    const apply = () => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: example.source } });
      setTab('code');
      setConfirm(null);
      requestAnimationFrame(() => view.focus());
    };
    if (viewRef.current && viewRef.current.state.doc.toString().trim() !== '') {
      setConfirm({ message: `Den Inhalt des Editors durch das Beispiel „${example.title}" ersetzen?`, yes: apply });
    } else apply();
  };

  // --- Tastatur: Welt-Kürzel dürfen nicht auslösen
  const onKey = (event: ReactKeyboardEvent) => {
    event.stopPropagation();
    if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveRef.current();
    }
  };

  // --- Ziehen und Größe ändern
  const drag = useRef<{ kind: 'move' | 'size'; px: number; py: number; rect: Rect } | null>(null);
  const startDrag = (kind: 'move' | 'size') => (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, input, label')) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { kind, px: event.clientX, py: event.clientY, rect };
  };
  const moveDrag = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.px;
    const dy = event.clientY - d.py;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (d.kind === 'move') {
      setRect({ ...d.rect, x: Math.min(Math.max(d.rect.x + dx, 80 - d.rect.w), vw - 80), y: Math.min(Math.max(d.rect.y + dy, 0), vh - 40) });
    } else {
      setRect({ ...d.rect, w: Math.min(Math.max(MIN_W, d.rect.w + dx), vw - d.rect.x), h: Math.min(Math.max(MIN_H, d.rect.h + dy), vh - d.rect.y) });
    }
  };
  const endDrag = () => {
    drag.current = null;
  };

  const name = entity?.name ?? entityId;

  return (
    <div
      className="cp-panel se-window"
      data-testid="script-editor"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onKeyDown={onKey}
      onKeyUp={onKey}
      onKeyPress={onKey}
    >
      <div className="se-titlebar" data-testid="script-editor-titlebar" onPointerDown={startDrag('move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <span className="cp-title se-title">Skript: {name}</span>
        <span className={`se-dirty ${dirty ? 'se-dirty-on' : ''}`} data-testid="script-dirty" title={dirty ? 'Ungespeicherte Änderungen' : 'Alles gespeichert'}>
          {dirty ? '● Ungespeichert' : '✓ Gespeichert'}
        </span>
        <button type="button" className="cp-button se-close" aria-label="Schließen" onClick={requestClose}>
          Schließen
        </button>
      </div>

      <div className="se-actions">
        <button type="button" className="cp-button" data-testid="script-save" onClick={() => save()} title="Strg+S">
          Speichern
        </button>
        <button type="button" className="cp-button cp-button-primary" data-testid="script-save-test" onClick={saveAndTest}>
          Speichern &amp; Testen
        </button>
        <label className="se-check">
          <input type="checkbox" data-testid="script-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Skript aktiv
        </label>
        <div className="se-tabs" role="tablist">
          {([['code', 'Code'], ['ref', 'Referenz'], ['examples', 'Beispiele'], ['ai', 'KI']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} className={`cp-button se-tab ${tab === id ? 'cp-button-active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {confirm && (
        <div className="se-confirm" data-testid="script-confirm" role="alertdialog">
          <span>{confirm.message}</span>
          <button type="button" className="cp-button cp-button-primary" data-testid="script-confirm-yes" onClick={() => { const yes = confirm.yes; setConfirm(null); yes(); }}>
            Ja
          </button>
          <button type="button" className="cp-button" data-testid="script-confirm-no" onClick={() => setConfirm(null)}>
            Abbrechen
          </button>
        </div>
      )}

      <div className="se-body">
        <div className="se-editor-wrap" style={{ display: tab === 'code' ? 'flex' : 'none' }}>
          <div ref={hostRef} className="se-editor" data-testid="script-code" />
          <div className={`se-status ${issue ? 'se-status-error' : ''}`} data-testid="script-syntax">
            {issue ? `Syntaxfehler – ${describeIssue(issue)}` : 'Syntax in Ordnung'}
          </div>
        </div>
        {tab === 'ref' && <ReferencePanel query={query} setQuery={setQuery} onInsert={insertAtCursor} />}
        {tab === 'examples' && <ExamplesPanel onInsert={insertExample} />}
        <div style={{ display: tab === 'ai' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <AiPanel
            entityName={name}
            entityRef={entity?.ref}
            otherNames={Object.values(ctx.store.getState().entities).filter((e) => e.id !== entityId).map((e) => e.name ?? e.id)}
            getSource={() => viewRef.current?.state.doc.toString() ?? text}
            setSource={(source) => {
              const view = viewRef.current;
              if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
              setTab('code');
            }}
            getLogLines={() => consoleStore.getLines(entityId)}
            getStatus={() => consoleStore.getStatus(entityId)}
          />
        </div>
      </div>

      <ConsolePanel ctx={ctx} entityId={entityId} mode={mode} open={consoleOpen} setOpen={setConsoleOpen} />
      <div className="se-resize" data-testid="script-resize" onPointerDown={startDrag('size')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
    </div>
  );
}

function ReferencePanel({ query, setQuery, onInsert }: { query: string; setQuery: (q: string) => void; onInsert: (text: string) => void }) {
  const entries = useMemo(() => filterReference(REFERENCE, query), [query]);
  return (
    <div className="se-pane" data-testid="script-reference">
      <input className="cp-input" type="search" placeholder="API durchsuchen …" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="ref-search" />
      <p className="cp-muted se-hint">Klick fügt den Eintrag an der Cursor-Position im Code ein.</p>
      <div className="se-list">
        {entries.map((e) => (
          <button key={`${e.kind}.${e.name}`} type="button" className="se-ref" data-testid="ref-entry" data-name={e.name} onClick={() => onInsert(e.insert)}>
            <span className={`se-kind se-kind-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
            <code>{e.signature}</code>
            <span className="cp-muted">{e.description}</span>
          </button>
        ))}
        {entries.length === 0 && <p className="cp-muted">Nichts gefunden.</p>}
      </div>
    </div>
  );
}

function ExamplesPanel({ onInsert }: { onInsert: (example: ScriptExample) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="se-pane" data-testid="script-examples">
      <div className="se-list">
        {SCRIPT_EXAMPLES.map((ex) => (
          <div key={ex.id} className="se-example" data-testid="example">
            <div className="se-example-head">
              <strong>{ex.title}</strong>
              <span className="se-spacer" />
              <button type="button" className="cp-button" onClick={() => setOpen(open === ex.id ? null : ex.id)}>
                {open === ex.id ? 'Code ausblenden' : 'Code ansehen'}
              </button>
              <button type="button" className="cp-button cp-button-primary" data-testid={`example-insert-${ex.id}`} onClick={() => onInsert(ex)}>
                Einfügen
              </button>
            </div>
            <div className="cp-muted">{ex.description}</div>
            {open === ex.id && <pre className="se-pre">{ex.source}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_LABEL = { running: 'Läuft', stopped: 'Gestoppt', error: 'Fehler' } as const;

function ConsolePanel({ ctx, entityId, mode, open, setOpen }: { ctx: GameContext; entityId: string; mode: string; open: boolean; setOpen: (o: boolean) => void }) {
  void ctx;
  useSyncExternalStore(
    (cb) => consoleStore.subscribe(cb),
    () => consoleStore.version,
  );
  const lines = consoleStore.getLines(entityId);
  const status = consoleStore.getStatus(entityId);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, open]);
  return (
    <div className={`se-console ${open ? '' : 'se-console-closed'}`} data-testid="script-console">
      <div className="se-console-head">
        <button type="button" className="se-fold" aria-expanded={open} data-testid="console-toggle" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} Konsole
        </button>
        {status ? (
          <span className={`se-badge se-badge-${status.status}`} data-testid="script-status">
            {STATUS_LABEL[status.status]}
          </span>
        ) : (
          <span className="se-badge se-badge-none" data-testid="script-status">
            Unbekannt
          </span>
        )}
        {status?.message && <span className="se-status-msg" title={status.message}>{status.message}</span>}
        {mode === 'build' && <span className="cp-muted se-hint-inline">Skripte laufen nur im Spielmodus</span>}
        <span className="se-spacer" />
        <button type="button" className="cp-button se-small" data-testid="console-clear" onClick={() => consoleStore.clear(entityId)}>
          Leeren
        </button>
      </div>
      {open && (
        <div className="se-log" ref={scrollRef} data-testid="console-lines">
          {lines.length === 0 && <div className="cp-muted">Noch keine Ausgaben.</div>}
          {lines.map((l, i) => (
            <div key={i} className={`se-line ${l.level === 'error' ? 'se-line-error' : ''}`}>
              <span className="se-time">{formatTime(l.ts)}</span>
              <span className="se-level">{l.level === 'error' ? 'Fehler' : 'Log'}</span>
              <span className="se-msg">{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
