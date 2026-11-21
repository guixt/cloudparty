/**
 * Paket 28: Plan-Editor. Knopf „Plan“ (Build-Modus), Kürzel `P`, öffnet auch auf `ui.openPlan`.
 * Testzugang im Browser: `window.__cloudpartyPlanEditor` = { getSelected(), getPlanId() } (solange offen).
 */
import { useStore } from 'zustand';
import type { GameModule } from '../../core/context';
import type { PanelProps } from '../../core/ui';
import PlanWindow from './PlanWindow';
import { closePlan, openPlan, planUi } from './ui';
import './plan.css';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.closest?.('[contenteditable="true"], .cm-editor, .pe-window');
}

function ToolbarButton({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const open = useStore(planUi, (s) => s.open);
  if (mode !== 'build') return null;
  return (
    <button type="button" className={`cp-button ${open ? 'cp-button-active' : ''}`} data-testid="plan-toggle" title="Bauplan (P)" onClick={() => (open ? closePlan() : openPlan())}>
      Plan
    </button>
  );
}

function Overlay({ ctx }: PanelProps) {
  const open = useStore(planUi, (s) => s.open);
  if (!open) return null;
  return <PlanWindow ctx={ctx} />;
}

let cleanups: Array<() => void> = [];

const mod: GameModule = {
  id: 'plan-editor',
  init(ctx) {
    cleanups.push(
      ctx.bus.on('ui.openPlan', ({ planId }) => openPlan(planId)),
      ctx.ui.register({ id: 'plan-editor-button', slot: 'toolbar', order: 36, component: ToolbarButton }),
      ctx.ui.register({ id: 'plan-editor-window', slot: 'overlay', order: 53, component: Overlay }),
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
      if (isTyping(event.target) || isTyping(document.activeElement)) return;
      if (ctx.store.getState().mode !== 'build') return;
      event.preventDefault();
      if (planUi.getState().open) closePlan();
      else openPlan();
    };
    window.addEventListener('keydown', onKey);
    cleanups.push(() => window.removeEventListener('keydown', onKey));
  },
  dispose() {
    for (const c of cleanups) c();
    cleanups = [];
    closePlan();
  },
};
export default mod;
