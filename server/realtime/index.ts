/**
 * Echtzeit-Server (Paket 9): ein Raum pro Insel, WebSocket-Anbindung.
 * Die eigentliche Logik steckt in room.ts; hier liegen nur Sockets, Timer und Speichern.
 *
 * Bekannte Einschränkung: Wird eine Insel über die REST-API gelöscht oder ersetzt,
 * während ein Raum offen ist, erfährt der Raum davon nichts (kein Ereignis im Vertrag).
 * Beim nächsten Beitritt wird `updatedAt` verglichen und die Welt ggf. neu geladen.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { AVATAR_SEND_RATE, WS_PATH, encodeMessage, type ServerMessage } from '../../shared/protocol';
import type { ServerContext } from '../context';
import { Room, type Outgoing } from './room';
import { RateLimiter } from './rateLimit';
import { validateClientMessage, isValidIslandId } from './validate';

const JOIN_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 20_000;
const SAVE_DELAY_MS = 1500;
const MAX_PAYLOAD = 256 * 1024;

interface RoomEntry {
  room: Room;
  sockets: Map<string, WebSocket>;
  saveTimer?: NodeJS.Timeout;
  knownUpdatedAt: number | undefined;
}

interface Conn {
  socket: WebSocket;
  alive: boolean;
  entry?: RoomEntry;
  id?: string;
  joinTimer?: NodeJS.Timeout;
  badLimit: RateLimiter;
}

export function registerRealtime(ctx: ServerContext): { close(): void } {
  const wss = new WebSocketServer({ server: ctx.http, path: WS_PATH, maxPayload: MAX_PAYLOAD });
  const rooms = new Map<string, RoomEntry>();
  const conns = new Set<Conn>();
  let guestCounter = 1;
  ctx.presence.count = (island) => rooms.get(island)?.room.size ?? 0;

  const sendTo = (socket: WebSocket, msg: ServerMessage | string) => {
    if (socket.readyState === socket.OPEN) socket.send(typeof msg === 'string' ? msg : encodeMessage(msg));
  };
  const deliver = (entry: RoomEntry, outgoing: Outgoing[]) => {
    for (const { to, msg } of outgoing) {
      const text = encodeMessage(msg);
      for (const id of to) {
        const socket = entry.sockets.get(id);
        if (socket) sendTo(socket, text);
      }
    }
  };

  const flush = (islandId: string, entry: RoomEntry) => {
    if (entry.saveTimer) clearTimeout(entry.saveTimer);
    entry.saveTimer = undefined;
    if (!entry.room.dirty) return;
    entry.room.dirty = false;
    try {
      ctx.repo.saveWorld(islandId, structuredClone(entry.room.world));
      entry.knownUpdatedAt = ctx.repo.getIsland(islandId)?.updatedAt;
    } catch (error) {
      entry.room.dirty = true;
      console.error('[realtime] Speichern fehlgeschlagen', islandId, error);
    }
  };
  const scheduleSave = (islandId: string, entry: RoomEntry) => {
    if (entry.saveTimer || !entry.room.dirty) return;
    entry.saveTimer = setTimeout(() => flush(islandId, entry), SAVE_DELAY_MS);
    entry.saveTimer.unref?.();
  };

  const fail = (conn: Conn, code: Extract<ServerMessage, { type: 'error' }>['code'], message: string, close = false) => {
    sendTo(conn.socket, { type: 'error', code, message });
    if (close) conn.socket.close(1000);
  };

  const handleJoin = (conn: Conn, msg: Extract<import('../../shared/protocol').ClientMessage, { type: 'join' }>) => {
    const islandId = msg.island;
    let entry = rooms.get(islandId);
    const detail = ctx.repo.ensureIsland(islandId);
    if (entry && !entry.room.dirty && entry.knownUpdatedAt !== detail.updatedAt) {
      entry.room.world = structuredClone(detail.world);
      entry.knownUpdatedAt = detail.updatedAt;
    }
    const user = ctx.repo.resolveToken(msg.token);
    const created = !entry;
    if (!entry) {
      entry = {
        room: new Room(islandId, structuredClone(detail.world), { canBuild: (userId) => ctx.repo.canBuild(islandId, userId) }),
        sockets: new Map(),
        knownUpdatedAt: detail.updatedAt,
      };
    }
    const result = entry.room.addMember({
      baseId: user?.id ?? `gast_${guestCounter++}`,
      userId: user?.id,
      name: user ? user.name : msg.name,
      appearance: msg.appearance,
    });
    if (!result.ok) {
      sendTo(conn.socket, result.error);
      conn.socket.close(1000);
      return;
    }
    if (created) rooms.set(islandId, entry);
    if (conn.joinTimer) clearTimeout(conn.joinTimer);
    conn.joinTimer = undefined;
    conn.entry = entry;
    conn.id = result.id;
    entry.sockets.set(result.id, conn.socket);
    deliver(entry, result.out);
  };

  const leave = (conn: Conn) => {
    const { entry, id } = conn;
    if (!entry || !id) return;
    conn.entry = undefined;
    entry.sockets.delete(id);
    deliver(entry, entry.room.removeMember(id));
    if (entry.room.size === 0) {
      flush(entry.room.islandId, entry);
      if (rooms.get(entry.room.islandId) === entry) rooms.delete(entry.room.islandId);
    }
  };

  wss.on('connection', (socket) => {
    const conn: Conn = { socket, alive: true, badLimit: new RateLimiter(1, 1000) };
    conns.add(conn);
    conn.joinTimer = setTimeout(() => {
      fail(conn, 'bad-request', 'Beitritt nicht rechtzeitig erfolgt.', true);
      socket.terminate();
    }, JOIN_TIMEOUT_MS);
    conn.joinTimer.unref?.();

    socket.on('pong', () => {
      conn.alive = true;
    });
    socket.on('error', (error) => console.error('[realtime] Socket-Fehler', error.message));
    socket.on('message', (raw) => {
      try {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          parsed = undefined;
        }
        const checked = validateClientMessage(parsed);
        if (!checked.ok) {
          const rawType = (parsed as { type?: unknown } | null | undefined)?.type;
          if (!conn.entry && rawType === 'join') fail(conn, 'bad-request', checked.error, true);
          else if (conn.badLimit.allow()) fail(conn, 'bad-request', checked.error);
          return;
        }
        const msg = checked.value;
        if (!conn.entry) {
          if (msg.type !== 'join') {
            fail(conn, 'bad-request', 'Die erste Nachricht muss „join" sein.', true);
            return;
          }
          if (!isValidIslandId(msg.island)) {
            fail(conn, 'bad-request', 'Ungültige Insel-ID.', true);
            return;
          }
          handleJoin(conn, msg);
          return;
        }
        deliver(conn.entry, conn.entry.room.handle(conn.id!, msg));
        scheduleSave(conn.entry.room.islandId, conn.entry);
      } catch (error) {
        console.error('[realtime] Fehler bei Nachricht', error);
      }
    });
    socket.on('close', () => {
      conns.delete(conn);
      if (conn.joinTimer) clearTimeout(conn.joinTimer);
      try {
        leave(conn);
      } catch (error) {
        console.error('[realtime] Fehler beim Verlassen', error);
      }
    });
  });

  const tick = setInterval(() => {
    for (const entry of rooms.values()) {
      try {
        deliver(entry, entry.room.tick());
      } catch (error) {
        console.error('[realtime] Tick-Fehler', error);
      }
    }
  }, Math.round(1000 / AVATAR_SEND_RATE));
  const heartbeat = setInterval(() => {
    for (const conn of conns) {
      if (!conn.alive) {
        conn.socket.terminate();
        continue;
      }
      conn.alive = false;
      try {
        conn.socket.ping();
      } catch {
        conn.socket.terminate();
      }
    }
  }, HEARTBEAT_MS);
  tick.unref?.();
  heartbeat.unref?.();

  return {
    close() {
      clearInterval(tick);
      clearInterval(heartbeat);
      for (const [id, entry] of rooms) flush(id, entry);
      for (const conn of conns) {
        if (conn.joinTimer) clearTimeout(conn.joinTimer);
        conn.socket.terminate();
      }
      rooms.clear();
      wss.close();
    },
  };
}
