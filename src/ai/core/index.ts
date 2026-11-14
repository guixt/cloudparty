/**
 * KI-Kern (Paket 13): Claude-Client, Tool-Use-Schleife, Werkzeuge.
 * Test-Hook: nach `init` steht der Assistent als `window.__cloudpartyAi` bereit.
 */
import type { GameModule } from '../../core/context';
import { runtime as buildRuntime } from '../../build/runtime';
import type { AskClaude, AssistantApi } from '../api';
import { streamMessage } from './client';
import { createAssistant } from './loop';
import { hasApiKey } from './settings';

let assistant: AssistantApi | null = null;

export function getAssistant(): AssistantApi | null {
  return assistant;
}

export const askClaude: AskClaude = async (options) => {
  const result = await streamMessage({
    system: options.system,
    messages: [{ role: 'user', content: options.prompt }],
    maxTokens: options.maxTokens ?? 2048,
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
    });
    (globalThis as { __cloudpartyAi?: AssistantApi }).__cloudpartyAi = assistant;
  },
  dispose() {
    assistant = null;
    delete (globalThis as { __cloudpartyAi?: AssistantApi }).__cloudpartyAi;
  },
};
export default mod;
