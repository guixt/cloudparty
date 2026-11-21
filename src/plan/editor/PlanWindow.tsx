/** Fenster „Plan“: Kopfzeile, Arbeitsfläche mit Knoten und Kanten, Seitenleiste für den gewählten Knoten. */
import { bringToFront, useWindowZ } from '../../core/windowStack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as RKey, PointerEvent as RPtr } from 'react';
import { useStore } from 'zustand';
import { PLAN_LIMITS, type PlanNode, type PlanSpec } from '../../../shared/plan';
import type { GameContext } from '../../core/context';
import { PlanError, addEdge, addNode, createPlan, deletePlan, listPlans, removeEdge, removeNode, renamePlan, updateNode, type PlanCtx } from '../core/api';
import { NODE_H, NODE_W, edgePath, entityCount, fitView, inPort, outPort, previewNotes, progressText, runAllBlockReason, runBlockReason, screenToWorld, zoomAt, STATUS_LABEL, type Pt, type View } from './logic';
import { closePlan, planUi } from './ui';

interface Rect { x: number; y: number; w: number; h: number }
type Drag =
  | { kind: 'pan'; sx: number; sy: number; v: View; moved: boolean }
  | { kind: 'node'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: 'link'; from: string };

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable);
};

export default function PlanWindow({ ctx }: { ctx: GameContext }) {
  const pctx = useMemo<PlanCtx>(() => ({ store: ctx.store, bus: ctx.bus }), [ctx]);
  const canBuild = useStore(ctx.store, (s) => s.canBuild);
  const wantedId = useStore(planUi, (s) => s.planId);
  const [plans, setPlans] = useState<PlanSpec[]>(() => listPlans(pctx));
  const [selected, setSelected] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
  const [override, setOverride] = useState<Record<string, Pt>>({});
  const [pending, setPending] = useState<{ from: string; to: Pt } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const z = useWindowZ('plan');
  useEffect(() => bringToFront('plan'), []);
  const [rect, setRect] = useState<Rect>(() => ({ x: 80, y: 70, w: Math.min(980, Math.max(420, window.innerWidth - 120)), h: Math.min(640, Math.max(340, window.innerHeight - 160)) }));
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef<string | null>(null);

  const plan = plans.find((p) => p.id === wantedId) ?? plans[0];
  const planId = plan?.id ?? null;
  const planRef = useRef(plan);
  planRef.current = plan;
  const node = plan?.nodes.find((n) => n.id === selected);

  const toast = useCallback((e: unknown) => {
    ctx.bus.emit('ui.toast', { text: e instanceof PlanError ? e.message : 'Das hat nicht geklappt.', kind: 'error' });
  }, [ctx]);
  const act = useCallback(<T,>(fn: () => T): T | undefined => {
    try { return fn(); } catch (e) { toast(e); return undefined; }
  }, [toast]);

  useEffect(() => {
    const reload = () => setPlans(listPlans(pctx));
    const offs = [ctx.bus.on('plan.changed', reload), ctx.bus.on('world.loaded', reload)];
    reload();
    return () => offs.forEach((o) => o());
  }, [ctx, pctx]);

  useEffect(() => { if (selected && !node) setSelected(null); }, [selected, node]);
  useEffect(() => { setSelEdge(null); }, [planId]);

  // Testzugang
  useEffect(() => {
    const w = window as unknown as { __cloudpartyPlanEditor?: unknown };
    w.__cloudpartyPlanEditor = { getSelected: () => selected, getPlanId: () => planId };
    return () => { delete w.__cloudpartyPlanEditor; };
  }, [selected, planId]);

  // Beim Planwechsel einpassen
  useEffect(() => {
    if (!plan || fitted.current === plan.id) return;
    fitted.current = plan.id;
    const el = canvasRef.current;
    setView(fitView(plan.nodes, { w: el?.clientWidth || 600, h: el?.clientHeight || 400 }));
  }, [plan]);

  // Mausrad = Zoomen
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      setView(zoomAt(v, { x: e.clientX - r.left, y: e.clientY - r.top }, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const toWorld = (e: { clientX: number; clientY: number }): Pt => screenToWorld(viewRef.current, local(e));
  const pos = (n: PlanNode): Pt => override[n.id] ?? n;

  const capture = (id: number) => { try { canvasRef.current?.setPointerCapture?.(id); } catch { /* Zeiger schon weg */ } };
  const onCanvasDown = (e: RPtr) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    canvasRef.current?.focus();
    const port = t.closest<HTMLElement>('[data-port="out"]');
    const nodeEl = t.closest<HTMLElement>('[data-node-id]');
    const edgeEl = t.closest<SVGElement>('[data-edge]');
    if (port && canBuild) {
      capture(e.pointerId);
      drag.current = { kind: 'link', from: port.dataset.node as string };
      setPending({ from: port.dataset.node as string, to: toWorld(e) });
      return;
    }
    if (nodeEl && plan) {
      const n = plan.nodes.find((x) => x.id === nodeEl.dataset.nodeId);
      if (!n) return;
      setSelected(n.id);
      setSelEdge(null);
      if (!canBuild) return;
      capture(e.pointerId);
      const w = toWorld(e);
      drag.current = { kind: 'node', id: n.id, sx: w.x, sy: w.y, ox: n.x, oy: n.y, moved: false };
      return;
    }
    if (edgeEl) { setSelEdge(edgeEl.getAttribute('data-edge')); setSelected(null); return; }
    setSelected(null);
    setSelEdge(null);
    capture(e.pointerId);
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: viewRef.current, moved: false };
  };
  const onCanvasMove = (e: RPtr) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') setView({ ...d.v, x: d.v.x + e.clientX - d.sx, y: d.v.y + e.clientY - d.sy });
    else if (d.kind === 'node') {
      const w = toWorld(e);
      if (!d.moved && Math.hypot(w.x - d.sx, w.y - d.sy) < 3) return;
      d.moved = true;
      setOverride({ [d.id]: { x: Math.round(d.ox + w.x - d.sx), y: Math.round(d.oy + w.y - d.sy) } });
    } else setPending({ from: d.from, to: toWorld(e) });
  };
  const onCanvasUp = (e: RPtr) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !plan) return;
    if (d.kind === 'node' && d.moved) {
      const p = override[d.id];
      if (p) act(() => updateNode(pctx, plan.id, d.id, { x: p.x, y: p.y }));
      setOverride({});
    } else if (d.kind === 'link') {
      setPending(null);
      const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-port="in"]') : null;
      const to = hit?.dataset.node;
      if (to && to !== d.from) act(() => addEdge(pctx, plan.id, { from: d.from, to }));
    }
  };

  const onCanvasDouble = (e: React.MouseEvent) => {
    if (!plan || !canBuild || (e.target as HTMLElement).closest('[data-node-id], [data-edge], button')) return;
    const w = toWorld(e);
    const n = act(() => addNode(pctx, plan.id, { title: 'Neuer Schritt', x: Math.round(w.x - NODE_W / 2), y: Math.round(w.y - NODE_H / 2) }));
    if (n) setSelected(n.id);
  };

  const onKey = (e: RKey) => {
    e.stopPropagation();
    if (e.type !== 'keydown' || (e.key !== 'Delete' && e.key !== 'Backspace') || isTyping(e.target) || !plan || !canBuild) return;
    if (selEdge) {
      const [from, to] = selEdge.split('>');
      e.preventDefault();
      act(() => removeEdge(pctx, plan.id, { from, to }));
      setSelEdge(null);
    } else if (selected) {
      e.preventDefault();
      act(() => removeNode(pctx, plan.id, selected));
      setSelected(null);
    }
  };

  const newPlan = () => {
    const p = act(() => createPlan(pctx, 'Neuer Plan', [{ title: 'Erster Schritt' }]));
    if (p) { planUi.setState({ planId: p.id }); setSelected(null); }
  };
  const removePlan = () => {
    if (!plan) return;
    setConfirmDel(false);
    act(() => deletePlan(pctx, plan.id));
    planUi.setState({ planId: null });
  };
  const addStep = () => {
    if (!plan) return;
    const n = act(() => addNode(pctx, plan.id, { title: 'Neuer Schritt' }));
    if (n) setSelected(n.id);
  };

  // Fenster ziehen
  const wdrag = useRef<{ px: number; py: number; r: Rect } | null>(null);
  const edges = plan?.edges ?? [];
  const nodeById = (id: string) => plan?.nodes.find((n) => n.id === id);

  const runAllReason = plan ? runAllBlockReason(plan, canBuild) : 'Kein Plan.';

  return (
    <div ref={rootRef} className="cp-panel pe-window" data-testid="plan-editor" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }} onPointerDownCapture={() => bringToFront('plan')} onKeyDown={onKey} onKeyUp={onKey} onKeyPress={onKey}>
      <div className="pe-titlebar"
        onPointerDown={(e) => { if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select')) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); wdrag.current = { px: e.clientX, py: e.clientY, r: rect }; }}
        onPointerMove={(e) => { const d = wdrag.current; if (d) setRect({ ...d.r, x: Math.min(Math.max(d.r.x + e.clientX - d.px, 80 - d.r.w), window.innerWidth - 80), y: Math.min(Math.max(d.r.y + e.clientY - d.py, 0), window.innerHeight - 40) }); }}
        onPointerUp={() => { wdrag.current = null; }} onPointerCancel={() => { wdrag.current = null; }}>
        <span className="cp-title">Plan</span>
        {plans.length > 0 && (
          <select className="pe-select" data-testid="plan-select" value={planId ?? ''} onChange={(e) => { planUi.setState({ planId: e.target.value }); setSelected(null); }}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
        {plan && <span className="pe-progress" data-testid="plan-progress">{progressText(plan)}</span>}
        <span className="pe-spacer" />
        <button type="button" className="cp-button pe-close" data-testid="plan-close" onClick={closePlan}>Schließen</button>
      </div>

      <div className="pe-actions">
        <button type="button" className="cp-button" data-testid="plan-new" disabled={!canBuild} onClick={newPlan}>Neuer Plan</button>
        {plan && (
          <>
            <button type="button" className="cp-button" data-testid="plan-rename" disabled={!canBuild} onClick={() => setRenaming(plan.title)}>Umbenennen</button>
            <button type="button" className="cp-button cp-button-danger" data-testid="plan-delete" disabled={!canBuild} onClick={() => setConfirmDel(true)}>Löschen</button>
            <span className="pe-sep" />
            <button type="button" className="cp-button" data-testid="plan-add-node" disabled={!canBuild || plan.nodes.length >= PLAN_LIMITS.nodes} onClick={addStep}>+ Knoten</button>
            <button type="button" className="cp-button cp-button-primary" data-testid="plan-run-all" disabled={runAllReason !== null} title={runAllReason ?? 'Alle offenen Knoten der Reihe nach ausführen'}
              onClick={() => ctx.bus.emit('plan.run.request', { planId: plan.id })}>Alle ausführen</button>
            <button type="button" className="cp-button" data-testid="plan-review" title="Prüft das Ergebnis mit dem Prüfmodell (KI-Einstellungen › Modelle) und ergänzt bei Mängeln Knoten" disabled={!canBuild} onClick={() => ctx.bus.emit('plan.run.request', { planId: plan.id, review: true })}>Prüfen</button>
          </>
        )}
      </div>

      {!canBuild && <div className="pe-note" data-testid="plan-readonly">Auf dieser Insel darfst du nicht bauen: Bearbeiten und Ausführen sind gesperrt.</div>}
      {renaming !== null && plan && (
        <form className="pe-confirm" onSubmit={(e) => { e.preventDefault(); act(() => renamePlan(pctx, plan.id, renaming)); setRenaming(null); }}>
          <input className="pe-input" data-testid="plan-rename-input" autoFocus maxLength={PLAN_LIMITS.title} value={renaming} onChange={(e) => setRenaming(e.target.value)} />
          <button type="submit" className="cp-button cp-button-primary" data-testid="plan-rename-ok">Speichern</button>
          <button type="button" className="cp-button" onClick={() => setRenaming(null)}>Abbrechen</button>
        </form>
      )}
      {confirmDel && plan && (
        <div className="pe-confirm" role="alertdialog" data-testid="plan-confirm">
          <span>Den Plan „{plan.title}“ wirklich löschen?</span>
          <button type="button" className="cp-button cp-button-danger" data-testid="plan-confirm-yes" onClick={removePlan}>Ja, löschen</button>
          <button type="button" className="cp-button" onClick={() => setConfirmDel(false)}>Abbrechen</button>
        </div>
      )}

      <div className="pe-body">
        <div ref={canvasRef} className="pe-canvas" tabIndex={0} data-testid="plan-canvas" onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp} onDoubleClick={onCanvasDouble}>
          {plan && (
            <div className="pe-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
              <svg className="pe-wires" width="1" height="1">
                {edges.map((ed) => {
                  const a = nodeById(ed.from), b = nodeById(ed.to);
                  if (!a || !b) return null;
                  const key = `${ed.from}>${ed.to}`;
                  const d = edgePath(outPort(pos(a)), inPort(pos(b)));
                  return (
                    <g key={key}>
                      <path className={`pe-wire${selEdge === key ? ' pe-wire-sel' : ''}`} d={d} />
                      <path className="pe-wire-hit" data-edge={key} data-testid="plan-edge" d={d} />
                    </g>
                  );
                })}
                {pending && nodeById(pending.from) && <path className="pe-wire pe-wire-pending" d={edgePath(outPort(pos(nodeById(pending.from) as PlanNode)), pending.to)} />}
              </svg>
              {plan.nodes.map((n) => {
                const p = pos(n);
                return (
                  <div key={n.id} className={`pe-node pe-s-${n.status}${selected === n.id ? ' pe-node-selected' : ''}`} data-testid="plan-node" data-node-id={n.id} data-status={n.status} style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}>
                    <span className="pe-port pe-port-in" data-port="in" data-node={n.id} />
                    <span className="pe-port pe-port-out" data-port="out" data-node={n.id} data-testid="plan-port-out" />
                    <div className="pe-node-head">
                      <span className="pe-node-title" title={n.title}>{n.title}</span>
                      <span className={`pe-badge pe-badge-${n.status}`}>{STATUS_LABEL[n.status]}</span>
                    </div>
                    <div className="pe-node-notes">{previewNotes(n.notes) || <span className="cp-muted">Keine Notizen</span>}</div>
                    {entityCount(n) > 0 && <div className="pe-node-count">{entityCount(n)} Objekte gebaut</div>}
                  </div>
                );
              })}
            </div>
          )}
          {!plan && (
            <div className="pe-empty" data-testid="plan-empty">
              <strong>Noch kein Plan.</strong>
              <span>Bitte die KI: „Plane den Bau eines Hauses“ oder lege selbst einen an.</span>
            </div>
          )}
          {plan && (
            <div className="pe-zoombar">
              <button type="button" className="cp-button" onClick={() => setView(fitView(plan.nodes, { w: canvasRef.current?.clientWidth || 600, h: canvasRef.current?.clientHeight || 400 }))}>Einpassen</button>
              <span className="pe-zoomval">{Math.round(view.zoom * 100)} %</span>
            </div>
          )}
        </div>

        {plan && node && (
          <Sidebar key={node.id} ctx={ctx} pctx={pctx} plan={plan} node={node} canBuild={canBuild} act={act} />
        )}
      </div>
      <div className="pe-resize" onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); wdrag.current = { px: e.clientX, py: e.clientY, r: rect }; (e.currentTarget as HTMLElement).dataset.sz = '1'; }}
        onPointerMove={(e) => { const d = wdrag.current; if (d && (e.currentTarget as HTMLElement).dataset.sz) setRect({ ...d.r, w: Math.max(420, d.r.w + e.clientX - d.px), h: Math.max(340, d.r.h + e.clientY - d.py) }); }}
        onPointerUp={(e) => { wdrag.current = null; delete (e.currentTarget as HTMLElement).dataset.sz; }} />
    </div>
  );
}

