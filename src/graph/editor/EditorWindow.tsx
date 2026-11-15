/** Schwebendes Fenster des Graph-Editors. */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as RKey, type PointerEvent as RPtr } from 'react';
import { useStore } from 'zustand';
import type { GameContext } from '../../core/context';
import { emptyGraph, type CompileResult, type GraphSpec } from '../../../shared/graph';
import { compileGraph } from '../../../shared/graphCompile';
import { autoLayout } from '../../../shared/graphCompact';
import { GRAPH_EXAMPLES } from '../../../shared/graphExamples';
import { NODE_DEFS, getNodeDef } from '../../../shared/graphNodes';
import { GraphAiPanel } from '../ai/GraphAiPanel';
import { Canvas, type CanvasControls } from './Canvas';
import { graphLog } from './meta';
import { createSession, sameGraph } from './state';
import { closeGraph, graphUi } from './ui';

type Tab = 'graph' | 'code' | 'ai';
interface Rect { x: number; y: number; w: number; h: number }
const MIN_W = 420;
const MIN_H = 340;

function initialRect(): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(MIN_W, Math.min(vw - 24, Math.floor(vw * 0.62)));
  const h = Math.max(MIN_H, vh - 64 - 76);
  return { x: Math.max(0, vw - w - 12), y: 64, w, h };
}

const STATUS_LABEL = { running: 'Läuft', stopped: 'Gestoppt', error: 'Fehler' } as const;
const time = (ts: number) => new Date(ts).toLocaleTimeString('de-DE');

declare global {
  interface Window {
    /** Testzugang: { session, getGraph(), getCompile() } des geöffneten Graph-Editors. */
    __cloudpartyGraphEditor?: { session: ReturnType<typeof createSession>; getGraph(): GraphSpec; getCompile(): CompileResult | null };
  }
}

