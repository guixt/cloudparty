/** Der Assistent: Gesprächsverlauf, Tool-Use-Schleife, Undo-Gruppe. */
import { AI_LIMITS, AI_MODELS, AI_TOKEN_LIMITS, AI_TOOLS } from '../../../shared/aiTools';
import type { Vec3 } from '../../../shared/types';
import type { AssistantApi, AssistantEvent, RunOptions } from '../api';
import type { EventBus } from '../../core/events';
import type { WorldStore } from '../../core/store';
import { AiError, streamMessage, type ApiMessage, type ApiTool, type ContentBlock } from './client';
import { dropImages, fitToBudget } from './budget';
import { clip, logEvent } from './log';
import { toImageBlocks } from './userImages';
import { buildSystemPrompt } from './prompt';
import * as settings from './settings';
import { executeTool, type RunCounters, type ToolOutcome } from './tools';
import { trackChanges } from './placeTools';
import { getRunLimits } from './runLimits';

/** Höchstens so viele Nachrichten (≈ 20 Gesprächsrunden) bleiben zwischen Aufträgen erhalten. */
export const MAX_HISTORY_MESSAGES = 40;

/** So oft darf die Antwort in einem Auftrag abgeschnitten werden, bevor der Assistent aufgibt. */
export const MAX_TRUNCATIONS = 4;

/**
 * Werkzeuge, die auf Bilddarstellung, Zeitgeber oder das Netz warten, dürfen nicht endlos hängen:
 * Läuft das App-Fenster im Hintergrund, pausiert der Browser Bildschirmaufnahmen und drosselt Zeitgeber stark.
 */
export const TOOL_TIMEOUT_MS: Record<string, number> = { look: 30_000, script_test: 40_000, search_images: 30_000, use_image: 40_000, use_texture: 40_000 };
const TIMEOUT_TEXT = 'Zeitüberschreitung: Das Werkzeug hat nicht rechtzeitig geantwortet (oft, weil das App-Fenster im Hintergrund war und der Browser Bilder und Zeitgeber anhält). Prüfe mit get_world oder what_changed, was schon passiert ist, und mache ohne dieses Werkzeug weiter.';

