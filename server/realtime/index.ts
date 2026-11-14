/**
 * STUB des Fundaments – Paket 9 (Echtzeit-Server) ersetzt diese Datei.
 * Vorerst: einfacher Relay pro Insel ohne Ratenbegrenzung und ohne Tests.
 * Die Signatur von registerRealtime bleibt.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import {
  MAX_AVATARS_PER_ISLAND,
  WS_PATH,
  decodeMessage,
  encodeMessage,
  type ClientMessage,
  type RemoteAvatarInfo,
  type ServerMessage,
} from '../../shared/protocol';
import type { ServerContext } from '../context';

interface Client {
  socket: WebSocket;
  island: string;
  info: RemoteAvatarInfo;
  canBuild: boolean;
}

export function registerRealtime(ctx: ServerContext): { close(): void } {
  const wss = new WebSocketServer({ server: ctx.http, path: WS_PATH });
  const rooms = new Map<string, Set<Client>>();
  let nextId = 1;
  ctx.presence.count = (island) => rooms.get(island)?.size ?? 0;

  const send = (socket: WebSocket, msg: ServerMessage) => socket.readyState === socket.OPEN && socket.send(encodeMessage(msg));
  const broadcast = (island: string, msg: ServerMessage, except?: Client) => {
    for (const client of rooms.get(island) ?? []) if (client !== except) send(client.socket, msg);
  };

  wss.on('connection', (socket) => {
    let self: Client | null = null;
    socket.on('message', (raw) => {
      const msg = decodeMessage<ClientMessage>(raw.toString());
      if (!msg) return;
      if (msg.type === 'join') {
        if (self) return;
        const room = rooms.get(msg.island) ?? new Set<Client>();
        if (room.size >= MAX_AVATARS_PER_ISLAND) {
          send(socket, { type: 'error', code: 'full', message: 'Diese Insel ist voll (25 Avatare).' });
          return;
        }
        const island = ctx.repo.ensureIsland(msg.island);
        const user = ctx.repo.resolveToken(msg.token);
        self = {
          socket,
          island: msg.island,
          canBuild: ctx.repo.canBuild(msg.island, user?.id),
          info: {
            id: user?.id ?? `gast_${nextId++}`,
            name: user?.name ?? msg.name,
            appearance: msg.appearance,
            state: { position: [0, 0, 0], yaw: 0, motion: 'idle', emotes: {} },
          },
        };
        rooms.set(msg.island, room);
        send(socket, { type: 'welcome', selfId: self.info.id, canBuild: self.canBuild, world: island.world, avatars: [...room].map((c) => c.info) });
        room.add(self);
        broadcast(msg.island, { type: 'avatar.joined', avatar: self.info }, self);
        return;
      }
      if (!self) return;
      const island = ctx.repo.getIsland(self.island);
      switch (msg.type) {
        case 'avatar':
          self.info.state = msg.state;
          broadcast(self.island, { type: 'avatar.update', id: self.info.id, state: msg.state }, self);
          break;
        case 'chat':
          broadcast(self.island, { type: 'chat', from: self.info.id, name: self.info.name, text: msg.text.slice(0, 500), ts: Date.now() });
          break;
        case 'entity.upsert':
        case 'entity.remove':
        case 'environment': {
          if (!self.canBuild || !island) {
            send(socket, { type: 'error', code: 'forbidden', message: 'Kein Baurecht auf dieser Insel.' });
            break;
          }
          const world = island.world;
          if (msg.type === 'entity.upsert') {
            const index = world.entities.findIndex((e) => e.id === msg.entity.id);
            if (index >= 0) world.entities[index] = msg.entity;
            else world.entities.push(msg.entity);
            broadcast(self.island, { type: 'entity.upsert', entity: msg.entity, by: self.info.id }, self);
          } else if (msg.type === 'entity.remove') {
            world.entities = world.entities.filter((e) => e.id !== msg.id);
            broadcast(self.island, { type: 'entity.remove', id: msg.id, by: self.info.id }, self);
          } else {
            world.environment = msg.environment;
            broadcast(self.island, { type: 'environment', environment: msg.environment, by: self.info.id }, self);
          }
          ctx.repo.saveWorld(self.island, world);
          break;
        }
        case 'signal':
          broadcast(self.island, { type: 'signal', channel: msg.channel, data: msg.data, from: self.info.id }, self);
          break;
      }
    });
    socket.on('close', () => {
      if (!self) return;
      const room = rooms.get(self.island);
      room?.delete(self);
      if (room && room.size === 0) rooms.delete(self.island);
      broadcast(self.island, { type: 'avatar.left', id: self.info.id });
    });
  });

  return {
    close() {
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}
