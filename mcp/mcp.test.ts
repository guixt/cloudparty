import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { mcpTools } from '../shared/mcpBridge';
import { startBridge, type Bridge } from './bridge';
import { handleRpc, type RpcBackend } from './rpc';

const backend = (over: Partial<RpcBackend> = {}): RpcBackend => ({
  callApp: async (name, input) => ({ ok: true, content: `ok ${name} ${JSON.stringify(input)}` }),
  status: () => ({ connected: true, world: 'Haus' }),
  ...over,
});

describe('MCP-Protokoll', () => {
  it('initialize, ping, Benachrichtigungen', async () => {
    const r = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, backend())) as { result: { protocolVersion: string; capabilities: object; serverInfo: { name: string }; instructions: string } };
    expect(r.result.protocolVersion).toBe('2025-06-18');
    expect(r.result.serverInfo.name).toBe('cloudparty');
    expect(r.result.capabilities).toHaveProperty('tools');
    expect(r.result.instructions).toContain('cloudparty_guide');
    const old = (await handleRpc({ id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, backend())) as { result: { protocolVersion: string } };
    expect(['2025-06-18', '2025-03-26', '2024-11-05']).toContain(old.result.protocolVersion);
    expect(await handleRpc({ method: 'notifications/initialized' }, backend())).toBeNull();
    expect(await handleRpc({ id: 3, method: 'ping' }, backend())).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
    expect(((await handleRpc({ id: 4, method: 'gibtsnicht' }, backend())) as { error: { code: number } }).error.code).toBe(-32601);
  });

  it('tools/list enthält die App-Werkzeuge samt Schema, aber nicht say', async () => {
    const r = (await handleRpc({ id: 1, method: 'tools/list' }, backend())) as { result: { tools: { name: string; description: string; inputSchema: { type: string } }[] } };
    const names = r.result.tools.map((t) => t.name);
    expect(names).toContain('cloudparty_guide');
    expect(names).toContain('fit_to_opening');
    expect(names).toContain('look');
    expect(names).not.toContain('say');
    expect(r.result.tools.every((t) => t.description.length > 5 && t.inputSchema.type === 'object')).toBe(true);
    expect(r.result.tools.length).toBe(mcpTools().length);
  });

  it('tools/call leitet an die App weiter, Bilder werden Bildinhalt, Fehler werden isError', async () => {
    const calls: string[] = [];
    const b = backend({
      callApp: async (name) => {
        calls.push(name);
        if (name === 'look') return { ok: true, content: 'Screenshot', image: 'QUJD' };
        if (name === 'add_wall') return { ok: false, content: 'Wand zu kurz' };
        throw new Error('Die Cloudparty-App ist nicht verbunden.');
      },
    });
    const img = (await handleRpc({ id: 1, method: 'tools/call', params: { name: 'look', arguments: {} } }, b)) as { result: { content: { type: string; data?: string; mimeType?: string }[]; isError?: boolean } };
    expect(img.result.content[1]).toEqual({ type: 'image', data: 'QUJD', mimeType: 'image/jpeg' });
    expect(img.result.isError).toBeUndefined();
    const bad = (await handleRpc({ id: 2, method: 'tools/call', params: { name: 'add_wall', arguments: { from: [0, 0] } } }, b)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toBe('Wand zu kurz');
    const off = (await handleRpc({ id: 3, method: 'tools/call', params: { name: 'get_world' } }, b)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(off.result.isError).toBe(true);
    expect(off.result.content[0].text).toContain('nicht verbunden');
    const unknown = (await handleRpc({ id: 4, method: 'tools/call', params: { name: 'format_c' } }, b)) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32602);
    expect(calls).toEqual(['look', 'add_wall', 'get_world']);
  });

  it('cloudparty_status meldet Verbindung und Welt', async () => {
    const on = (await handleRpc({ id: 1, method: 'tools/call', params: { name: 'cloudparty_status' } }, backend())) as { result: { content: { text: string }[] } };
    expect(on.result.content[0].text).toContain('Haus');
    const off = (await handleRpc({ id: 2, method: 'tools/call', params: { name: 'cloudparty_status' } }, backend({ status: () => ({ connected: false }) }))) as { result: { content: { text: string }[] } };
    expect(off.result.content[0].text).toContain('nicht verbunden');
  });
});

describe('Brücke zur App', () => {
  let bridge: Bridge | null = null;
  afterEach(() => {
    bridge?.close();
    bridge = null;
  });
  const port = () => 20000 + Math.floor(Math.random() * 20000);
  const connect = (p: number, token: string) =>
    new Promise<{ ws: WebSocket; closed: Promise<number>; first: Promise<{ type: string }> }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${p}/?token=${token}`);
      const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
      const first = new Promise<{ type: string }>((r) => ws.once('message', (d) => r(JSON.parse(String(d)))));
      ws.on('open', () => resolve({ ws, closed, first }));
      ws.on('error', () => resolve({ ws, closed, first }));
    });

  it('falsches Token wird abgelehnt (4401), richtiges bekommt welcome', async () => {
    const p = port();
    bridge = await startBridge({ port: p, token: 'geheim-geheim-geheim' });
    const bad = await connect(p, 'falsch');
    expect(await bad.closed).toBe(4401);
    expect(bridge.status().connected).toBe(false);
    const good = await connect(p, 'geheim-geheim-geheim');
    expect((await good.first).type).toBe('welcome');
    good.ws.close();
  });

  it('Aufruf geht zur App und das Ergebnis kommt zurück; Welt wird gemerkt; ohne App Fehler', async () => {
    const p = port();
    bridge = await startBridge({ port: p, token: 'tokentokentoken1' });
    await expect(bridge.callApp('get_world', {})).rejects.toThrow('nicht verbunden');
    const { ws } = await connect(p, 'tokentokentoken1');
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.type === 'call') ws.send(JSON.stringify({ type: 'result', id: m.id, ok: true, content: `hi ${m.name}`, summary: 's', image: 'AAAA' }));
    });
    await new Promise((r) => setTimeout(r, 50));
    ws.send(JSON.stringify({ type: 'hello', world: 'Mein Haus' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(bridge.status()).toEqual({ connected: true, world: 'Mein Haus' });
    const res = await bridge.callApp('add_wall', { a: 1 });
    expect(res).toMatchObject({ ok: true, content: 'hi add_wall', image: 'AAAA' });
    ws.close();
  });

  it('offene Aufrufe scheitern, wenn die App die Verbindung trennt; zweite Verbindung ersetzt die erste', async () => {
    const p = port();
    bridge = await startBridge({ port: p, token: 'tokentokentoken2' });
    const a = await connect(p, 'tokentokentoken2');
    await new Promise((r) => setTimeout(r, 30));
    const call = bridge.callApp('look', {});
    const rejected = expect(call).rejects.toThrow('getrennt');
    a.ws.close();
    await rejected;
    const b1 = await connect(p, 'tokentokentoken2');
    const b2 = await connect(p, 'tokentokentoken2');
    expect(await b1.closed).toBe(4000);
    b2.ws.close();
  });
});
