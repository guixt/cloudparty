/**
 * WebSocket-Client mit Wiederverbindung. Rein (keine Browser-Globals außer
 * setTimeout), die Socket-Fabrik wird injiziert -> mit Fake-Socket testbar.
 */
import { WS_PATH, decodeMessage, encodeMessage, type ClientMessage, type ServerMessage } from '../../shared/protocol';

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

/** idle = nicht verbunden und kein Versuch geplant; waiting = Wiederverbindung geplant. */
export type Phase = 'idle' | 'connecting' | 'online' | 'waiting';

export interface ConnectionState {
  phase: Phase;
  island: string | null;
  /** Seit dem letzten connect() mindestens einmal ein welcome erhalten. */
  everOnline: boolean;
  attempt: number;
}

export interface ConnectionOptions {
  createSocket(url: string): SocketLike;
  /** Liefert die join-Nachricht (wird bei jedem Verbindungsaufbau neu gebaut). */
  buildJoin(island: string, token?: string): ClientMessage;
  onMessage(msg: ServerMessage): void;
  onState(state: ConnectionState, prev: ConnectionState): void;
  random?: () => number;
}

export const BACKOFF_MIN_MS = 1000;
export const BACKOFF_MAX_MS = 15000;
export const OFFLINE_RETRY_MS = 15000;
export const CONNECT_TIMEOUT_MS = 10000;

/** Wartezeit vor dem nächsten Versuch. Nie über BACKOFF_MAX_MS. */
export function backoffDelay(attempt: number, everOnline: boolean, random: number): number {
  if (!everOnline) return Math.round(OFFLINE_RETRY_MS * (0.85 + 0.15 * random));
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
  return Math.min(BACKOFF_MAX_MS, Math.round(base * (0.75 + 0.25 * random)));
}

/** http(s)://host[:port][/] -> ws(s)://host[:port]/ws */
export function toWsUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '').replace(/^http/i, 'ws') + WS_PATH;
}

const OPEN = 1;

export class Connection {
  state: ConnectionState = { phase: 'idle', island: null, everOnline: false, attempt: 0 };
  private socket: SocketLike | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private url = '';
  private token: string | undefined;

  constructor(private opts: ConnectionOptions) {}

  connect(url: string, island: string, token?: string): void {
    this.teardown();
    this.url = url;
    this.token = token;
    this.set({ phase: 'connecting', island, everOnline: false, attempt: 0 });
    this.open();
  }

  /** Beendet Verbindung und Wiederverbindung. */
  disconnect(): void {
    this.teardown();
    this.set({ phase: 'idle', island: null, everOnline: false, attempt: 0 });
  }

  send(msg: ClientMessage): boolean {
    if (this.state.phase !== 'online' || !this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(encodeMessage(msg));
    return true;
  }

  private set(patch: Partial<ConnectionState>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    this.opts.onState(this.state, prev);
  }

  private teardown(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.retryTimer = this.connectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
      try {
        socket.close();
      } catch {
        /* ignorieren */
      }
    }
  }

  private open(): void {
    let socket: SocketLike;
    try {
      socket = this.opts.createSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    this.connectTimer = setTimeout(() => {
      if (this.socket === socket && this.state.phase === 'connecting') this.lost(socket);
    }, CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      if (this.socket !== socket || !this.state.island) return;
      socket.send(encodeMessage(this.opts.buildJoin(this.state.island, this.token)));
    };
    socket.onmessage = (ev) => {
      if (this.socket !== socket || typeof ev.data !== 'string') return;
      const msg = decodeMessage<ServerMessage>(ev.data);
      if (!msg) return;
      if (msg.type === 'welcome') {
        if (this.connectTimer) clearTimeout(this.connectTimer);
        this.connectTimer = null;
        // Zuerst die Nachricht ausliefern (Welt laden), dann den Zustand melden.
        const prev = this.state;
        this.state = { ...prev, phase: 'online', everOnline: true, attempt: 0 };
        this.opts.onMessage(msg);
        this.opts.onState(this.state, prev);
        return;
      }
      if (msg.type === 'error' && msg.code === 'full') {
        this.teardown();
        this.opts.onMessage(msg);
        this.set({ phase: 'idle' });
        return;
      }
      this.opts.onMessage(msg);
    };
    socket.onclose = () => this.lost(socket);
    socket.onerror = () => {
      /* close folgt */
    };
  }

  private lost(socket: SocketLike): void {
    if (this.socket !== socket) return;
    this.teardown();
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    const { everOnline, attempt } = this.state;
    const delay = backoffDelay(attempt, everOnline, (this.opts.random ?? Math.random)());
    this.set({ phase: 'waiting', attempt: attempt + 1 });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.set({ phase: 'connecting' });
      this.open();
    }, delay);
  }
}