export default function EditorWindow({ ctx, entityId }: { ctx: GameContext; entityId: string }) {
  const entity = useStore(ctx.store, (s) => s.entities[entityId]);
  const mode = useStore(ctx.store, (s) => s.mode);
  const session = useMemo(() => createSession(ctx.store.getState().entities[entityId]?.graph ?? emptyGraph(), getNodeDef), []); // eslint-disable-line react-hooks/exhaustive-deps
  const graph = useStore(session.store, (s) => s.graph);
  const dirty = useStore(session.store, (s) => s.dirty);
  const canUndo = useStore(session.store, (s) => s.past.length > 0);
  const canRedo = useStore(session.store, (s) => s.future.length > 0);
  const [tab, setTab] = useState<Tab>('graph');
  const [rect, setRect] = useState<Rect>(initialRect);
  const [confirm, setConfirm] = useState<{ message: string; yes: () => void } | null>(null);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const controls = useRef<CanvasControls>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { graphUi.setState({ dirty }); }, [dirty]);
  useEffect(() => { if (!entity) closeGraph(); }, [entity]);

  // Testzugang
  useEffect(() => {
    window.__cloudpartyGraphEditor = { session, getGraph: () => session.store.getState().graph, getCompile: () => resultRef.current };
    return () => { delete window.__cloudpartyGraphEditor; };
  }, [session]);

  // Übersetzen (entprellt)
  const resultRef = useRef<CompileResult | null>(null);
  useEffect(() => {
    const run = () => {
      let r: CompileResult;
      try { r = compileGraph(graph); } catch (err) { r = { source: '', errors: [{ message: `Der Graph konnte nicht übersetzt werden: ${(err as Error).message}` }], warnings: [] }; }
      resultRef.current = r;
      setResult(r);
    };
    if (!resultRef.current) { run(); return; }
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [graph]);

  // Fremde Änderungen übernehmen, solange nichts Ungespeichertes vorliegt
  const remote = entity?.graph;
  useEffect(() => {
    const st = session.store.getState();
    const next = remote ?? emptyGraph();
    if (sameGraph(next, st.baseline)) return;
    if (!st.dirty) session.load(next, true);
    else session.markSaved(next);
  }, [remote, session]);

  const issues = useMemo(() => {
    const m = new Map<string, 'error' | 'warning'>();
    for (const w of result?.warnings ?? []) if (w.nodeId) m.set(w.nodeId, 'warning');
    for (const e of result?.errors ?? []) if (e.nodeId) m.set(e.nodeId, 'error');
    return m;
  }, [result]);

  const save = useCallback((): boolean => {
    if (!ctx.store.getState().entities[entityId]) return false;
    const g = session.store.getState().graph;
    ctx.store.getState().updateEntity(entityId, { graph: g }, { source: 'local' });
    session.markSaved(g);
    return true;
  }, [ctx, entityId, session]);
  const saveRef = useRef(save);
  saveRef.current = save;

  const saveAndTest = () => {
    if (!save()) return;
    const r = resultRef.current;
    if (r && r.errors.length) ctx.bus.emit('ui.toast', { text: 'Der Graph enthält Fehler und wird nicht laufen.', kind: 'error' });
    ctx.store.getState().setMode('play');
  };

  const requestClose = () => (dirty ? setConfirm({ message: 'Ungespeicherte Änderungen verwerfen?', yes: closeGraph }) : closeGraph());

  const deleteGraph = () => setConfirm({
    message: 'Den Graphen dieses Objekts wirklich löschen?',
    yes: () => {
      ctx.store.getState().updateEntity(entityId, { graph: undefined }, { source: 'local' });
      session.load(emptyGraph(), true);
    },
  });

  const loadExample = (g: GraphSpec, title: string) => {
    setTplOpen(false);
    const apply = () => { session.load(structuredClone(g)); requestAnimationFrame(() => controls.current?.fit()); };
    if (session.store.getState().graph.nodes.length > 0) setConfirm({ message: `Den Graphen durch die Vorlage „${title}“ ersetzen?`, yes: apply });
    else apply();
  };

  const onKey = (e: RKey) => {
    e.stopPropagation();
    if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current(); }
  };

  // Ziehen / Größe
  const drag = useRef<{ kind: 'move' | 'size'; px: number; py: number; rect: Rect } | null>(null);
  const startDrag = (kind: 'move' | 'size') => (e: RPtr) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, label')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, px: e.clientX, py: e.clientY, rect };
  };
  const moveDrag = (e: RPtr) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (d.kind === 'move') setRect({ ...d.rect, x: Math.min(Math.max(d.rect.x + dx, 80 - d.rect.w), vw - 80), y: Math.min(Math.max(d.rect.y + dy, 0), vh - 40) });
    else setRect({ ...d.rect, w: Math.min(Math.max(MIN_W, d.rect.w + dx), vw - d.rect.x), h: Math.min(Math.max(MIN_H, d.rect.h + dy), vh - d.rect.y) });
  };
  const endDrag = () => { drag.current = null; };
  const maximize = () => setRect({ x: 8, y: 8, w: window.innerWidth - 16, h: window.innerHeight - 16 });

  // Fokus im Fenster halten (sonst lösen Tasten Welt-Kürzel aus), etwa nachdem die Bestätigungsleiste verschwindet
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || a === document.body || !rootRef.current?.contains(a)) {
        if (!a || a === document.body) rootRef.current?.querySelector<HTMLElement>('.ge-canvas')?.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [confirm, tplOpen, tab]);

  const name = entity?.name ?? entityId;
  const errors = result?.errors ?? [];
  const warnings = result?.warnings ?? [];
  const nIssues = errors.length + warnings.length;

  return (
    <div ref={rootRef} className="cp-panel ge-window" data-testid="graph-editor" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} onKeyDown={onKey} onKeyUp={onKey} onKeyPress={onKey}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('input, select, textarea, button, .ge-canvas')) rootRef.current?.querySelector<HTMLElement>('.ge-canvas')?.focus(); }}>
      <div className="ge-titlebar" data-testid="graph-titlebar" onPointerDown={startDrag('move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onDoubleClick={maximize}>
        <span className="cp-title ge-title">Logik: {name}</span>
        <span className={`ge-dirty ${dirty ? 'ge-dirty-on' : ''}`} data-testid="graph-dirty">{dirty ? '● Ungespeichert' : '✓ Gespeichert'}</span>
        <button type="button" className="cp-button ge-close" data-testid="graph-close" onClick={requestClose}>Schließen</button>
      </div>

      <div className="ge-actions">
        <button type="button" className="cp-button" data-testid="graph-save" title="Strg+S" onClick={() => save()}>Speichern</button>
        <button type="button" className="cp-button cp-button-primary" data-testid="graph-save-test" onClick={saveAndTest}>Speichern &amp; Testen</button>
        <label className="ge-check"><input type="checkbox" data-testid="graph-enabled" checked={graph.enabled} onChange={(e) => session.setEnabled(e.target.checked)} /> Graph aktiv</label>
        <span className="ge-sep" />
        <button type="button" className="cp-button" data-testid="graph-add" onClick={() => { setTab('graph'); controls.current?.openPalette(); }}>Knoten hinzufügen</button>
        <div className="ge-menu">
          <button type="button" className="cp-button" data-testid="graph-templates" aria-expanded={tplOpen} onClick={() => setTplOpen(!tplOpen)}>Vorlagen ▾</button>
          {tplOpen && (
            <div className="ge-menu-list" data-testid="graph-templates-list">
              {GRAPH_EXAMPLES.length === 0 && <div className="cp-muted ge-menu-empty">Noch keine Vorlagen vorhanden.</div>}
              {GRAPH_EXAMPLES.map((ex) => (
                <button key={ex.id} type="button" className="ge-menu-item" data-testid={`template-${ex.id}`} onClick={() => loadExample(ex.graph, ex.title)}>
                  <strong>{ex.title}</strong><span className="cp-muted">{ex.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="cp-button" data-testid="graph-layout" onClick={() => session.commit(autoLayout(session.store.getState().graph))} title="Knoten nach Ablauf anordnen">Anordnen</button>
        <button type="button" className="cp-button" disabled={!canUndo} data-testid="graph-undo" title="Strg+Z" onClick={() => session.undo()}>↶</button>
        <button type="button" className="cp-button" disabled={!canRedo} data-testid="graph-redo" title="Strg+Y" onClick={() => session.redo()}>↷</button>
        <button type="button" className="cp-button cp-button-danger" data-testid="graph-delete" onClick={deleteGraph} disabled={!entity?.graph && graph.nodes.length === 0}>Graph löschen</button>
        <div className="ge-tabs" role="tablist">
          {([['graph', 'Graph'], ['code', 'Code'], ['ai', 'KI']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`graph-tab-${id}`} className={`cp-button ge-tab ${tab === id ? 'cp-button-active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      {entity?.script && <div className="ge-note" data-testid="graph-script-hint">Dieses Objekt hat auch ein Skript – der Graph hat Vorrang.</div>}
      {confirm && (
        <div className="ge-confirm" data-testid="graph-confirm" role="alertdialog">
          <span>{confirm.message}</span>
          <button type="button" className="cp-button cp-button-primary" data-testid="graph-confirm-yes" onClick={() => { const y = confirm.yes; setConfirm(null); y(); }}>Ja</button>
          <button type="button" className="cp-button" data-testid="graph-confirm-no" onClick={() => setConfirm(null)}>Abbrechen</button>
        </div>
      )}

      <div className="ge-body">
        <div className="ge-pane" style={{ display: tab === 'graph' ? 'flex' : 'none' }}>
          <Canvas session={session} issues={issues} controlsRef={controls} allDefs={NODE_DEFS} />
        </div>
        {tab === 'code' && (
          <div className="ge-code-pane" data-testid="graph-code">
            <div className="ge-code-head">
              <span className="cp-muted">Erzeugtes Skript (nur lesbar)</span>
              <button type="button" className="cp-button ge-small" disabled={!result?.source} data-testid="graph-copy" onClick={() => { void navigator.clipboard?.writeText(result?.source ?? ''); ctx.bus.emit('ui.toast', { text: 'Code kopiert.', kind: 'info' }); }}>Kopieren</button>
            </div>
            <pre className="ge-code">{result?.source ? result.source : errors.length ? 'Kein Code – der Graph enthält Fehler (siehe unten).' : 'Noch kein Code.'}</pre>
          </div>
        )}
        <div className="ge-pane" style={{ display: tab === 'ai' ? 'flex' : 'none', overflow: 'auto', padding: 10 }}>
          <GraphAiPanel entityId={entityId} entityName={name} graph={graph} onApply={(g) => { session.load(g); setTab('graph'); requestAnimationFrame(() => controls.current?.fit()); }} />
        </div>
      </div>

      <div className="ge-issues" data-testid="graph-issues">
        <div className="ge-bar">
          <button type="button" className="ge-fold" aria-expanded={issuesOpen} onClick={() => setIssuesOpen(!issuesOpen)}>{issuesOpen ? '▾' : '▸'} Probleme</button>
          {errors.length > 0 && <span className="ge-badge ge-badge-error">{errors.length} Fehler</span>}
          {warnings.length > 0 && <span className="ge-badge ge-badge-warn">{warnings.length} Warnungen</span>}
          {nIssues === 0 && <span className="ge-badge ge-badge-ok">Keine Probleme</span>}
          <span className="ge-spacer" />
          <span className="cp-muted ge-count">{graph.nodes.length} Knoten · {graph.edges.length} Verbindungen</span>
        </div>
        {issuesOpen && nIssues > 0 && (
          <ul className="ge-issue-list">
            {[...errors.map((i) => ({ i, k: 'error' as const })), ...warnings.map((i) => ({ i, k: 'warning' as const }))].map(({ i, k }, n) => (
              <li key={n}>
                <button type="button" className={`ge-issue ge-issue-${k}`} data-testid="graph-issue" data-kind={k} onClick={() => { if (i.nodeId) { setTab('graph'); controls.current?.focusNode(i.nodeId); } }}>
                  <span>{k === 'error' ? '✕' : '!'}</span>{i.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LogArea entityId={entityId} mode={mode} open={logOpen} setOpen={setLogOpen} />
      <div className="ge-resize" data-testid="graph-resize" onPointerDown={startDrag('size')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
    </div>
  );
}

function LogArea({ entityId, mode, open, setOpen }: { entityId: string; mode: string; open: boolean; setOpen(o: boolean): void }) {
  useSyncExternalStore(graphLog.subscribe, () => graphLog.version);
  const lines = graphLog.getLines(entityId);
  const status = graphLog.getStatus(entityId);
  return (
    <div className="ge-log" data-testid="graph-log">
      <div className="ge-bar">
        <button type="button" className="ge-fold" aria-expanded={open} data-testid="graph-log-toggle" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Ausgabe</button>
        {status ? <span className={`ge-badge ge-badge-${status.status === 'running' ? 'ok' : status.status === 'error' ? 'error' : 'idle'}`}>{STATUS_LABEL[status.status]}</span> : <span className="ge-badge ge-badge-idle">Unbekannt</span>}
        {status?.message && <span className="ge-status-msg" title={status.message}>{status.message}</span>}
        {mode === 'build' && <span className="cp-muted ge-count">Skripte laufen nur im Spielmodus</span>}
        <span className="ge-spacer" />
        <button type="button" className="cp-button ge-small" onClick={() => graphLog.clear(entityId)}>Leeren</button>
      </div>
      {open && (
        <div className="ge-loglines">
          {lines.length === 0 && <div className="cp-muted">Noch keine Ausgaben.</div>}
          {lines.map((l, i) => (
            <div key={i} className={`ge-line${l.level === 'error' ? ' ge-line-error' : ''}`}><span className="cp-muted">{time(l.ts)}</span> {l.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}
