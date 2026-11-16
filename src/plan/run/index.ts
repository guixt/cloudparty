/**
 * Plan-Ausführung (Paket 29): hört auf 'plan.run.request' (aus dem Plan-Fenster) und führt Knoten
 * über den KI-Assistenten aus. Öffnet dazu das KI-Fenster, damit Fortschritt und Rückfragen sichtbar sind.
 */
import type { GameModule } from '../../core/context';
import { getAssistant } from '../../ai/core';
import { aiStore, getActiveController, setOpen } from '../../ai/ui/state';
import { blockedReason, runPlan } from './runner';

let cleanups: Array<() => void> = [];
let running = false;

const mod: GameModule = {
  id: 'plan-run',
  init(ctx) {
    cleanups.push(
      ctx.bus.on('plan.run.request', ({ planId, nodeId }) => {
        const toast = (text: string, kind?: 'info' | 'error') => ctx.bus.emit('ui.toast', { text, kind });
        if (running) return toast('Es läuft schon ein Plan-Lauf.', 'error');
        const controller = getActiveController();
        const api = (globalThis as { __cloudpartyAiMock?: ReturnType<typeof getAssistant> }).__cloudpartyAiMock ?? getAssistant();
        if (!controller || !api) return toast('Die KI ist nicht verfügbar.', 'error');
        if (nodeId) {
          const reason = blockedReason(ctx, planId, nodeId);
          if (reason) return toast(reason, 'error');
        }
        setOpen(true);
        running = true;
        const usage = () => aiStore.getState().usage;
        void runPlan(ctx, planId, nodeId, {
          runPrompt: (prompt) => controller.runPrompt(prompt),
          resetContext: () => api.resetConversation(),
          lastRunTokens: () => (usage()?.inputTokens ?? 0) + (usage()?.outputTokens ?? 0),
          notify: toast,
        })
          .then((report) => {
            if (!report.stoppedBecause) toast(`Fertig: ${report.completed.length} Knoten ausgeführt.`);
          })
          .catch((error) => toast(`Der Plan-Lauf ist abgebrochen: ${error instanceof Error ? error.message : String(error)}`, 'error'))
          .finally(() => {
            running = false;
          });
      }),
    );
  },
  dispose() {
    for (const c of cleanups) c();
    cleanups = [];
    running = false;
  },
};
export default mod;
