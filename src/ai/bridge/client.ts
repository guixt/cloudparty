/**
 * Verbindung der App zum lokalen MCP-Server: nimmt Werkzeugaufrufe entgegen und führt sie aus.
 * Verbindet sich nur mit 127.0.0.1 und nur mit Token, baut sich bei Abbruch selbst wieder auf.
 */
import type { AppToServer, ServerToApp } from '../../../shared/mcpBridge';

export interface SocketLike {
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export interface CallResult {
  ok: boolean;
  content: string;
  summary: string;
  image?: string;
}

export interface BridgeClientDeps {
  createSocket(url: string): SocketLike;
  run(name: string, input: unknown): Promise<CallResult>;
  world(): string;
  onStatus(state: 'off' | 'connecting' | 'connected' | 'rejected', detail?: string): void;
  retryMs?: number;
}

export interface BridgeClient {
  start(port: number, token: string): void;
  stop(): void;
}

export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
  let socket: SocketLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let generation = 0;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const connect = (port: number, token: string, gen: number) => {
    if (!active || gen !== generation) return;
    deps.onStatus('connecting');
    let s: SocketLike;
    try {
      s = deps.createSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`);
    } catch {
      deps.onStatus('connecting', 'Verbindung nicht möglich');
      timer = setTimeout(() => connect(port, token, gen), deps.retryMs ?? 3000);
      return;
    }
    socket = s;
    const send = (m: AppToServer) => s.send(JSON.stringify(m));
    s.onmessage = (ev) => {
      let msg: ServerToApp;
      try {
        msg = JSON.parse(String(ev.data)) as ServerToApp;
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        deps.onStatus('connected');
        send({ type: 'hello', world: deps.world() });
      } else if (msg.type === 'call') {
        void deps
          .run(msg.name, msg.input)
          .catch((e: Error): CallResult => ({ ok: false, content: `Interner Fehler: ${e.message}`, summary: 'Fehler' }))
          .then((r) => send({ type: 'result', id: msg.id, ok: r.ok, content: r.content, summary: r.summary, ...(r.image ? { image: r.image } : {}) }));
      }
    };
    s.onclose = (ev) => {
      if (gen !== generation) return;
      socket = null;
      if (ev.code === 4401) {
        deps.onStatus('rejected', 'Token falsch');
        return;
      }
      if (!active) return;
      deps.onStatus('connecting', 'Server nicht erreichbar, neuer Versuch …');
      timer = setTimeout(() => connect(port, token, gen), deps.retryMs ?? 3000);
    };
    s.onerror = () => {
      /* onclose folgt */
    };
  };

  return {
    start(port, token) {
      this.stop();
      if (!token) {
        deps.onStatus('off', 'Kein Token eingetragen');
        return;
      }
      active = true;
      generation += 1;
      connect(port, token, generation);
    },
    stop() {
      active = false;
      generation += 1;
      clearTimer();
      const s = socket;
      socket = null;
      if (s) {
        s.onclose = null;
        s.close();
      }
      deps.onStatus('off');
    },
  };
}
