/**
 * Reine Raumlogik (keine Sockets): Mitglieder, Weltzustand, Rechteprüfung und
 * Nachrichtenbehandlung. Ergebnisse sind Listen von Ausgangsnachrichten.
 */
import type { AvatarAppearance, AvatarNetState } from '../../shared/avatar';
import { MAX_AVATARS_PER_ISLAND, MAX_CHAT_LENGTH, type ClientMessage, type RemoteAvatarInfo, type ServerMessage } from '../../shared/protocol';
import type { WorldSpec } from '../../shared/types';
import { RateLimiter } from './rateLimit';

export const MAX_ENTITIES_PER_ISLAND = 2000;

export interface Outgoing {
  to: string[];
  msg: ServerMessage;
}

type ErrorCode = Extract<ServerMessage, { type: 'error' }>['code'];

export interface Member {
  id: string;
  /** Echte Nutzer-ID; undefined bei Gästen. */
  userId?: string;
  name: string;
  appearance: AvatarAppearance;
  state: AvatarNetState;
  stateDirty: boolean;
  avatarLimit: RateLimiter;
  chatLimit: RateLimiter;
  buildLimit: RateLimiter;
  signalLimit: RateLimiter;
  errorAt: Partial<Record<ErrorCode, number>>;
}

export interface RoomOptions {
  /** Aktuelles Baurecht (wird bei jeder Baunachricht neu abgefragt). */
  canBuild(userId: string | undefined): boolean;
  now?: () => number;
  maxMembers?: number;
  maxEntities?: number;
}

export type AddResult = { ok: true; id: string; canBuild: boolean; out: Outgoing[] } | { ok: false; error: ServerMessage };

export class Room {
  world: WorldSpec;
  /** true, solange Änderungen noch nicht gespeichert wurden. */
  dirty = false;
  readonly members = new Map<string, Member>();
  private readonly now: () => number;

  constructor(
    readonly islandId: string,
    world: WorldSpec,
    private readonly opts: RoomOptions,
  ) {
    this.world = world;
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.members.size;
  }

  private others(id: string): string[] {
    return [...this.members.keys()].filter((k) => k !== id);
  }

  private info(m: Member): RemoteAvatarInfo {
    return { id: m.id, name: m.name, appearance: m.appearance, state: m.state };
  }

  addMember(input: { baseId: string; userId?: string; name: string; appearance: AvatarAppearance }): AddResult {
    if (this.members.size >= (this.opts.maxMembers ?? MAX_AVATARS_PER_ISLAND)) {
      return { ok: false, error: { type: 'error', code: 'full', message: `Diese Insel ist voll (${MAX_AVATARS_PER_ISLAND} Avatare).` } };
    }
    let id = input.baseId;
    for (let n = 2; this.members.has(id); n++) id = `${input.baseId}#${n}`;
    const member: Member = {
      id,
      userId: input.userId,
      name: input.name,
      appearance: input.appearance,
      state: { position: [0, 0, 0], yaw: 0, motion: 'idle', emotes: {} },
      stateDirty: false,
      avatarLimit: new RateLimiter(30, 1000),
      chatLimit: new RateLimiter(5, 5000),
      buildLimit: new RateLimiter(60, 1000),
      signalLimit: new RateLimiter(30, 1000),
      errorAt: {},
    };
    const existing = [...this.members.values()].map((m) => this.info(m));
    const canBuild = this.opts.canBuild(member.userId);
    this.members.set(id, member);
    const out: Outgoing[] = [
      { to: [id], msg: { type: 'welcome', selfId: id, canBuild, world: this.world, avatars: existing } },
    ];
    const others = this.others(id);
    if (others.length) out.push({ to: others, msg: { type: 'avatar.joined', avatar: this.info(member) } });
    return { ok: true, id, canBuild, out };
  }

  removeMember(id: string): Outgoing[] {
    if (!this.members.delete(id)) return [];
    const others = this.others(id);
    return others.length ? [{ to: others, msg: { type: 'avatar.left', id } }] : [];
  }

  private error(m: Member, code: ErrorCode, message: string, now: number): Outgoing[] {
    const last = m.errorAt[code];
    if (last !== undefined && now - last < 1000) return [];
    m.errorAt[code] = now;
    return [{ to: [m.id], msg: { type: 'error', code, message } }];
  }

