/**
 * Reine MCP-Logik (JSON-RPC 2.0 über stdio), ohne Ein-/Ausgabe: gut testbar.
 * Unterstützt initialize, ping, tools/list und tools/call.
 */
import { GUIDE_TOOL, STATUS_TOOL, mcpTools } from '../shared/mcpBridge';

export interface AppResult {
  ok: boolean;
  content: string;
  summary?: string;
  /** Base64-JPEG ohne Präfix. */
  image?: string;
}

export interface RpcBackend {
  /** Führt ein Werkzeug in der App aus; wirft, wenn keine App verbunden ist. */
  callApp(name: string, input: unknown): Promise<AppResult>;
  status(): { connected: boolean; world?: string } | Promise<{ connected: boolean; world?: string }>;
}

export interface RpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER_INFO = { name: 'cloudparty', version: '1.0.0' };
export const INSTRUCTIONS =
  'Mit diesen Werkzeugen baust du live in der geöffneten Cloudparty-App (Browser). Rufe zuerst cloudparty_guide auf und lies die Anleitung. Ist die App nicht verbunden, bitte den Nutzer, sie zu öffnen und unter KI-Einstellungen › Externe Steuerung (MCP) einzuschalten.';

function reply(id: RpcMessage['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function error(id: RpcMessage['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

/** Verarbeitet eine Nachricht; liefert die Antwort oder null (bei Benachrichtigungen). */
export async function handleRpc(msg: RpcMessage, backend: RpcBackend): Promise<object | null> {
  const { id, method } = msg;
  const isNotification = id === undefined || id === null;
  if (typeof method !== 'string') return isNotification ? null : error(id, -32600, 'Ungültige Anfrage');
  switch (method) {
    case 'initialize': {
      const wanted = typeof msg.params?.protocolVersion === 'string' ? (msg.params.protocolVersion as string) : '';
      const version = SUPPORTED_VERSIONS.includes(wanted) ? wanted : SUPPORTED_VERSIONS[0];
      return reply(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: mcpTools() });
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string' || !mcpTools().some((t) => t.name === name)) return error(id, -32602, `Unbekanntes Werkzeug: ${String(name).slice(0, 60)}`);
      const input = msg.params?.arguments ?? {};
      if (name === STATUS_TOOL) {
        const s = await backend.status();
        return reply(id, textResult(s.connected ? `Verbunden${s.world ? `, geöffnete Welt: „${s.world}“` : ''}.` : 'Die Cloudparty-App ist nicht verbunden. Öffne die App (gleicher Rechner) und schalte unter KI-Einstellungen › Externe Steuerung (MCP) die Steuerung ein; Token und Port müssen stimmen.'));
      }
      try {
        const r = await backend.callApp(name, input);
        const content: object[] = [{ type: 'text', text: r.content }];
        if (r.image) content.push({ type: 'image', data: r.image, mimeType: 'image/jpeg' });
        return reply(id, { content, ...(r.ok ? {} : { isError: true }) });
      } catch (e) {
        return reply(id, textResult((e as Error).message || 'Fehler beim Aufruf der App.', true));
      }
    }
    default:
      if (isNotification) return null; // z. B. notifications/initialized
      return error(id, -32601, `Methode nicht unterstützt: ${method.slice(0, 60)}`);
  }
}

export { GUIDE_TOOL };