/** Wartet auf das Werkzeug, bricht aber bei Stopp (null) oder Zeitüberschreitung ab. */
export function raceTool(task: Promise<ToolOutcome>, signal: AbortSignal | undefined, timeoutMs: number | undefined): Promise<ToolOutcome | null> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      done();
      resolve(null);
    };
    if (signal?.aborted) return resolve(null);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        done();
        resolve({ ok: false, content: TIMEOUT_TEXT, summary: 'Werkzeug antwortet nicht (Zeitüberschreitung)', mutated: false });
      }, timeoutMs);
    }
    task.then(
      (v) => {
        done();
        resolve(v);
      },
      (e) => {
        done();
        reject(e);
      },
    );
  });
}
const CONTINUE_TEXT = 'Deine letzte Antwort wurde wegen der Ausgabegrenze abgeschnitten. Mache genau dort weiter, wo du aufgehört hast, und fasse dich kürzer: höchstens wenige Werkzeugaufrufe pro Antwort, lieber mehrere kleine Schritte. Ist ein Plan-Knoten zu groß, teile ihn mit plan_add_node in kleinere Knoten und baue nur den ersten Teil.';
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
  fetchImage?(url: string): Promise<{ dataUrl: string; width: number; height: number } | null>;
  /** Überschreibt die Zeitgrenzen einzelner Werkzeuge (Tests). */
  toolTimeoutMs?: Record<string, number>;
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
    const userImages = toImageBlocks(options.images);
    const messages: ApiMessage[] = [...conversation, { role: 'user', content: userImages.length > 0 ? [...userImages, { type: 'text', text }] : text }];
    // Längengrenzen einmal pro Auftrag lesen (wie der Freigabe-Modus).
    const limits = settings.getTokenLimits();
    if (options.maxOutputTokens !== undefined && Number.isFinite(options.maxOutputTokens)) {
      limits.maxOutputTokens = Math.min(AI_TOKEN_LIMITS.output.max, Math.max(AI_TOKEN_LIMITS.output.min, Math.round(options.maxOutputTokens)));
    }
    const currentFrom = conversation.length;
    const runStart = Date.now();
    const runId = `r${runStart.toString(36)}`;
    logEvent('run.start', { run: runId, model: settings.getModel(), maxOutput: limits.maxOutputTokens, maxInput: limits.maxInputTokens, entities: store.getState().order.length, images: userImages.length }, { prompt: clip(text) });
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
    const startIds = new Set(store.getState().order);
    const createdSince = () => store.getState().order.filter((id) => !startIds.has(id));
    const runLimits = getRunLimits();
    const { changedSince } = trackChanges(store);
    const toolCtx = { store, bus, createdSince, changedSince, getAvatar: deps.getAvatar, confirm, autoApprove: settings.getApproval() === 'auto', vision: settings.getVision(), captureView: deps.captureView, imageSearch: settings.getImageSearch(), fetchImage: deps.fetchImage };

    try {
      let finished = false;
      for (let round = 0; round < runLimits.maxRounds; round++) {
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
        logEvent('round', { run: runId, round, stop: result.stopReason, inTokens: result.inputTokens, outTokens: result.outputTokens, cacheRead: result.cacheReadTokens, cacheWrite: result.cacheWriteTokens, toolUses: result.content.filter((b) => b.type === 'tool_use').length });
        emit({ type: 'usage', inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheReadTokens: result.cacheReadTokens });
        const toolUses = result.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
        if (result.content.length > 0) messages.push({ role: 'assistant', content: result.content });
        // Abgeschnittene Antwort (Ausgabegrenze): wie ein Agent in kleineren Schritten weitermachen, statt abzubrechen.
        const truncated = result.stopReason === 'max_tokens';
        if (truncated) {
          truncations += 1;
          logEvent('truncated', { run: runId, round, count: truncations });
          if (truncations > MAX_TRUNCATIONS) {
            emit({ type: 'error', message: `Die Antwort der KI wurde mehrfach abgeschnitten, weil die maximale Ausgabelänge (Grenze von ${limits.maxOutputTokens} Tokens) erreicht ist. Erhöhe sie in den KI-Einstellungen (bis ${AI_TOKEN_LIMITS.output.max}) oder teile den Auftrag bzw. den Plan-Knoten in kleinere Schritte.` });
            finished = true;
            break;
          }
          emit({ type: 'tool', name: 'weiter', summary: 'Antwort war zu lang – die KI macht in kleineren Schritten weiter', ok: true });
        }
        if (toolUses.length === 0) {
          if (truncated) {
            // Auch eine leere abgeschnittene Antwort (z. B. nur Gedankentext) wird wie eine lange behandelt: kürzer neu ansetzen.
            if (result.content.length === 0) logEvent('truncated.empty', { run: runId, round, outTokens: result.outputTokens, limit: limits.maxOutputTokens });
            messages.push({ role: 'user', content: CONTINUE_TEXT });
            continue;
          }
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
          } else if (counters.toolCalls >= runLimits.maxToolCalls) {
            outcome = { ok: false, content: `Limit erreicht: höchstens ${runLimits.maxToolCalls} Werkzeugaufrufe pro Auftrag. Beende den Auftrag jetzt.`, summary: 'Werkzeuglimit erreicht', mutated: false };
          } else {
            counters.toolCalls += 1;
            const def = AI_TOOLS.find((t) => t.name === use.name);
            if (def?.mutates && !grouped && store.getState().canBuild) {
              grouped = true;
              bus.emit('history.group.begin', {});
            }
            const t0 = Date.now();
            const raced = await raceTool(executeTool(use.name, use.input, toolCtx, counters), signal, (deps.toolTimeoutMs ?? TOOL_TIMEOUT_MS)[use.name]);
            if (raced === null) {
              stopped = true;
              logEvent('tool.aborted', { run: runId, name: use.name, ms: Date.now() - t0 });
              break;
            }
            outcome = raced;
            logEvent('tool', { run: runId, name: use.name, ok: outcome.ok, ms: Date.now() - t0, summary: clip(outcome.summary, 200), toolCalls: counters.toolCalls, newEntities: counters.newEntities }, { input: clip(use.input), result: clip(outcome.content) });
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
        emit({ type: 'error', message: `Der Auftrag war zu umfangreich (Grenze von ${runLimits.maxRounds} Runden erreicht; sie lässt sich in den KI-Einstellungen unter „Limits“ erhöhen). Das Bisherige bleibt erhalten.` });
      }
    } catch (error) {
      stopped = true;
      if (!(error instanceof AiError && error.aborted)) {
        const message = error instanceof AiError ? error.message : 'Unerwarteter Fehler im KI-Assistenten.';
        emit({ type: 'error', message });
        logEvent('error', { run: runId, message: clip(message, 400) });
      }
    } finally {
      if (grouped) bus.emit('history.group.end', {});
      running = false;
    }
    if (changed) lastGroupUndoCount = deps.getHistory()?.undoCount ?? null;
    logEvent('run.end', { run: runId, ms: Date.now() - runStart, stopped, changed, toolCalls: counters.toolCalls, newEntities: counters.newEntities, truncations }, { answer: clip(answer.trim()) });
    remember(userImages.length > 0 ? `${text}\n[Der Nutzer hatte ${userImages.length} Bild${userImages.length === 1 ? '' : 'er'} angehängt; sie sind in diesem Verlauf nicht mehr sichtbar.]` : text, answer.trim());
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
