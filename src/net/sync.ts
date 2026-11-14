/**
 * Verbindet Store/Bus mit dem Netz: ausgehende Änderungen, eingehende
 * Nachrichten, entfernte Avatare, Chat. Eigener Zustand nur hier.
 */
import { AVATAR_SEND_RATE, MAX_CHAT_LENGTH, type ClientMessage, type ServerMessage } from '../../shared/protocol';
import type { AvatarNetState } from '../../shared/avatar';
import type { EntitySpec } from '../../shared/types';
import type { GameContext } from '../core/context';
import { Connection, toWsUrl, type ConnectionState, type SocketLike } from './connection';
import { Coalescer } from './outgoing';
import { RemoteAvatars } from './remoteAvatars';
import { netStore } from './netStore';
import type { TagLayer } from './nameTags';

export interface NetApi {
  connect(islandId: string, options?: { token?: string }): void;
  disconnect(): void;
  getStatus(): { online: boolean; connecting: boolean; island: string | null; avatars: number; canBuild: boolean };
}

const TRANSIENT_INTERVAL_MS = 100;
const HEAD_MARGIN = 0.25;
const DEFAULT_HEIGHT = 1.75;

function sameNetState(a: AvatarNetState, b: AvatarNetState): boolean {
  return (
    Math.abs(a.position[0] - b.position[0]) < 1e-3 &&
    Math.abs(a.position[1] - b.position[1]) < 1e-3 &&
    Math.abs(a.position[2] - b.position[2]) < 1e-3 &&
    Math.abs(a.yaw - b.yaw) < 1e-3 &&
    a.motion === b.motion &&
    JSON.stringify(a.emotes) === JSON.stringify(b.emotes)
  );
}

export interface Sync extends NetApi {
  dispose(): void;
  readonly remote: RemoteAvatars;
  /** Pro Frame (vor dem Rendern). */
  frame(dt: number): void;
}

