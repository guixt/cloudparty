/**
 * Anthropic-Messages-Client (direkter Browser-Aufruf, SSE-Streaming).
 * Der API-Key wird ausschließlich als Header `x-api-key` an `${base}/v1/messages` gesendet
 * und taucht in keiner Meldung, keinem Ereignis und keinem Fehler auf.
 */
import { getApiKey, getBaseUrl, getModel } from './settings';

export const API_VERSION = '2023-06-01';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  /** Vom Nutzer angehängtes Bild (Base64 ohne Präfix). */
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string } }
  | { type: 'tool_result'; tool_use_id: string; content: string | ToolResultPart[]; is_error?: boolean };

/** Teile eines Werkzeugergebnisses mit Bild (Screenshot als Base64-JPEG ohne Präfix). */
export type ToolResultPart = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } };
export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}
export interface ApiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
export interface MessageRequest {
  system: string;
  messages: ApiMessage[];
  tools?: ApiTool[];
  maxTokens: number;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  /** Modell nur für diese Anfrage (sonst das Hauptmodell aus den Einstellungen). */
  model?: string;
}
export interface MessageResult {
  content: ContentBlock[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  /** Aus dem Prompt-Cache gelesene Eingabe-Tokens (ca. 10 % der Kosten). */
  cacheReadTokens: number;
  /** In den Prompt-Cache geschriebene Tokens (ca. 125 % der Kosten, einmalig). */
  cacheWriteTokens: number;
}

/** Fehler mit deutscher, für Nutzer bestimmter Meldung. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly aborted = false,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** Entfernt den Key (und key-ähnliche Muster) aus beliebigem Text. */
export function redact(text: string): string {
  let out = text;
  const key = getApiKey();
  if (key) out = out.split(key).join('[Key]');
  return out.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[Key]');
}

export function translateStatus(status: number, serverMessage?: string): string {
  if (status === 401) return 'Der API-Key ist ungültig. Bitte prüfe ihn in den KI-Einstellungen.';
  if (status === 403) return 'Der API-Key hat keine Berechtigung für diese Anfrage (403).';
  if (status === 404) return 'Das gewählte Modell wurde nicht gefunden. Wähle in den Einstellungen ein anderes Modell.';
  if (status === 413) return 'Die Anfrage ist zu groß. Starte ein neues Gespräch.';
  if (status === 429) return 'Das Anfragelimit oder Kontingent ist erreicht. Warte einen Moment oder prüfe dein Guthaben bei Anthropic.';
  if (status === 529) return 'Die KI ist gerade überlastet. Bitte versuche es gleich noch einmal.';
  if (status >= 500) return 'Der KI-Dienst hat gerade ein Problem (Serverfehler). Bitte versuche es später noch einmal.';
  if (status === 400) {
    const detail = serverMessage ? ` (${redact(serverMessage).slice(0, 200)})` : '';
    return `Die Anfrage wurde von der KI abgelehnt${detail}.`;
  }
  return `Unerwarteter Fehler der KI (Status ${status}).`;
}

interface SseEvent {
  event: string;
  data: string;
}

/** Zerlegt einen Byte-Stream in SSE-Ereignisse (robust gegen geteilte Chunks, CRLF, Kommentare). */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingCr = '';
  const flush = function* (block: string): Generator<SseEvent> {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const idx = line.indexOf(':');
      const field = idx < 0 ? line : line.slice(0, idx);
      let value = idx < 0 ? '' : line.slice(idx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length > 0) yield { event, data: data.join('\n') };
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let chunk = pendingCr + decoder.decode(value, { stream: true });
      // Ein CR am Chunk-Ende könnte zu einem CRLF gehören: zurückhalten.
      pendingCr = chunk.endsWith('\r') ? '\r' : '';
      if (pendingCr) chunk = chunk.slice(0, -1);
      buffer += chunk.replace(/\r\n?/g, '\n');
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        yield* flush(block);
      }
    }
    buffer += (decoder.decode() + pendingCr).replace(/\r\n?/g, '\n');
    if (buffer.trim()) yield* flush(buffer);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignorieren */
    }
  }
}

interface PartialBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  json?: string;
}

const CACHE = { type: 'ephemeral' } as const;

/**
 * Prompt-Caching: Werkzeugliste, Systemprompt und der bisherige Gesprächsverlauf sind bei jeder
 * Runde eines Auftrags gleich und werden als Präfix gecacht (Lesen kostet ca. 10 %). Drei
 * Haltepunkte (von maximal vier): letztes Werkzeug, Systemprompt, letzter Block der letzten Nachricht.
 * Zu kurze Präfixe werden von der API still ohne Cache verarbeitet.
 */