interface SideProps {
  ctx: GameContext;
  pctx: PlanCtx;
  plan: PlanSpec;
  node: PlanNode;
  canBuild: boolean;
  act: <T>(fn: () => T) => T | undefined;
}

function Sidebar({ ctx, pctx, plan, node, canBuild, act }: SideProps) {
  const [title, setTitle] = useState(node.title);
  const [notes, setNotes] = useState(node.notes);
  useEffect(() => { setTitle(node.title); }, [node.title]);
  useEffect(() => { setNotes(node.notes); }, [node.notes]);
  const reason = runBlockReason(plan, node.id, canBuild);
  const patch = (p: Parameters<typeof updateNode>[3]) => act(() => updateNode(pctx, plan.id, node.id, p));
  const commitTitle = () => { if (title !== node.title && patch({ title }) === undefined) setTitle(node.title); };
  const commitNotes = () => { if (notes !== node.notes) patch({ notes }); };
  const ids = node.result?.entityIds ?? [];
  const showObjects = () => {
    const st = ctx.store.getState();
    st.selectMany(ids.filter((id) => !!st.entities[id]));
  };
  const s = node.status;
  return (
    <aside className="pe-side" data-testid="plan-sidebar">
      <label className="pe-field"><span>Titel</span>
        <input className="pe-input" data-testid="plan-node-title" value={title} maxLength={PLAN_LIMITS.title} disabled={!canBuild} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </label>
      <label className="pe-field"><span>Notizen ({notes.length}/{PLAN_LIMITS.notes})</span>
        <textarea className="pe-input pe-notes" data-testid="plan-node-notes" value={notes} maxLength={PLAN_LIMITS.notes} disabled={!canBuild} rows={6} onChange={(e) => setNotes(e.target.value)} onBlur={commitNotes} />
      </label>
      <div className="pe-field"><span>Status</span>
        <div><span className={`pe-badge pe-badge-${s}`} data-testid="plan-node-status">{STATUS_LABEL[s]}</span></div>
        <div className="pe-btnrow">
          {(s === 'open' || s === 'failed') && <button type="button" className="cp-button" data-testid="plan-disable" disabled={!canBuild} onClick={() => patch({ status: 'disabled' })}>Deaktivieren</button>}
          {s === 'disabled' && <button type="button" className="cp-button" data-testid="plan-enable" disabled={!canBuild} onClick={() => patch({ status: 'open' })}>Aktivieren</button>}
          {(s === 'done' || s === 'failed') && <button type="button" className="cp-button" data-testid="plan-reset" disabled={!canBuild} onClick={() => patch({ status: 'open', result: null })}>{s === 'failed' ? 'Zurücksetzen auf offen' : 'Als offen zurücksetzen'}</button>}
        </div>
      </div>
      {node.result && (
        <div className="pe-field" data-testid="plan-result"><span>Ergebnis</span>
          <p className="pe-result">{node.result.summary || 'Ohne Zusammenfassung.'}</p>
          <p className="cp-muted">{ids.length} Objekte</p>
        </div>
      )}
      <div className="pe-btnrow">
        <button type="button" className="cp-button cp-button-primary" data-testid="plan-run-node" disabled={reason !== null} title={reason ?? 'Diesen Knoten ausführen'}
          onClick={() => ctx.bus.emit('plan.run.request', { planId: plan.id, nodeId: node.id })}>Ausführen</button>
        <button type="button" className="cp-button" data-testid="plan-show-objects" disabled={ids.length === 0} onClick={showObjects}>Objekte zeigen</button>
      </div>
    </aside>
  );
}
