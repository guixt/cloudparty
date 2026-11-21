/**
 * Plan-Ausführung (Paket 29): hört auf 'plan.run.request' (aus dem Plan-Fenster) und reiht Knoten in die
 * Auftragswarteschlange des KI-Assistenten ein – auch während die KI schon arbeitet. Öffnet dazu das KI-Fenster,
 * damit Fortschritt und Rückfragen sichtbar sind.
 */
import type { GameModule } from '../../core/context';
import { getAssistant } from '../../ai/core';
import { aiStore, getActiveController, setOpen } from '../../ai/ui/state';
import { resetTransientStatuses } from '../core/api';
import { createRunQueue, type RunQueue } from './queue';
import type { RunDeps } from './runner';

let cleanups: Array<() => void> = [];
let queue: RunQueue | null = null;

const mod: GameModule = {
  id: 'plan-run',
  init(ctx) {
    const toast = (text: string, kind?: 'info' | 'error') => ctx.bus.emit('ui.toast', { text, kind });
    queue = createRunQueue(
      ctx,
      (): RunDeps | null => {
        const controller = getActiveController();
        const api = (globalThis as { __cloudpartyAiMock?: ReturnType<typeof getAssistant> }).__cloudpartyAiMock ?? getAssistant();
        if (!controller || !api) return null;
        const usage = () => aiStore.getState().usage;
        return {
          runPrompt: (prompt, hooks) => controller.enqueuePrompt(prompt, hooks),
          resetContext: () => api.resetConversation(),
          lastRunTokens: () => (usage()?.inputTokens ?? 0) + (usage()?.outputTokens ?? 0),
          notify: toast,
        };
      },
      toast,
      () => setOpen(true),
    );
    cleanups.push(
      ctx.bus.on('plan.run.request', (req) => queue?.request(req)),
      // Neue Welt geladen: „wartet“/„läuft“ sind Überbleibsel, es läuft ja nichts mehr.
      ctx.bus.on('world.loaded', () => resetTransientStatuses(ctx)),
    );
    resetTransientStatuses(ctx);
  },
  dispose() {
    for (const c of cleanups) c();
    cleanups = [];
    queue = null;
  },
};
export default mod;
