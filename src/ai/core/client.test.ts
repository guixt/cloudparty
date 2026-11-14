import { beforeEach, describe, expect, it } from 'vitest';
import { AiError, parseSse, streamMessage, translateStatus } from './client';
import { askClaude } from './index';
import { installLocalStorage, mockFetch, sse, streamOf, textResponse, toolResponse } from './testUtils';

const KEY = 'sk-ant-TESTKEY-123456';

beforeEach(() => {
  installLocalStorage({ 'cloudparty.ai.key': KEY });
});

async function collect(stream: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const e of parseSse(stream)) out.push(e);
  return out;
}

describe('SSE-Parser', () => {
  it('liest Ereignisse, auch bei winzigen Chunks und CRLF', async () => {
    const text = sse([{ type: 'a', n: 1 }, { type: 'b', n: 2 }]).replace(/\n/g, '\r\n');
    const events = await collect(streamOf(text, 3));
    expect(events.map((e) => e.event)).toEqual(['a', 'b']);
    expect(JSON.parse(events[1].data).n).toBe(2);
  });
  it('ignoriert Kommentare und verarbeitet ein Ende ohne Leerzeile', async () => {
    const events = await collect(streamOf(': ping\n\nevent: x\ndata: {"type":"x"}'));
    expect(events).toHaveLength(1);
  });
});

describe('streamMessage', () => {
  it('sendet Header nur an den Basis-Host und setzt tool_use aus JSON-Deltas zusammen', async () => {
    const requests = mockFetch([toolResponse([{ id: 't1', name: 'add_entity', input: { ref: 'EntitySpec.box', position: [1, 2, 3] } }], 'Ok')]);
    const deltas: string[] = [];
    const res = await streamMessage({ system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, onText: (d) => deltas.push(d) });
    expect(res.stopReason).toBe('tool_use');
    expect(res.content[1]).toEqual({ type: 'tool_use', id: 't1', name: 'add_entity', input: { ref: 'EntitySpec.box', position: [1, 2, 3] } });
    expect(deltas.join('')).toBe('Ok');
    expect(res.outputTokens).toBe(30);
    expect(requests[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(requests[0].headers['x-api-key']).toBe(KEY);
    expect(requests[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(requests[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(requests[0].body.stream).toBe(true);
    expect(JSON.stringify(requests[0].body)).not.toContain(KEY);
  });

  it('nutzt baseUrl aus localStorage', async () => {
    installLocalStorage({ 'cloudparty.ai.key': KEY, 'cloudparty.ai.baseUrl': 'http://localhost:9/' });
    const requests = mockFetch([textResponse('x')]);
    await streamMessage({ system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 });
    expect(requests[0].url).toBe('http://localhost:9/v1/messages');
  });

  it('wählt das Modell validiert', async () => {
    installLocalStorage({ 'cloudparty.ai.key': KEY, 'cloudparty.ai.model': 'claude-haiku-5-5' });
    let requests = mockFetch([textResponse('x')]);
    await streamMessage({ system: 's', messages: [], maxTokens: 10 });
    expect(requests[0].body.model).toBe('claude-haiku-5-5');
    installLocalStorage({ 'cloudparty.ai.key': KEY, 'cloudparty.ai.model': 'evil' });
    requests = mockFetch([textResponse('x')]);
    await streamMessage({ system: 's', messages: [], maxTokens: 10 });
    expect(requests[0].body.model).toBe('claude-sonnet-5-5');
  });

  it('übersetzt Fehler ins Deutsche, ohne den Key', async () => {
    for (const [status, fragment] of [[401, 'ungültig'], [403, 'Berechtigung'], [429, 'Anfragelimit'], [500, 'Serverfehler'], [529, 'überlastet']] as const) {
      mockFetch([{ status, body: { error: { message: `bad ${KEY}` } } }]);
      const err = await streamMessage({ system: 's', messages: [], maxTokens: 10 }).catch((e) => e);
      expect(err).toBeInstanceOf(AiError);
      expect(err.message).toContain(fragment);
      expect(err.message).not.toContain(KEY);
    }
    expect(translateStatus(400, `kaputt ${KEY}`)).not.toContain(KEY);
  });

  it('meldet Netzwerk-/CORS-Fehler', async () => {
    (globalThis as { fetch: unknown }).fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const err = await streamMessage({ system: 's', messages: [], maxTokens: 10 }).catch((e) => e);
    expect(err.message).toContain('Keine Verbindung');
  });

  it('meldet Fehler-Ereignisse im Stream', async () => {
    mockFetch([{ events: [{ type: 'error', error: { type: 'overloaded_error', message: 'x' } }] }]);
    const err = await streamMessage({ system: 's', messages: [], maxTokens: 10 }).catch((e) => e);
    expect(err.message).toContain('überlastet');
  });

  it('bricht ab', async () => {
    mockFetch([{ events: textResponse('abc').events!.slice(0, 3), hang: true }]);
    const ac = new AbortController();
    const p = streamMessage({ system: 's', messages: [], maxTokens: 10, signal: ac.signal, onText: () => ac.abort() });
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.aborted).toBe(true);
  });

  it('ohne Key: deutscher Fehler, kein Request', async () => {
    installLocalStorage();
    const requests = mockFetch([textResponse('x')]);
    await expect(streamMessage({ system: 's', messages: [], maxTokens: 10 })).rejects.toThrow('API-Key');
    expect(requests).toHaveLength(0);
  });
});

describe('askClaude', () => {
  it('liefert Text und Tokens, ohne Werkzeuge', async () => {
    const requests = mockFetch([textResponse('Hallo Welt', { input: 7, output: 3 })]);
    const deltas: string[] = [];
    const res = await askClaude({ system: 'sys', prompt: 'frage', onDelta: (d) => deltas.push(d) });
    expect(res).toEqual({ text: 'Hallo Welt', inputTokens: 7, outputTokens: 3 });
    expect(requests[0].body.tools).toBeUndefined();
    expect(deltas).toEqual(['Hallo Welt']);
  });
  it('wirft Error mit deutscher Meldung', async () => {
    mockFetch([{ status: 401 }]);
    await expect(askClaude({ system: 's', prompt: 'p' })).rejects.toThrow('ungültig');
  });
});