export function withPromptCache(req: Pick<MessageRequest, 'system' | 'messages' | 'tools'>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    system: [{ type: 'text', text: req.system, cache_control: CACHE }],
  };
  if (req.tools && req.tools.length > 0) {
    out.tools = req.tools.map((tool, i) => (i === req.tools!.length - 1 ? { ...tool, cache_control: CACHE } : tool));
  }
  out.messages = req.messages.map((m, i) => {
    if (i !== req.messages.length - 1) return m;
    const blocks: unknown[] = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : [...m.content];
    if (blocks.length === 0) return m;
    const last = blocks[blocks.length - 1] as Record<string, unknown>;
    blocks[blocks.length - 1] = { ...last, cache_control: CACHE };
    return { ...m, content: blocks };
  });
  return out;
}

/** Sendet eine Anfrage und liest den Stream bis zum Ende. Wirft AiError. */
export async function streamMessage(req: MessageRequest): Promise<MessageResult> {
  const key = getApiKey();
  if (!key) throw new AiError('Kein API-Key hinterlegt. Trage deinen Anthropic-Key in den KI-Einstellungen ein.');
  const body: Record<string, unknown> = {
    model: req.model || getModel(),
    max_tokens: req.maxTokens,
    stream: true,
    ...withPromptCache(req),
  };

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (error) {
    if (req.signal?.aborted || (error as { name?: string })?.name === 'AbortError') throw new AiError('Abgebrochen.', true);
    throw new AiError('Keine Verbindung zur KI. Prüfe deine Internetverbindung (oder ob der Dienst Browser-Zugriffe erlaubt).');
  }

  if (!response.ok) {
    let serverMessage: string | undefined;
    try {
      const parsed = JSON.parse(await response.text()) as { error?: { message?: string } };
      serverMessage = parsed.error?.message;
    } catch {
      /* kein JSON */
    }
    throw new AiError(translateStatus(response.status, serverMessage));
  }
  if (!response.body) throw new AiError('Die KI hat keine Antwort geliefert.');

  const blocks: PartialBlock[] = [];
  let stopReason = 'end_turn';
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  try {
    for await (const { event, data } of parseSse(response.body)) {
      if (req.signal?.aborted) throw new AiError('Abgebrochen.', true);
      let payload: Record<string, any>;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      const type = (payload.type as string) ?? event;
      if (type === 'message_start') {
        inputTokens = Number(payload.message?.usage?.input_tokens) || 0;
        outputTokens = Number(payload.message?.usage?.output_tokens) || 0;
        cacheReadTokens = Number(payload.message?.usage?.cache_read_input_tokens) || 0;
        cacheWriteTokens = Number(payload.message?.usage?.cache_creation_input_tokens) || 0;
      } else if (type === 'content_block_start') {
        const cb = payload.content_block ?? {};
        blocks[payload.index] = { type: cb.type, text: cb.text ?? '', id: cb.id, name: cb.name, json: '' };
        if (cb.type === 'text' && cb.text) req.onText?.(cb.text);
      } else if (type === 'content_block_delta') {
        const block = blocks[payload.index];
        const delta = payload.delta ?? {};
        if (!block) continue;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          block.text = (block.text ?? '') + delta.text;
          req.onText?.(delta.text);
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          block.json = (block.json ?? '') + delta.partial_json;
        }
      } else if (type === 'message_delta') {
        if (payload.delta?.stop_reason) stopReason = String(payload.delta.stop_reason);
        if (payload.usage?.output_tokens != null) outputTokens = Number(payload.usage.output_tokens) || outputTokens;
        if (payload.usage?.input_tokens != null) inputTokens = Number(payload.usage.input_tokens) || inputTokens;
      } else if (type === 'error') {
        const errType = String(payload.error?.type ?? '');
        if (errType === 'overloaded_error') throw new AiError(translateStatus(529));
        if (errType === 'rate_limit_error') throw new AiError(translateStatus(429));
        if (errType === 'authentication_error') throw new AiError(translateStatus(401));
        throw new AiError(translateStatus(errType === 'api_error' ? 500 : 400, payload.error?.message));
      }
    }
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (req.signal?.aborted || (error as { name?: string })?.name === 'AbortError') throw new AiError('Abgebrochen.', true);
    throw new AiError('Die Verbindung zur KI wurde unterbrochen.');
  }
  if (req.signal?.aborted) throw new AiError('Abgebrochen.', true);

  const content: ContentBlock[] = [];
  for (const block of blocks) {
    if (!block) continue;
    if (block.type === 'text') {
      if (block.text) content.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      let input: unknown = {};
      if (block.json && block.json.trim()) {
        try {
          input = JSON.parse(block.json);
        } catch {
          input = { __invalidJson: true };
        }
      }
      content.push({ type: 'tool_use', id: block.id ?? '', name: block.name ?? '', input });
    }
  }
  return { content, stopReason, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
}
