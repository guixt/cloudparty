/** Der Assistent: Gesprächsverlauf, Tool-Use-Schleife, Undo-Gruppe. */
import { AI_LIMITS, AI_MODELS, AI_TOOLS } from '../../../shared/aiTools';
import type { Vec3 } from '../../../shared/types';
import type { AssistantApi, AssistantEvent, RunOptions } from '../api';
import type { EventBus } from '../../core/events';
import type { WorldStore } from '../../core/store';
import { AiError, streamMessage, type ApiMessage, type ApiTool, type ContentBlock } from './client';
import { dropImages, fitToBudget } from './budget';
import { buildSystemPrompt } from './prompt';
import * as settings from './settings';
import { executeTool, type RunCounters } from './tools';

/** Höchstens so viele Nachrichten (≈ 20 Gesprächsrunden) bleiben zwischen Aufträgen erhalten. */
export const MAX_HISTORY_MESSAGES = 40;

/** So oft darf die Antwort in einem Auftrag abgeschnitten werden, bevor der Assistent aufgibt. */
export const MAX_TRUNCATIONS = 4;
const CONTINUE_TEXT = 'Deine letzte Antwort wurde wegen der Ausgabegrenze abgeschnitten. Mache genau dort weiter, wo du aufgehört hast, und fasse dich kürzer.';
const TRUNCATED_CALL_TEXT = 'Dein Werkzeugaufruf wurde wegen der Ausgabegrenze abgeschnitten und NICHT ausgeführt. Wiederhole genau diesen Schritt in kleineren Teilen (weniger Objekte pro Antwort bzw. ein kürzeres Skript) und fahre dann fort.';

export interface HistoryLike {
  undo(): boolean;
  readonly undoCount: number;
}
export interface AssistantDeps {
  store: WorldStore;
  bus: EventBus;
  getAvatar(): { position: Vec3; yaw: number } | null;
  getHistory(): HistoryLike | null;
  /** Screenshot der Welt (Werkzeug look); fehlt es, sind Screenshots nicht verfügbar. */
  captureView?(req: import('./capture').ViewRequest): Promise<string | null>;
  /** Lädt ein Bild und liefert eine verkleinerte JPEG-Daten-URL (Werkzeug use_image). */
  fetchImage?(url: string): Promise<string | null>;
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
    // Längengrenzen einmal pro Auftrag lesen (wie der Freigabe-Modus).
    const limits = settings.getTokenLimits();
    const currentFrom = conversation.length;
    let answer = '';
    let changed = false;
    let stopped = false;
    let grouped = false;
    let truncations = 0;

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
    const toolCtx = { store, bus, getAvatar: deps.getAvatar, confirm, autoApprove: settings.getApproval() === 'auto', vision: settings.getVision(), captureView: deps.captureView, imageSearch: settings.getImageSearch(), fetchImage: deps.fetchImage };

    try {
      let finished = false;
      for (let round = 0; round < AI_LIMITS.maxRounds; round++) {
        if (signal?.aborted) {
          stopped = true;
          break;
        }
        const system = buildSystemPrompt(store.getState(), { maxOutputTokens: limits.maxOutputTokens });
        const result = await streamMessage({
          system,
          messages: fitToBudget({ system, tools: TOOLS, messages, currentFrom, budget: limits.maxInputTokens }),
          tools: TOOLS,
          maxTokens: limits.maxOutputTokens,
          signal,
          onText: (delta) => {
            answer += delta;
            emit({ type: 'text', delta });
          },
        });
        emit({ type: 'usage', inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheReadTokens: result.cacheReadTokens });
        const toolUses = result.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
        if (result.content.length > 0) messages.push({ role: 'assistant', content: result.content });
        // Abgeschnittene Antwort (Ausgabegrenze): wie ein Agent in kleineren Schritten weitermachen, statt abzubrechen.
        const truncated = result.stopReason === 'max_tokens';
        if (truncated) {
          truncations += 1;
          if (truncations > MAX_TRUNCATIONS) {
            emit({ type: 'error', message: 'Die Antwort der KI wurde mehrfach abgeschnitten, weil die maximale Ausgabelänge erreicht ist. Erhöhe sie in den KI-Einstellungen oder gib einen kleineren Auftrag.' });
            finished = true;
            break;
          }
          emit({ type: 'tool', name: 'weiter', summary: 'Antwort war zu lang – die KI macht in kleineren Schritten weiter', ok: true });
        }
        if (toolUses.length === 0) {
          if (truncated && result.content.length > 0) {
            messages.push({ role: 'user', content: CONTINUE_TEXT });
            continue;
          }
          if (truncated) emit({ type: 'error', message: 'Die Antwort der KI wurde abgeschnitten, weil die maximale Ausgabelänge erreicht ist. Erhöhe sie in den KI-Einstellungen oder gib einen kleineren Auftrag.' });
          finished = true;
          break;
        }
        if (result.stopReason !== 'tool_use' && !truncated) {
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
          if (truncated && (use.input as { __invalidJson?: boolean } | null)?.__invalidJson) {
            outcome = { ok: false, content: TRUNCATED_CALL_TEXT, summary: 'Aufruf abgeschnitten – wird in kleineren Teilen wiederholt', mutated: false };
          } else if (counters.toolCalls >= AI_LIMITS.maxToolCalls) {
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
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: outcome.image
              ? [
                  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: outcome.image } },
                  { type: 'text', text: outcome.content },
                ]
              : outcome.content,
            ...(outcome.ok ? {} : { is_error: true }),
          });
        }
        if (stopped) break;
        // Nur das neueste Bild bleibt im Verlauf; ältere werden durch einen Hinweis ersetzt.
        const older = dropImages(messages, false);
        messages.splice(0, messages.length, ...older, { role: 'user', content: results });
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
    getSettings: () => ({ hasKey: settings.hasApiKey(), model: settings.getModel(), approval: settings.getApproval(), vision: settings.getVision(), imageSearch: settings.getImageSearch(), ...settings.getTokenLimits() }),
    setTokenLimits: (limits) => settings.setTokenLimits(limits),
    setApproval: (mode) => settings.setApproval(mode),
    setVision: (on) => settings.setVision(on),
    setImageSearch: (on) => settings.setImageSearch(on),
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
