/**
 * Server-Einstieg. VERTRAG: nur der Koordinator ändert diese Datei.
 * Start: `npm run server` (PORT und DATA_DIR per Umgebungsvariable).
 */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_SERVER_PORT } from '../shared/protocol';
import { registerApi } from './api/index';
import { createRepository } from './api/repository';
import { sendJson, type HttpHandler, type ServerContext } from './context';
import { registerRealtime } from './realtime/index';

export interface RunningServer {
  ctx: ServerContext;
  port: number;
  close(): Promise<void>;
}

export async function startServer(options: { port?: number; dataDir?: string } = {}): Promise<RunningServer> {
  const handlers: HttpHandler[] = [];
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? './data');
  const http = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }
      for (const handler of handlers) {
        if (await handler(req, res, url)) return;
      }
      sendJson(res, 404, { error: 'Nicht gefunden' });
    } catch (error) {
      console.error('[server]', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Interner Fehler' });
    }
  });

  const ctx: ServerContext = {
    http,
    repo: createRepository(dataDir),
    addHttpHandler: (handler) => handlers.push(handler),
    presence: { count: () => 0 },
    dataDir,
  };
  registerApi(ctx);
  const realtime = registerRealtime(ctx);

  const wanted = options.port ?? Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
  await new Promise<void>((done) => http.listen(wanted, done));
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : wanted;
  return {
    ctx,
    port,
    async close() {
      realtime.close();
      await new Promise<void>((done) => http.close(() => done()));
      ctx.repo.close?.();
    },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer().then(({ port }) => console.log(`[cloudparty] Server läuft auf http://localhost:${port}`));
}
