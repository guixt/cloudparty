/**
 * MCP-Brücke (Claude Desktop): lässt einen externen Client die KI-Werkzeuge der App aufrufen.
 * Standardmäßig aus; nur mit Schalter und Token, nur über 127.0.0.1. Es gelten dieselben Prüfungen,
 * Limits und Freigaben wie im KI-Chat; jeder verändernde Aufruf ist ein eigener Undo-Schritt.
 */
import { getToolDefinition } from '../../../shared/aiTools';
import { GUIDE_TOOL } from '../../../shared/mcpBridge';
import type { GameContext, GameModule } from '../../core/context';
import { captureView } from '../core/capture';
import { fetchImageAsDataUrl } from '../core/imageFetch';
import { buildSystemPrompt } from '../core/prompt';
import { getApproval, getImageSearch } from '../core/settings';
import { trackChanges } from '../core/placeTools';
import { executeTool, type RunCounters, type ToolContext } from '../core/tools';
import { createBridgeClient, type CallResult } from './client';
import { bridgeSettings, bridgeStatus } from './state';

/** Nach so langer Pause zählt ein Aufruf als neuer „Auftrag“ (Limits und Änderungsverlauf beginnen neu). */
export const RUN_IDLE_MS = 120_000;

const GUIDE_NOTE = `

# Steuerung von außen (MCP)
Du bist nicht der Chat-Assistent der App, sondern steuerst die geöffnete Cloudparty-App von außen über MCP-Werkzeuge. Es gibt kein „say“; antworte dem Nutzer in deinem eigenen Chat. Jeder verändernde Werkzeugaufruf ist ein eigener Undo-Schritt in der App. Screenshots (look) sind erlaubt und kommen direkt zu dir. Die Grenzen pro Auftrag (Anzahl neuer Objekte, Werkzeugaufrufe) beginnen nach zwei Minuten Pause neu. Bei großen Bauten kann die App eine Rückfrage im Browser zeigen.`;

export function createRunner(ctx: Pick<GameContext, 'store' | 'bus' | 'localAvatar'> & Partial<GameContext>) {
  let counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  let tracker = trackChanges(ctx.store);
  let last = 0;
  return async function run(name: string, input: unknown, now = Date.now()): Promise<CallResult> {
    if (name === GUIDE_TOOL) {
      return { ok: true, content: buildSystemPrompt(ctx.store.getState(), { maxOutputTokens: 8000 }) + GUIDE_NOTE, summary: 'Anleitung' };
    }
    if (now - last > RUN_IDLE_MS) {
      counters = { toolCalls: 0, newEntities: 0, removals: 0 };
      tracker = trackChanges(ctx.store);
    }
    last = now;
    counters.screenshots = 0; // die Kosten tragen der Nutzer und sein Claude, nicht der API-Key der App
    counters.toolCalls += 1;
    const toolCtx: ToolContext = {
      store: ctx.store,
      bus: ctx.bus,
      getAvatar: () => ({ position: [...ctx.localAvatar.presence.position], yaw: ctx.localAvatar.presence.yaw }),
      confirm: async (question) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(question) : false),
      autoApprove: getApproval() === 'auto',
      vision: true,
      imageSearch: getImageSearch(),
      createdSince: tracker.createdSince,
      changedSince: tracker.changedSince,
      ...(ctx.scene ? { captureView: (req) => captureView(ctx as GameContext, req) } : {}),
      fetchImage: (url) => fetchImageAsDataUrl(url),
    };
    const mutates = getToolDefinition(name)?.mutates ?? false;
    if (mutates) ctx.bus.emit('history.group.begin', {});
    try {
      const r = await executeTool(name, input, toolCtx, counters);
      return { ok: r.ok, content: r.content, summary: r.summary, ...(r.image ? { image: r.image } : {}) };
    } finally {
      if (mutates) ctx.bus.emit('history.group.end', {});
    }
  };
}

let teardown: (() => void) | null = null;

const mod: GameModule = {
  id: 'ai-bridge',
  init(ctx) {
    teardown?.();
    const run = createRunner(ctx);
    const client = createBridgeClient({
      createSocket: (url) => new WebSocket(url) as unknown as ReturnType<Parameters<typeof createBridgeClient>[0]['createSocket']>,
      run,
      world: () => ctx.store.getState().world.metadata.name,
      onStatus: (state, detail) => bridgeStatus.setState({ state, ...(detail ? { detail } : {}) }),
    });
    const apply = () => {
      const s = bridgeSettings.getState();
      if (s.enabled) client.start(s.port, s.token);
      else client.stop();
    };
    const unsub = bridgeSettings.subscribe(apply);
    apply();
    teardown = () => {
      unsub();
      client.stop();
      teardown = null;
    };
  },
  dispose() {
    teardown?.();
  },
};
export default mod;