export function createSync(ctx: GameContext, tags: TagLayer, createSocket: (url: string) => SocketLike): Sync {
  const { bus, store } = ctx;
  const remote = new RemoteAvatars(() => ctx.avatarFactory);
  const offs: (() => void)[] = [];
  /** Seit dem letzten connect()/disconnect(): gab es je ein welcome? Steuert das Baurecht beim Offline-Gehen. */
  let everWelcomed = false;
  let lastSentAvatar: AvatarNetState | null = null;
  let explicit = false;

  const conn: Connection = new Connection({
    createSocket,
    buildJoin: (island, token): ClientMessage => ({
      type: 'join',
      island,
      name: ctx.localAvatar.identity.displayName,
      ...(token ? { token } : {}),
      appearance: { ...ctx.localAvatar.appearance },
    }),
    onMessage: handleMessage,
    onState: handleState,
  });

  const online = () => conn.state.phase === 'online';
  const canSendBuild = () => online() && store.getState().canBuild;

  const out = new Coalescer<ClientMessage>((_key, msg) => {
    if (msg.type === 'avatar') lastSentAvatar = msg.state;
    conn.send(msg);
  });

  function status() {
    const phase = conn.state.phase;
    return {
      online: phase === 'online',
      connecting: phase === 'connecting' || phase === 'waiting',
      island: conn.state.island,
      avatars: phase === 'online' ? remote.count + 1 : 0,
      canBuild: store.getState().canBuild,
    };
  }
  function publishStatus() {
    const s = status();
    netStore.getState().setStatus(s);
    bus.emit('net.status', { online: s.online, island: s.island, avatars: s.avatars, canBuild: s.canBuild });
  }

  function systemLine(text: string) {
    bus.emit('chat.message', { from: 'system', name: 'System', text, ts: Date.now(), kind: 'system' });
  }

  function addRemote(info: ServerMessageAvatar) {
    const visual = remote.add(info);
    const key = `avatar:${info.id}`;
    tags.upsert(key, {
      variant: 'remote',
      getName: () => remote.getInfo(info.id)?.name ?? '',
      getWorld: (o) => {
        const v = remote.getVisual(info.id);
        if (!v) return false;
        o.copyFrom(v.root.position);
        o.y += v.height + HEAD_MARGIN;
        return true;
      },
    });
    return visual;
  }
  type ServerMessageAvatar = Extract<ServerMessage, { type: 'avatar.joined' }>['avatar'];

  function clearRemote() {
    for (const id of remote.ids()) tags.remove(`avatar:${id}`);
    remote.clear();
  }

  function sendAvatarNow() {
    const a = ctx.localAvatar;
    const state: AvatarNetState = {
      position: [...a.presence.position] as AvatarNetState['position'],
      yaw: a.presence.yaw,
      motion: a.motion,
      emotes: JSON.parse(JSON.stringify(a.emotes ?? {})),
    };
    out.sendNow('avatar', { type: 'avatar', state });
  }

  function handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'welcome': {
        clearRemote();
        out.clear();
        everWelcomed = true;
        ctx.localAvatar.identity.id = msg.selfId;
        store.getState().loadWorld(msg.world);
        store.getState().setCanBuild(msg.canBuild);
        for (const info of msg.avatars) if (info.id !== msg.selfId) addRemote(info);
        lastSentAvatar = null;
        sendAvatarNow();
        break;
      }
      case 'avatar.joined':
        if (msg.avatar.id === ctx.localAvatar.identity.id) break;
        addRemote(msg.avatar);
        systemLine(`${msg.avatar.name} hat die Insel betreten`);
        publishStatus();
        break;
      case 'avatar.left': {
        const name = remote.getInfo(msg.id)?.name;
        tags.remove(`avatar:${msg.id}`);
        remote.remove(msg.id);
        if (name) systemLine(`${name} hat die Insel verlassen`);
        publishStatus();
        break;
      }
      case 'avatar.update':
        remote.applyState(msg.id, msg.state);
        break;
      case 'chat':
        bus.emit('chat.message', { from: msg.from, name: msg.name, text: msg.text, ts: msg.ts, kind: 'avatar' });
        break;
      case 'entity.upsert':
        store.getState().addEntity(msg.entity, { source: 'remote' });
        break;
      case 'entity.remove':
        store.getState().removeEntity(msg.id, { source: 'remote' });
        break;
      case 'environment':
        store.getState().setEnvironment(msg.environment, { source: 'remote' });
        break;
      case 'signal':
        bus.emit('net.signal.received', { channel: msg.channel, data: msg.data, from: msg.from });
        break;
      case 'error':
        bus.emit('ui.toast', { text: msg.message, kind: 'error' });
        break;
    }
  }

  function handleState(state: ConnectionState, prev: ConnectionState) {
    const wasOnline = prev.phase === 'online';
    if (wasOnline && state.phase !== 'online') {
      clearRemote();
      out.clear();
      if (!explicit) {
        bus.emit('ui.toast', { text: 'Verbindung verloren – verbinde neu …', kind: 'error' });
      }
    }
    if (state.phase !== 'online' && !everWelcomed) store.getState().setCanBuild(true);
    publishStatus();
  }

  // ---- Ausgehend ----
  offs.push(
    bus.on('avatar.moved', () => {
      if (!online()) return;
      const a = ctx.localAvatar;
      const state: AvatarNetState = {
        position: [a.presence.position[0], a.presence.position[1], a.presence.position[2]],
        yaw: a.presence.yaw,
        motion: a.motion,
        emotes: JSON.parse(JSON.stringify(a.emotes ?? {})),
      };
      if (lastSentAvatar && sameNetState(lastSentAvatar, state)) {
        out.cancel('avatar');
        return;
      }
      out.push('avatar', { type: 'avatar', state }, 1000 / AVATAR_SEND_RATE);
    }),
  );

  const sendEntity = (entity: EntitySpec, transient: boolean) => {
    if (!canSendBuild()) return;
    const msg: ClientMessage = { type: 'entity.upsert', entity };
    if (transient) out.push(`entity:${entity.id}`, msg, TRANSIENT_INTERVAL_MS);
    else out.sendNow(`entity:${entity.id}`, msg);
  };
  offs.push(
    bus.on('entity.added', (e) => e.source !== 'remote' && sendEntity(e.entity, e.transient)),
    bus.on('entity.changed', (e) => e.source !== 'remote' && sendEntity(e.entity, e.transient)),
    bus.on('entity.removed', (e) => {
      if (e.source === 'remote' || !canSendBuild()) return;
      out.sendNow(`entity:${e.entity.id}`, { type: 'entity.remove', id: e.entity.id });
    }),
    bus.on('environment.changed', (e) => {
      if (e.source === 'remote' || !canSendBuild()) return;
      out.sendNow('environment', { type: 'environment', environment: e.environment });
    }),
    bus.on('net.signal.send', (e) => {
      if (online()) conn.send({ type: 'signal', channel: e.channel, data: e.data });
    }),
  );

  // ---- Chat ----
  offs.push(
    bus.on('chat.send', ({ text }) => {
      const clean = text.trim().slice(0, MAX_CHAT_LENGTH);
      if (!clean) return;
      if (online()) {
        conn.send({ type: 'chat', text: clean });
      } else {
        bus.emit('chat.message', {
          from: ctx.localAvatar.identity.id,
          name: ctx.localAvatar.identity.displayName,
          text: clean,
          ts: Date.now(),
          kind: 'avatar',
        });
      }
    }),
    bus.on('chat.message', (m) => {
      netStore.getState().addMessage(m);
      if (m.kind === 'avatar') {
        const key = m.from === ctx.localAvatar.identity.id ? 'local' : `avatar:${m.from}`;
        tags.say(key, m.text);
      } else if (m.kind === 'object') {
        sayAboveEntity(m.from, m.text);
      }
    }),
  );

  const entityKeys = new Set<string>();
  function sayAboveEntity(id: string, text: string) {
    const node = ctx.entityNodes.get(id);
    if (!node) return;
    const key = `entity:${id}`;
    if (!tags.has(key)) {
      entityKeys.add(key);
      tags.upsert(key, {
        variant: 'object',
        getWorld: (o) => {
          const n = ctx.entityNodes.get(id);
          if (!n) return false;
          const b = n.getHierarchyBoundingVectors(true);
          o.set((b.min.x + b.max.x) / 2, b.max.y + 0.3, (b.min.z + b.max.z) / 2);
          return true;
        },
      });
    }
    tags.say(key, text);
  }
  const entityTimer = setInterval(() => {
    // Leere Objekt-Marken wegräumen.
    for (const key of [...entityKeys]) {
      if (!ctx.entityNodes.has(key.slice('entity:'.length))) {
        tags.remove(key);
        entityKeys.delete(key);
      }
    }
  }, 5000);

  function connect(islandId: string, options?: { token?: string }) {
    if (!ctx.config.serverUrl) return;
    explicit = true; // Inselwechsel ist kein Verbindungsverlust
    everWelcomed = false;
    clearRemote();
    let token = options?.token;
    if (token === undefined) {
      try {
        token = localStorage.getItem('cloudparty.token') ?? undefined;
      } catch {
        /* ignorieren */
      }
    }
    conn.connect(toWsUrl(ctx.config.serverUrl), islandId, token || undefined);
    explicit = false;
  }
  function disconnect() {
    explicit = true;
    everWelcomed = false;
    conn.disconnect();
    clearRemote();
    out.clear();
    store.getState().setCanBuild(true);
    publishStatus();
  }

  return {
    connect,
    disconnect,
    getStatus: status,
    remote,
    frame(dt) {
      remote.update(dt);
    },
    dispose() {
      offs.forEach((off) => off());
      clearInterval(entityTimer);
      explicit = true;
      conn.disconnect();
      out.clear();
      clearRemote();
      for (const key of entityKeys) tags.remove(key);
    },
  };
}
