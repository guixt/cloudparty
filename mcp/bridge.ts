/**
 * WebSocket-Brücke zur App: nur lokal (127.0.0.1), Verbindung nur mit Token.
 * Eine App-Verbindung gleichzeitig (die neueste ersetzt die ältere).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { AppToServer, ServerToApp } from '../shared/mcpBridge';
import type { AppResult, RpcBackend } from './rpc';

export const CALL_TIMEOUT_MS = 120_000;
const NOT_CONNECTED = 'Die Cloudparty-App ist nicht verbunden. Öffne die App auf diesem Rechner und schalte unter KI-Einstellungen › Externe Steuerung (MCP) die Steuerung ein (Token und Port prüfen).';

/** Token aus Umgebung oder Datei im Benutzerordner; wird bei Bedarf einmalig erzeugt. */
export function loadToken(file = join(homedir(), '.cloudparty-mcp', 'token')): string {
  const fromEnv = process.env.CLOUDPARTY_MCP_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    if (existsSync(file)) {
      const t = readFileSync(file, 'utf8').trim();
      if (t.length >= 16) return t;
    }
  } catch {
    /* neu erzeugen */
  }
  const token = randomBytes(16).toString('hex');
  try {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, `${token}\n`, { mode: 0o600 });
  } catch {
    /* ohne Datei: Token gilt nur für diesen Start */
  }
  return token;
}

export interface Bridge extends RpcBackend {
  port: number;
  status(): { connected: boolean; world?: string };
  close(): void;
}

export function startBridge(opts: { port: number; token: string; log?: (msg: string) => void }): Promise<Bridge> {
  const log = opts.log ?? (() => {});
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: opts.port, maxPayload: 24 * 1024 * 1024 });
    let app: WebSocket | null = null;
    let world: string | undefined;
    let nextId = 1;
    const pending = new Map<number, { resolve(r: AppResult): void; reject(e: Error): void; timer: NodeJS.Timeout }>();

    const failAll = (message: string) => {
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error(message));
        pending.delete(id);
      }
    };

    const status = () => ({ connected: !!app && app.readyState === app.OPEN, ...(world ? { world } : {}) });
    const callApp = (name: string, input: unknown): Promise<AppResult> => {
      const socket = app;
      if (!socket || socket.readyState !== socket.OPEN) return Promise.reject(new Error(NOT_CONNECTED));
      const id = nextId++;
      return new Promise<AppResult>((res, rej) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error('Zeitüberschreitung: Die App hat nicht rechtzeitig geantwortet.'));
        }, CALL_TIMEOUT_MS);
        pending.set(id, { resolve: res, reject: rej, timer });
        socket.send(JSON.stringify({ type: 'call', id, name, input } satisfies ServerToApp));
      });
    };

    wss.on('connection', (socket, req) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.searchParams.get('token') !== opts.token) {
        socket.close(4401, 'Token falsch');
        log('Verbindung abgelehnt (falsches Token)');
        return;
      }
      if (url.searchParams.get('role') === 'mcp') {
        // Weitere MCP-Instanz (z. B. zweiter Start durch Claude Desktop): ruft über diesen Server in der App auf.
        socket.send(JSON.stringify({ type: 'rpc-welcome' }));
        socket.on('message', (raw) => {
          let m: { type?: string; id?: number; name?: string; input?: unknown };
          try {
            m = JSON.parse(String(raw));
          } catch {
            return;
          }
          if (typeof m.id !== 'number') return;
          const id = m.id;
          if (m.type === 'rpc-status') {
            socket.send(JSON.stringify({ type: 'rpc-status-result', id, ...status() }));
          } else if (m.type === 'rpc-call' && typeof m.name === 'string') {
            callApp(m.name, m.input).then(
              (r) => socket.send(JSON.stringify({ type: 'rpc-result', id, ...r })),
              (e: Error) => socket.send(JSON.stringify({ type: 'rpc-error', id, message: e.message })),
            );
          }
        });
        return;
      }
      if (app && app !== socket) {
        failAll('Die App hat sich neu verbunden.');
        app.close(4000, 'ersetzt');
      }
      app = socket;
      world = undefined;
      log('App verbunden');
      const send = (m: ServerToApp) => socket.send(JSON.stringify(m));
      send({ type: 'welcome' });
      socket.on('message', (raw) => {
        let msg: AppToServer;
        try {
          msg = JSON.parse(String(raw)) as AppToServer;
        } catch {
          return;
        }
        if (msg.type === 'hello') world = typeof msg.world === 'string' ? msg.world.slice(0, 80) : undefined;
        else if (msg.type === 'result') {
          const p = pending.get(msg.id);
          if (!p) return;
          clearTimeout(p.timer);
          pending.delete(msg.id);
          p.resolve({ ok: !!msg.ok, content: String(msg.content ?? ''), summary: msg.summary, ...(typeof msg.image === 'string' && msg.image ? { image: msg.image } : {}) });
        }
      });
      socket.on('close', () => {
        if (app === socket) {
          app = null;
          world = undefined;
          failAll('Die App hat die Verbindung getrennt.');
          log('App getrennt');
        }
      });
    });

    wss.on('error', reject);
    wss.on('listening', () =>
      resolve({
        port: opts.port,
        status,
        callApp,
        close() {
          failAll('Server beendet.');
          wss.close();
        },
      }),
    );
  });
}

export interface Relay extends RpcBackend {
  alive(): boolean;
  close(): void;
}

/** Verbindet sich mit einem schon laufenden Server (Hub) und ruft über ihn in der App auf. */
export function connectRelay(opts: { port: number; token: string }): Promise<Relay> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${opts.port}/?token=${opts.token}&role=mcp`);
    let open = false;
    let nextId = 1;
    const pending = new Map<number, { resolve(v: any): void; reject(e: Error): void; timer: NodeJS.Timeout }>();
    const request = <T>(msg: object): Promise<T> => {
      if (!open || ws.readyState !== ws.OPEN) return Promise.reject(new Error('Die Verbindung zum Cloudparty-Server ist weg.'));
      const id = nextId++;
      return new Promise<T>((res, rej) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error('Zeitüberschreitung: Die App hat nicht rechtzeitig geantwortet.'));
        }, CALL_TIMEOUT_MS);
        pending.set(id, { resolve: res, reject: rej, timer });
        ws.send(JSON.stringify({ ...msg, id }));
      });
    };
    ws.on('message', (raw) => {
      let m: any;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (m.type === 'rpc-welcome') {
        open = true;
        resolve({
          alive: () => open && ws.readyState === ws.OPEN,
          status: async () => {
            const r = await request<{ connected: boolean; world?: string }>({ type: 'rpc-status' });
            return { connected: !!r.connected, ...(r.world ? { world: r.world } : {}) };
          },
          callApp: async (name, input) => {
            const r = await request<AppResult>({ type: 'rpc-call', name, input });
            return { ok: !!r.ok, content: String(r.content ?? ''), summary: r.summary, ...(r.image ? { image: r.image } : {}) };
          },
          close: () => ws.close(),
        });
        return;
      }
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      if (m.type === 'rpc-error') p.reject(new Error(String(m.message)));
      else p.resolve(m);
    });
    ws.on('close', (code) => {
      const was = open;
      open = false;
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error('Die Verbindung zum Cloudparty-Server ist weg.'));
        pending.delete(id);
      }
      if (!was) reject(new Error(code === 4401 ? 'Token passt nicht zum laufenden Server.' : 'Kein Server erreichbar.'));
    });
    ws.on('error', () => {
      /* close folgt */
    });
  });
}