  /** Verarbeitet eine bereits validierte Nachricht eines Mitglieds. */
  handle(id: string, msg: ClientMessage): Outgoing[] {
    const m = this.members.get(id);
    if (!m) return [];
    const now = this.now();
    switch (msg.type) {
      case 'join':
        return this.error(m, 'bad-request', 'Du bist dieser Insel bereits beigetreten.', now);
      case 'avatar':
        if (!m.avatarLimit.allow(now)) return [];
        m.state = msg.state;
        m.stateDirty = true;
        return [];
      case 'chat': {
        const text = msg.text.trim().slice(0, MAX_CHAT_LENGTH);
        if (!text) return [];
        if (!m.chatLimit.allow(now)) return this.error(m, 'rate-limit', 'Du schreibst zu schnell. Bitte warte einen Moment.', now);
        return [{ to: [...this.members.keys()], msg: { type: 'chat', from: m.id, name: m.name, text, ts: Date.now() } }];
      }
      case 'signal': {
        if (!m.signalLimit.allow(now)) return this.error(m, 'rate-limit', 'Zu viele Signale.', now);
        const others = this.others(id);
        return others.length ? [{ to: others, msg: { type: 'signal', channel: msg.channel, data: msg.data, from: m.id } }] : [];
      }
      case 'entity.upsert':
      case 'entity.remove':
      case 'environment':
        return this.build(m, msg, now);
    }
  }

  private build(m: Member, msg: Extract<ClientMessage, { type: 'entity.upsert' | 'entity.remove' | 'environment' }>, now: number): Outgoing[] {
    const reply = (message: ServerMessage): Outgoing => ({ to: [m.id], msg: message });
    if (!this.opts.canBuild(m.userId)) {
      const out = this.error(m, 'forbidden', 'Du hast auf dieser Insel kein Baurecht.', now);
      // Optimistische Änderung des Absenders zurücknehmen.
      if (msg.type === 'entity.upsert') {
        const current = this.world.entities.find((e) => e.id === msg.entity.id);
        out.push(reply(current ? { type: 'entity.upsert', entity: current, by: 'server' } : { type: 'entity.remove', id: msg.entity.id, by: 'server' }));
      } else if (msg.type === 'entity.remove') {
        const current = this.world.entities.find((e) => e.id === msg.id);
        if (current) out.push(reply({ type: 'entity.upsert', entity: current, by: 'server' }));
      } else {
        out.push(reply({ type: 'environment', environment: this.world.environment, by: 'server' }));
      }
      return out;
    }
    if (!m.buildLimit.allow(now)) return this.error(m, 'rate-limit', 'Zu viele Bauaktionen auf einmal.', now);
    const others = this.others(m.id);
    const relay = (message: ServerMessage): Outgoing[] => (others.length ? [{ to: others, msg: message }] : []);

    if (msg.type === 'entity.upsert') {
      const index = this.world.entities.findIndex((e) => e.id === msg.entity.id);
      if (index >= 0) this.world.entities[index] = msg.entity;
      else {
        if (this.world.entities.length >= (this.opts.maxEntities ?? MAX_ENTITIES_PER_ISLAND)) {
          const out = this.error(m, 'bad-request', `Diese Insel hat die Höchstzahl von ${MAX_ENTITIES_PER_ISLAND} Objekten erreicht.`, now);
          out.push(reply({ type: 'entity.remove', id: msg.entity.id, by: 'server' }));
          return out;
        }
        this.world.entities.push(msg.entity);
      }
      this.dirty = true;
      return relay({ type: 'entity.upsert', entity: msg.entity, by: m.id });
    }
    if (msg.type === 'entity.remove') {
      const before = this.world.entities.length;
      this.world.entities = this.world.entities.filter((e) => e.id !== msg.id);
      if (this.world.entities.length === before) return [];
      this.dirty = true;
      return relay({ type: 'entity.remove', id: msg.id, by: m.id });
    }
    this.world.environment = msg.environment;
    this.dirty = true;
    return relay({ type: 'environment', environment: msg.environment, by: m.id });
  }

  /** Ein Takt: ein avatar.update je geändertem Mitglied (an alle anderen). */
  tick(): Outgoing[] {
    const out: Outgoing[] = [];
    for (const m of this.members.values()) {
      if (!m.stateDirty) continue;
      m.stateDirty = false;
      const others = this.others(m.id);
      if (others.length) out.push({ to: others, msg: { type: 'avatar.update', id: m.id, state: m.state } });
    }
    return out;
  }
}
