/**
 * Vertrag der MCP-Brücke: Claude Desktop ↔ MCP-Server (lokal, stdio) ↔ WebSocket ↔ App im Browser.
 * Die App führt die Werkzeuge mit demselben Code aus wie der KI-Chat (Prüfungen, Limits, Undo).
 */
import { AI_TOOLS } from './aiTools';

export const MCP_DEFAULT_PORT = 8765;
export const MCP_STORAGE_KEYS = {
  enabled: 'cloudparty.mcp.enabled',
  token: 'cloudparty.mcp.token',
  port: 'cloudparty.mcp.port',
} as const;

/** Nachrichten der App an den Server. */
export type AppToServer = { type: 'hello'; world: string } | { type: 'result'; id: number; ok: boolean; content: string; summary: string; image?: string };
/** Nachrichten des Servers an die App. */
export type ServerToApp = { type: 'welcome' } | { type: 'call'; id: number; name: string; input: unknown };

/** Werkzeuge, die nur der Chat sinnvoll nutzt (Meldung im Chatfenster). */
export const MCP_EXCLUDED_TOOLS = new Set<string>(['say']);

export const GUIDE_TOOL = 'cloudparty_guide';
export const STATUS_TOOL = 'cloudparty_status';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Alle über MCP angebotenen Werkzeuge: Anleitung + Status + die KI-Werkzeuge der App. */
export function mcpTools(): McpToolDef[] {
  const extra: McpToolDef[] = [
    {
      name: GUIDE_TOOL,
      description:
        'ZUERST AUFRUFEN. Liefert die Bau-Anleitung für Cloudparty (Regeln, Maße, Prefab-Katalog, Werkzeug-Hinweise, Sicherheitsregeln) passend zur gerade geöffneten Welt. Danach mit den anderen Werkzeugen in der geöffneten App bauen.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: STATUS_TOOL,
      description: 'Zeigt, ob die Cloudparty-App verbunden ist und welche Welt geöffnet ist.',
      inputSchema: { type: 'object', properties: {} },
    },
  ];
  const tools = AI_TOOLS.filter((t) => !MCP_EXCLUDED_TOOLS.has(t.name)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }));
  return [...extra, ...tools];
}
