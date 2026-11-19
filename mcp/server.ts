/**
 * Cloudparty-MCP-Server für Claude Desktop (stdio) mit lokaler Brücke zur App.
 * Start: npx tsx mcp/server.ts   (Token anzeigen: npx tsx mcp/server.ts --show-token)
 * stdout gehört dem Protokoll; Meldungen gehen nach stderr.
 */
import { createInterface } from 'node:readline';
import { MCP_DEFAULT_PORT } from '../shared/mcpBridge';
import { connectRelay, loadToken, startBridge, type Bridge, type Relay } from './bridge';
import { handleRpc, type RpcBackend, type RpcMessage } from './rpc';

const log = (m: string) => process.stderr.write(`[cloudparty-mcp] ${m}\n`);

async function main() {
  const token = loadToken();
  const port = Number(process.env.CLOUDPARTY_MCP_PORT) || MCP_DEFAULT_PORT;
  if (process.argv.includes('--show-token')) {
    process.stdout.write(`Token: ${token}\nPort: ${port}\n`);
    return;
  }
  // Erster Start besitzt die Brücke (Hub). Jeder weitere Start (zweite Instanz, übrig gebliebener Prozess)
  // hängt sich an den Hub und ruft über ihn in der App auf; stirbt der Hub, übernimmt der nächste Aufruf.
  let hub: Bridge | null = null;
  let relay: Relay | null = null;
  const ensure = async (): Promise<RpcBackend> => {
    if (hub) return hub;
    if (relay?.alive()) return relay;
    try {
      hub = await startBridge({ port, token, log });
      log(`bereit auf 127.0.0.1:${port}`);
      return hub;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    }
    relay = await connectRelay({ port, token }).catch((e: Error) => {
      throw new Error(`Port ${port} ist belegt und der Server dort passt nicht (${e.message}). Beende andere Cloudparty-MCP-Prozesse (Task-Manager › node) oder setze CLOUDPARTY_MCP_PORT.`);
    });
    log(`Port ${port} belegt: nutze den laufenden Server als Hub`);
    return relay;
  };
  const bridge: RpcBackend = {
    async status() {
      return (await ensure()).status();
    },
    async callApp(name, input) {
      return (await ensure()).callApp(name, input);
    },
  };
  void ensure().catch((e: Error) => log(e.message));
  const send = (m: object) => process.stdout.write(`${JSON.stringify(m)}\n`);
  const rl = createInterface({ input: process.stdin });
  const running = new Set<Promise<unknown>>();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: RpcMessage;
    try {
      msg = JSON.parse(line) as RpcMessage;
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Ungültiges JSON' } });
      return;
    }
    const job = handleRpc(msg, bridge)
      .then((r) => {
        if (r) send(r);
      })
      .catch((e: Error) => send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: e.message } }))
      .finally(() => running.delete(job));
    running.add(job);
  });
  rl.on('close', async () => {
    await Promise.allSettled([...running]);
    hub?.close();
    relay?.close();
    process.exit(0);
  });
}

void main();
