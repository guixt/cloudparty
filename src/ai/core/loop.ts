/** Der Assistent: Gesprächsverlauf, Tool-Use-Schleife, Undo-Gruppe. */
import { AI_LIMITS, AI_MODELS, AI_TOOLS } from '../../../shared/aiTools';
import type { Vec3 } from '../../../shared/types';
import type { AssistantApi, AssistantEvent, RunOptions } from '../api';
import type { EventBus } from '../../core/events';
import type { WorldStore } from '../../core/store';
import { AiError, streamMessage, type ApiMessage, type ApiTool, type ContentBlock } from './client';
import { buildSystemPrompt } from './prompt';
import * as settings from './settings';
import { executeTool, type RunCounters } from './tools';

/** Höchstens so viele Nachrichten (≈ 20 Gesprächsrunden) bleiben zwischen Aufträgen erhalten. */
export const MAX_HISTORY_MESSAGES = 40;

export interface HistoryLike {
  undo(): boolean;
  readonly undoCount: number;
}
export interface AssistantDeps {
  store: WorldStore;
  bus: EventBus;
  getAvatar(): { position: Vec3; yaw: number } | null;
  getHistory(): HistoryLike | null;
}

const TOOLS: ApiTool[] = AI_TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

export function createAssistant(deps: AssistantDeps): AssistantApi {
  const { store, bus } = deps;
  let conversation: ApiMessage[] = [];
  let running = false;
  let confirmCounter = 0;
  /** Undo-Stand direkt nach dem letzten verändernden Auftrag (null = nichts rückgängig zu machen). */
  let lastGroupUndoCount: number | null = null;

  function remember(prompt: string, answer: string) {
    conversation.push({ role: 'user', content: prompt }, { role: 'assistant', content: answer || '(Auftrag ausgeführt)' });
    if (conversation.length > MAX_HISTORY_MESSAGES) conversation = conversation.slice(conversation.length - MAX_HISTORY_MESSAGES);
    while (conversation.length > 0 && conversation[0].role !== 'user') conversation.shift();
  }

  async function run(prompt: string, options: RunOptions): Promise<void> {
    const emit = (event: AssistantEvent) => {
      try {
        options.onEvent(event);
      } catch (error) {
        console.error('[ai] onEvent-Fehler', error);
      }
    };
    const text = prompt.trim();
    if (!text) {
      emit({ type: 'done', stopped: false, changed: false });
      return;
    }
    if (running) {
      emit({ type: 'error', message: 'Es läuft bereits ein Auftrag. Bitte warte, bis er fertig ist.' });
      emit({ type: 'done', stopped: true, changed: false });
      return;
    }
    if (!settings.hasApiKey()) {
      emit({ type: 'error', message: 'Kein API-Key hinterlegt. Trage deinen Anthropic-Key in den KI-Einstellungen ein.' });
      emit({ type: 'done', stopped: true, changed: false });
      return;
    }

    running = true;
    const signal = options.signal;
    const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
    const messages: ApiMessage[] = [...conversation, { role: 'user', content: text }];
    let answer = '';
    let changed = false;
    let stopped = false;
    let grouped = false;

    const confirm = async (question: string, detail?: string): Promise<boolean> => {
      confirmCounter += 1;
      emit({ type: 'confirm', id: `c${confirmCounter}`, question, ...(detail !== undefined ? { detail } : {}) });
      try {
        return await options.confirm(question, detail);
      } catch {
        return false;
      }
    };
    // Freigabe-Modus einmal pro Auftrag lesen, damit eine Umstellung mitten im Auftrag nicht halb wirkt.
    const toolCtx = { store, bus, getAvatar: deps.getAvatar, confirm, autoApprove: settings.getApproval() === 'auto' };

    try {
      let finished = false;
      for (let round = 0; round < AI_LIMITS.maxRounds; round++) {
        if (signal?.aborted) {
          stopped = true;
          break;
        }
        const result = await streamMessage({
          system: buildSystemPrompt(store.getState()),
          messages,
          tools: TOOLS,
          maxTokens: AI_LIMITS.maxOutputTokens,
          signal,
          onText: (delta) => {
            answer += delta;
            emit({ type: 'text', delta });
          },
        });
        emit({ type: 'usage', inputTokens: result.inputTokens, outputTokens: result.outputTokens });
        const toolUses = result.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
        if (result.content.length > 0) messages.push({ role: 'assistant', content: result.content });
        if (toolUses.length === 0 || result.stopReason !== 'tool_use') {
          // Bei max_tokens mit unvollständigen Werkzeugaufrufen führen wir nichts aus.
          if (result.stopReason === 'max_tokens') emit({ type: 'error', message: 'Die Antwort der KI wurde abgeschnitten. Versuche einen kleineren Auftrag.' });
          finished = true;
          break;
        }
        const results: ContentBlock[] = [];
        for (const use of toolUses) {
          if (signal?.aborted) {
            stopped = true;
            break;
          }
          let outcome;
          if (counters.toolCalls >= AI_LIMITS.maxToolCalls) {
            outcome = { ok: false, content: `Limit erreicht: höchstens ${AI_LIMITS.maxToolCalls} Werkzeugaufrufe pro Auftrag. Beende den Auftrag jetzt.`, summary: 'Werkzeuglimit erreicht', mutated: false };
          } else {
            counters.toolCalls += 1;
            const def = AI_TOOLS.find((t) => t.name === use.name);
            if (def?.mutates && !grouped && store.getState().canBuild) {
              grouped = true;
              bus.emit('history.group.begin', {});
            }
            outcome = await executeTool(use.name, use.input, toolCtx, counters);
          }
          if (outcome.mutated) changed = true;
          emit({ type: 'tool', name: use.name, summary: outcome.summary, ok: outcome.ok });
          results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.content, ...(outcome.ok ? {} : { is_error: true }) });
        }
        if (stopped) break;
        messages.push({ role: 'user', content: results });
      }
      if (!finished && !stopped) {
        stopped = true;
        emit({ type: 'error', message: `Der Auftrag war zu umfangreich (Grenze von ${AI_LIMITS.maxRounds} Runden erreicht). Das Bisherige bleibt erhalten.` });
      }
    } catch (error) {
      stopped = true;
      if (!(error instanceof AiError && error.aborted)) {
        const message = error instanceof AiError ? error.message : 'Unerwarteter Fehler im KI-Assistenten.';
        emit({ type: 'error', message });
      }
    } finally {
      if (grouped) bus.emit('history.group.end', {});
      running = false;
    }
    if (changed) lastGroupUndoCount = deps.getHistory()?.undoCount ?? null;
    remember(text, answer.trim());
    emit({ type: 'done', stopped, changed });
  }

  return {
    getSettings: () => ({ hasKey: settings.hasApiKey(), model: settings.getModel(), approval: settings.getApproval() }),
    setApproval: (mode) => settings.setApproval(mode),
    setApiKey: (key) => settings.setApiKey(key),
    setModel: (model) => {
      if (AI_MODELS.some((m) => m.id === model)) settings.setModel(model);
    },
    run,
    resetConversation() {
      conversation = [];
    },
    undoLast() {
      const history = deps.getHistory();
      if (!history || lastGroupUndoCount === null || running) return false;
      // Nur rückgängig machen, wenn seither nichts Neues aufgezeichnet wurde.
      if (history.undoCount !== lastGroupUndoCount) return false;
      lastGroupUndoCount = null;
      return history.undo();
    },
  };
}
