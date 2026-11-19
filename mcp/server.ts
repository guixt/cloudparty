/**
 * Cloudparty-MCP-Server für Claude Desktop (stdio) mit lokaler Brücke zur App.
 * Start: npx tsx mcp/server.ts   (Token anzeigen: npx tsx mcp/server.ts --show-token)
 * stdout gehört dem Protokoll; Meldungen gehen nach stderr.
 */
import { createInterface } from 'node:readline';
import { MCP_DEFAULT_PORT } from '../shared/mcpBridge';
import { loadToken, startBridge } from './bridge';
import { handleRpc, type RpcMessage } from './rpc';

const log = (m: string) => process.stderr.write(`[cloudparty-mcp] ${m}\n`);

async function main() {
  const token = loadToken();
  const port = Number(process.env.CLOUDPARTY_MCP_PORT) || MCP_DEFAULT_PORT;
  if (process.argv.includes('--show-token')) {
    process.stdout.write(`Token: ${token}\nPort: ${port}\n`);
    return;
  }
  const bridge = await startBridge({ port, token, log }).catch((e: Error) => {
    log(`Brücke konnte nicht starten (Port ${port} belegt?): ${e.message}`);
    process.exit(1);
  });
  log(`bereit auf 127.0.0.1:${port}`);
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
    bridge.close();
    process.exit(0);
  });
}

void main();
