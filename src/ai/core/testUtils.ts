/** Hilfen für Tests: gemockter fetch mit SSE-Antworten. */
export type Scripted = { status?: number; body?: unknown; events?: unknown[]; chunkSize?: number; hang?: boolean };

export function sse(events: unknown[]): string {
  return events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

export function textResponse(text: string, usage = { input: 10, output: 5 }): Scripted {
  return {
    events: [
      { type: 'message_start', message: { usage: { input_tokens: usage.input, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.output } },
      { type: 'message_stop' },
    ],
  };
}

export function toolResponse(calls: { id: string; name: string; input: unknown }[], text = ''): Scripted {
  const events: unknown[] = [{ type: 'message_start', message: { usage: { input_tokens: 20, output_tokens: 1 } } }];
  let index = 0;
  if (text) {
    events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index });
    index++;
  }
  for (const call of calls) {
    const json = JSON.stringify(call.input);
    const mid = Math.floor(json.length / 2);
    events.push(
      { type: 'content_block_start', index, content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} } },
      { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(0, mid) } },
      { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(mid) } },
      { type: 'content_block_stop', index },
    );
    index++;
  }
  events.push({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } }, { type: 'message_stop' });
  return { events };
}

export interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
  body: any;
}

export function streamOf(text: string, chunkSize = 1 << 30, signal?: AbortSignal, hang = false): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        if (hang) {
          await new Promise<void>((_, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
        }
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
      if (hang && offset >= bytes.length) await Promise.resolve();
    },
  });
}

/** Installiert einen fetch-Mock, der die Antworten der Reihe nach liefert. */
export function mockFetch(responses: (Scripted | ((requests: RecordedRequest[]) => Scripted))[]) {
  const requests: RecordedRequest[] = [];
  let i = 0;
  const fn = (async (url: string, init: RequestInit) => {
    requests.push({ url: String(url), headers: { ...(init.headers as Record<string, string>) }, body: JSON.parse(String(init.body)) });
    const entry = responses[Math.min(i, responses.length - 1)];
    const scripted = typeof entry === 'function' ? entry(requests) : entry;
    i++;
    const signal = init.signal as AbortSignal | undefined;
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (scripted.status && scripted.status >= 400) {
      return new Response(JSON.stringify(scripted.body ?? { error: { message: 'x' } }), { status: scripted.status });
    }
    return new Response(streamOf(sse(scripted.events ?? []), scripted.chunkSize, signal, scripted.hang), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;
  (globalThis as { fetch: typeof fetch }).fetch = fn;
  return requests;
}

export function installLocalStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
  };
  return data;
}
