/**
 * KI-Kern (Paket 13): Claude-Client, Tool-Use-Schleife, Werkzeuge.
 * Test-Hook: nach `init` steht der Assistent als `window.__cloudpartyAi` bereit.
 */
import type { GameModule } from '../../core/context';
import { captureView } from './capture';
import { fetchImageAsDataUrl } from './imageFetch';
import { runtime as buildRuntime } from '../../build/runtime';
import type { AskClaude, AssistantApi } from '../api';
import { streamMessage } from './client';
import { createAssistant } from './loop';
import { estimateTokens, tooLongError } from './budget';
import { outputLimitNote } from './prompt';
import { getTokenLimits, hasApiKey } from './settings';

let assistant: AssistantApi | null = null;

export function getAssistant(): AssistantApi | null {
  return assistant;
}

export const askClaude: AskClaude = async (options) => {
  // Die Längengrenzen aus den KI-Einstellungen gelten auch für die Editor-KI (options.maxTokens ist nur ein Vorschlag).
  const limits = getTokenLimits();
  const system = `${options.system}\n\n${outputLimitNote(limits.maxOutputTokens)}`;
  const needed = estimateTokens(system) + estimateTokens(options.prompt);
  if (needed > limits.maxInputTokens) throw tooLongError(limits.maxInputTokens, needed);
  const result = await streamMessage({
    system,
    messages: [{ role: 'user', content: options.prompt }],
    maxTokens: limits.maxOutputTokens,
    signal: options.signal,
    onText: options.onDelta,
  });
  const text = result.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return { text, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
};

export function hasAiKey(): boolean {
  return hasApiKey();
}

const mod: GameModule = {
  id: 'ai-core',
  init(ctx) {
    assistant = createAssistant({
      store: ctx.store,
      bus: ctx.bus,
      getAvatar: () => ({ position: [...ctx.localAvatar.presence.position], yaw: ctx.localAvatar.presence.yaw }),
      getHistory: () => buildRuntime.history,
      captureView: (req) => captureView(ctx, req),
      fetchImage: (url) => fetchImageAsDataUrl(url),
    });
    (globalThis as { __cloudpartyAi?: AssistantApi }).__cloudpartyAi = assistant;
  },
  dispose() {
    assistant = null;
    delete (globalThis as { __cloudpartyAi?: AssistantApi }).__cloudpartyAi;
  },
};
export default mod;
