/**
 * Nachrichtentypen Host <-> Worker und die reine Funktion, die einen
 * Skript-Befehl auf Store/Bus anwendet. Läuft auf dem Hauptthread; der Worker
 * gilt als nicht vertrauenswürdig, darum wird jeder Befehl hier validiert.
 *
 * Wichtig: Dieses Modul wird auch im Worker gebündelt (Euler, RateLimiter,
 * Typen) und darf daher zur Laufzeit nichts aus dem Store/Bus importieren.
 */
import { SCRIPT_GROUP_MAX, SCRIPT_SOUND_NAMES, SCRIPT_SPAWN_REFS, SCRIPT_TWEEN_EASES, SCRIPT_TWEEN_MAX_SECONDS, type ScriptEase } from '../../../shared/scriptApi';
import type { EntitySpec, ParticlePreset, PhysicsMode, Quat, Vec3 } from '../../../shared/types';
import type { EventBus } from '../../core/events';
import type { WorldStore } from '../../core/store';

// ---------------------------------------------------------------- Protokoll

/** Zustand des eigenen Objekts, wie ihn der Worker sieht (Drehung als Euler in Grad). */
export interface EntitySnapshot {
  id: string;
  name?: string;
  position: Vec3;
  rotation: Vec3;
  state: Record<string, unknown>;
}

export type MediaOp = 'setImage' | 'setUrl' | 'setText' | 'nextSlide' | 'prevSlide';

/** Lesesicht der Welt für Skripte (wird vom Host regelmäßig an Skripte geschickt, die sie nutzen). */
export interface WorldIndexEntry {
  id: string;
  name?: string;
  group?: string;
  groupName?: string;
  ref: string;
  /** Position [x, y, z], auf 2 Stellen gerundet. */
  p: Vec3;
}
export interface WorldAvatarEntry {
  id: string;
  name: string;
  p: Vec3;
}
export interface WorldView {
  objects: WorldIndexEntry[];
  avatars: WorldAvatarEntry[];
}

export type GroupOp = 'move' | 'rotate' | 'color' | 'emissive' | 'alpha';

export interface SpawnOptions {
  scale?: Vec3;
  color?: string;
  name?: string;
  physics?: PhysicsMode;
  mass?: number;
  lifetime?: number;
}

export type ScriptCommand =
  | { c: 'tween'; op: 'move' | 'rotate' | 'scale'; v: Vec3; seconds: number; ease: ScriptEase }
  | { c: 'group'; name: string; op: GroupOp; v?: Vec3; color?: string; alpha?: number; seconds: number; ease: ScriptEase; pivot?: Vec3 }
  | { c: 'spawn'; id: string; ref: string; v: Vec3; opts: SpawnOptions }
  | { c: 'destroy'; target: string }
  | { c: 'position'; v: Vec3 }
  | { c: 'rotation'; v: Vec3 }
  | { c: 'scale'; v: Vec3 }
  | { c: 'color'; v: string }
  | { c: 'emissive'; v: string }
  | { c: 'alpha'; v: number }
  | { c: 'particles'; on: boolean; preset?: ParticlePreset }
  | { c: 'impulse'; v: Vec3 }
  | { c: 'physics'; mode: PhysicsMode }
  | { c: 'say'; text: string }
  | { c: 'setState'; key: string; value: unknown }
  | { c: 'media'; op: MediaOp; value?: string }
  | { c: 'send'; target: string; message: string; data?: unknown }
  | { c: 'broadcast'; message: string; data?: unknown }
  | { c: 'sound'; name: string }
  | { c: 'tone'; frequency: number; duration: number }
  | { c: 'teleport'; avatarId: string; v: Vec3 };

export type HostToWorker =
  | { type: 'init'; source: string; snapshot: EntitySnapshot }
  | { type: 'event'; seq: number; name: string; args: unknown[] }
  | { type: 'snapshot'; snapshot: EntitySnapshot }
  | { type: 'world'; view: Partial<WorldView> };

export type WorkerToHost =
  | { type: 'booted' }
  | { type: 'ready'; handlers: string[] }
  | { type: 'fatal'; message: string }
  | { type: 'done'; seq: number }
  | { type: 'busy' }
  | { type: 'idle' }
  | { type: 'cmd'; cmd: ScriptCommand }
  | { type: 'log'; level: 'log' | 'error'; message: string };

// ------------------------------------------------------------------- Limits

/** Befehle pro Sekunde und Skript (der Host lässt etwas mehr Spielraum als der Worker). */
export const COMMAND_LIMIT_PER_SEC = 200;
export const SAY_LIMIT_PER_SEC = 5;
export const LOG_LIMIT_PER_SEC = 100;
export const MAX_SAY_LENGTH = 500;
export const MAX_LOG_LENGTH = 1000;

export class RateLimiter {
  private windowStart = -Infinity;
  private count = 0;
  private warned = false;

  constructor(
    readonly max: number,
    readonly windowMs = 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** true = erlaubt; false = verwerfen. */
  take(): boolean {
    const t = this.now();
    if (t - this.windowStart >= this.windowMs) {
      this.windowStart = t;
      this.count = 0;
    }
    if (this.count >= this.max) return false;
    this.count += 1;
    return true;
  }

  /** Liefert genau einmal true (nach dem ersten verworfenen Aufruf), damit nur einmal gewarnt wird. */
  shouldWarn(): boolean {
    if (this.warned) return false;
    this.warned = true;
    return true;
  }
}

// ------------------------------------------------------------ Euler <-> Quat

const DEG = Math.PI / 180;

/** Euler (Grad, x = Nicken, y = Gieren, z = Rollen) -> Quaternion [x, y, z, w] (Babylon-Konvention). */
export function eulerToQuat(xDeg: number, yDeg: number, zDeg: number): Quat {
  const halfRoll = zDeg * DEG * 0.5;
  const halfPitch = xDeg * DEG * 0.5;
  const halfYaw = yDeg * DEG * 0.5;
  const sr = Math.sin(halfRoll);
  const cr = Math.cos(halfRoll);
  const sp = Math.sin(halfPitch);
  const cp = Math.cos(halfPitch);
  const sy = Math.sin(halfYaw);
  const cy = Math.cos(halfYaw);
  const q: Quat = [
    cy * sp * cr + sy * cp * sr,
    sy * cp * cr - cy * sp * sr,
    cy * cp * sr - sy * sp * cr,
    cy * cp * cr + sy * sp * sr,
  ];
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/** Quaternion [x, y, z, w] -> Euler in Grad. */
export function quatToEuler(q: Quat): Vec3 {
  const [qx, qy, qz, qw] = q;
  const zAxisY = qy * qz - qx * qw;
  const limit = 0.4999999;
  let x: number;
  let y: number;
  let z: number;
  if (zAxisY < -limit) {
    y = 2 * Math.atan2(qy, qw);
    x = Math.PI / 2;
    z = 0;
  } else if (zAxisY > limit) {
    y = 2 * Math.atan2(qy, qw);
    x = -Math.PI / 2;
    z = 0;
  } else {
    const sqw = qw * qw;
    const sqz = qz * qz;
    const sqx = qx * qx;
    const sqy = qy * qy;
    z = Math.atan2(2 * (qx * qy + qz * qw), -sqz - sqx + sqy + sqw);
    x = Math.asin(Math.max(-1, Math.min(1, -2 * zAxisY)));
    y = Math.atan2(2 * (qz * qx + qy * qw), sqz - sqx - sqy + sqw);
  }
  return [x / DEG, y / DEG, z / DEG];
}

export function snapshotOf(entity: EntitySpec): EntitySnapshot {
  return {
    id: entity.id,
    name: entity.name,
    position: [...entity.transform.pos] as Vec3,
    rotation: quatToEuler(entity.transform.rot),
    state: entity.state ? (JSON.parse(JSON.stringify(entity.state)) as Record<string, unknown>) : {},
  };
}

// --------------------------------------------------------------- Validierung

export class CommandError extends Error {}

const HEX = /^#[0-9a-fA-F]{6}$/;
const PRESETS: ParticlePreset[] = ['fire', 'sparks', 'smoke', 'confetti'];
const PHYSICS_MODES: PhysicsMode[] = ['none', 'static', 'dynamic', 'trigger'];
const MEDIA_OPS: MediaOp[] = ['setImage', 'setUrl', 'setText', 'nextSlide', 'prevSlide'];
const COORD_LIMIT = 100000;

function num(value: unknown, what: string, limit = COORD_LIMIT): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new CommandError(`${what}: Zahl erwartet`);
  if (Math.abs(value) > limit) throw new CommandError(`${what}: Wert zu groß`);
  return value;
}

function vec3(value: unknown, what: string, limit = COORD_LIMIT): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new CommandError(`${what}: drei Zahlen erwartet`);
  return [num(value[0], what, limit), num(value[1], what, limit), num(value[2], what, limit)];
}

function str(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string') throw new CommandError(`${what}: Text erwartet`);
  if (value.length > max) throw new CommandError(`${what}: Text zu lang`);
  return value;
}

function hex(value: unknown, what: string): string {
  if (typeof value !== 'string' || !HEX.test(value)) throw new CommandError(`${what}: Farbe im Format '#rrggbb' erwartet`);
  return value.toLowerCase();
}

/** Prüft, ob ein Wert JSON-tauglich ist (und nicht zu groß). */
export function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item, depth + 1));
  }
  return false;
}

function jsonData(value: unknown, what: string): unknown {
  if (value === undefined) return undefined;
  if (!isJsonValue(value)) throw new CommandError(`${what}: Wert muss JSON-tauglich sein`);
  const text = JSON.stringify(value);
  if (text.length > 100_000) throw new CommandError(`${what}: Daten zu groß`);
  return JSON.parse(text);
}

function seconds(value: unknown): number {
  if (value === undefined) return 0;
  return Math.max(0, Math.min(SCRIPT_TWEEN_MAX_SECONDS, num(value, 'Dauer', 1e9)));
}
function ease(value: unknown): ScriptEase {
  if (value === undefined) return 'inOut';
  if (!(SCRIPT_TWEEN_EASES as readonly string[]).includes(value as string)) throw new CommandError(`Kurve: unbekannt (erlaubt: ${SCRIPT_TWEEN_EASES.join(', ')})`);
  return value as ScriptEase;
}

/** Prüft einen unvertrauenswürdigen Befehl und liefert eine bereinigte Kopie. */
export function parseCommand(raw: unknown): ScriptCommand {
  if (typeof raw !== 'object' || raw === null) throw new CommandError('Ungültiger Befehl');
  const cmd = raw as Record<string, unknown>;
  switch (cmd.c) {
    case 'position':
      return { c: 'position', v: vec3(cmd.v, 'Position') };
    case 'rotation':
      return { c: 'rotation', v: vec3(cmd.v, 'Drehung', 1e6) };
    case 'scale': {
      const v = vec3(cmd.v, 'Größe', 10000);
      if (v.some((n) => n <= 0)) throw new CommandError('Größe: Werte müssen größer als 0 sein');
      return { c: 'scale', v };
    }
    case 'color':
      return { c: 'color', v: hex(cmd.v, 'Farbe') };
    case 'emissive':
      return { c: 'emissive', v: hex(cmd.v, 'Leuchtfarbe') };
    case 'alpha':
      return { c: 'alpha', v: Math.max(0, Math.min(1, num(cmd.v, 'Durchsichtigkeit'))) };
    case 'particles': {
      if (typeof cmd.on !== 'boolean') throw new CommandError('Partikel: true/false erwartet');
      if (cmd.preset !== undefined && !PRESETS.includes(cmd.preset as ParticlePreset)) {
        throw new CommandError(`Partikel: unbekanntes Preset (erlaubt: ${PRESETS.join(', ')})`);
      }
      return { c: 'particles', on: cmd.on, preset: cmd.preset as ParticlePreset | undefined };
    }
    case 'impulse':
      return { c: 'impulse', v: vec3(cmd.v, 'Impuls', 10000) };
    case 'physics':
      if (!PHYSICS_MODES.includes(cmd.mode as PhysicsMode)) {
        throw new CommandError(`Physik: unbekannter Modus (erlaubt: ${PHYSICS_MODES.join(', ')})`);
      }
      return { c: 'physics', mode: cmd.mode as PhysicsMode };
    case 'say':
      return { c: 'say', text: str(cmd.text, 'say', 100_000).slice(0, MAX_SAY_LENGTH) };
    case 'setState': {
      const key = str(cmd.key, 'setState-Schlüssel', 100);
      if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new CommandError('setState: ungültiger Schlüssel');
      }
      if (cmd.value === undefined || !isJsonValue(cmd.value)) throw new CommandError('setState: Wert muss JSON-tauglich sein');
      return { c: 'setState', key, value: jsonData(cmd.value, 'setState') };
    }
    case 'media': {
      if (!MEDIA_OPS.includes(cmd.op as MediaOp)) throw new CommandError('Medien: unbekannte Operation');
      const op = cmd.op as MediaOp;
      if (op === 'nextSlide' || op === 'prevSlide') return { c: 'media', op };
      const value = str(cmd.value, 'Medien', 5_000_000);
      if (op !== 'setText' && /^\s*(javascript|vbscript):/i.test(value)) throw new CommandError('Medien: unerlaubte Adresse');
      return { c: 'media', op, value };
    }
    case 'send':
      return {
        c: 'send',
        target: str(cmd.target, 'Ziel', 200),
        message: str(cmd.message, 'Nachricht', 200),
        data: jsonData(cmd.data, 'Nachricht'),
      };
    case 'broadcast':
      return { c: 'broadcast', message: str(cmd.message, 'Nachricht', 200), data: jsonData(cmd.data, 'Nachricht') };
    case 'sound':
      if (!(SCRIPT_SOUND_NAMES as readonly string[]).includes(cmd.name as string)) {
        throw new CommandError(`Ton: unbekannter Name (erlaubt: ${SCRIPT_SOUND_NAMES.join(', ')})`);
      }
      return { c: 'sound', name: cmd.name as string };
    case 'tone':
      return {
        c: 'tone',
        frequency: Math.max(20, Math.min(20000, num(cmd.frequency, 'Frequenz', 1e9))),
        duration: Math.max(0.01, Math.min(5, num(cmd.duration, 'Dauer', 1e9))),
      };
    case 'teleport':
      return { c: 'teleport', avatarId: str(cmd.avatarId, 'Avatar-ID', 200), v: vec3(cmd.v, 'Ziel') };
    case 'tween': {
      if (cmd.op !== 'move' && cmd.op !== 'rotate' && cmd.op !== 'scale') throw new CommandError('Bewegung: unbekannte Operation');
      const v = vec3(cmd.v, 'Ziel', cmd.op === 'rotate' ? 1e6 : COORD_LIMIT);
      if (cmd.op === 'scale' && v.some((n) => n <= 0)) throw new CommandError('Größe: Werte müssen größer als 0 sein');
      return { c: 'tween', op: cmd.op, v, seconds: seconds(cmd.seconds), ease: ease(cmd.ease) };
    }
    case 'group': {
      const op = cmd.op as GroupOp;
      if (!['move', 'rotate', 'color', 'emissive', 'alpha'].includes(op)) throw new CommandError('Gruppe: unbekannte Operation');
      const base = { c: 'group' as const, name: str(cmd.name, 'Gruppe', 200), op, seconds: seconds(cmd.seconds), ease: ease(cmd.ease) };
      if (!base.name.trim()) throw new CommandError('Gruppe: Name fehlt');
      if (op === 'move') return { ...base, v: vec3(cmd.v, 'Verschiebung') };
      if (op === 'rotate') return { ...base, v: vec3(cmd.v, 'Drehung', 1e6), ...(cmd.pivot === undefined ? {} : { pivot: vec3(cmd.pivot, 'Drehpunkt') }) };
      if (op === 'alpha') return { ...base, alpha: Math.max(0, Math.min(1, num(cmd.alpha, 'Durchsichtigkeit'))) };
      return { ...base, color: hex(cmd.color, 'Farbe') };
    }
    case 'spawn': {
      const id = str(cmd.id, 'Spawn-ID', 60);
      if (!/^sp_[a-z0-9_]{3,56}$/.test(id)) throw new CommandError('Spawn: ungültige ID');
      const ref = str(cmd.ref, 'Baustein', 100);
      if (!(SCRIPT_SPAWN_REFS as readonly string[]).includes(ref)) throw new CommandError(`Spawn: Baustein nicht erlaubt (erlaubt: ${SCRIPT_SPAWN_REFS.join(', ')})`);
      const o = (typeof cmd.opts === 'object' && cmd.opts !== null ? cmd.opts : {}) as Record<string, unknown>;
      const opts: SpawnOptions = {};
      if (o.scale !== undefined) {
        const sc = vec3(o.scale, 'Größe', 100);
        if (sc.some((n) => n < 0.05)) throw new CommandError('Größe: mindestens 0,05');
        opts.scale = sc;
      }
      if (o.color !== undefined) opts.color = hex(o.color, 'Farbe');
      if (o.name !== undefined) opts.name = str(o.name, 'Name', 80);
      if (o.physics !== undefined) {
        if (!PHYSICS_MODES.includes(o.physics as PhysicsMode)) throw new CommandError('Physik: unbekannter Modus');
        opts.physics = o.physics as PhysicsMode;
      }
      if (o.mass !== undefined) opts.mass = Math.max(0.01, Math.min(10000, num(o.mass, 'Masse', 1e9)));
      if (o.lifetime !== undefined) opts.lifetime = Math.max(0.1, Math.min(3600, num(o.lifetime, 'Lebensdauer', 1e9)));
      return { c: 'spawn', id, ref, v: vec3(cmd.v, 'Position', 400), opts };
    }
    case 'destroy':
      return { c: 'destroy', target: str(cmd.target, 'Ziel', 200) };
    default:
      throw new CommandError('Unbekannter Befehl');
  }
}

// ------------------------------------------------------------ Quaternionen

export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Wendet die Drehung q auf v an. */
export function rotateVecByQuat(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const cx = y * v[2] - z * v[1];
  const cy = z * v[0] - x * v[2];
  const cz = x * v[1] - y * v[0];
  const dx = y * cz - z * cy;
  const dy = z * cx - x * cz;
  const dz = x * cy - y * cx;
  return [v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz)];
}

/** Achse und Winkel (Grad, 0..360) einer Drehung; bei fast keiner Drehung Winkel 0. */
export function quatToAxisAngle(q: Quat): { axis: Vec3; angleDeg: number } {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const w = Math.max(-1, Math.min(1, q[3] / len));
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-6) return { axis: [0, 1, 0], angleDeg: 0 };
  return { axis: [q[0] / len / s, q[1] / len / s, q[2] / len / s], angleDeg: (2 * Math.acos(w)) / DEG };
}

/** Mitglieder einer Gruppe (Gruppen-id oder Gruppenname, ohne Groß/Kleinschreibung). */
export function groupMembers(entities: Record<string, EntitySpec>, order: readonly string[], name: string): EntitySpec[] {
  const needle = name.trim().toLowerCase();
  const out: EntitySpec[] = [];
  for (const id of order) {
    const e = entities[id];
    if (!e || !e.group) continue;
    if (e.group === name || (e.groupName ?? '').trim().toLowerCase() === needle) out.push(e);
    if (out.length >= SCRIPT_GROUP_MAX) break;
  }
  return out;
}

// ------------------------------------------------------------ Anwenden

export interface CommandDeps {
  store: WorldStore;
  bus: EventBus;
  localAvatarId(): string;
  audio: { playSound(name: string): void; playTone(frequency: number, duration: number): void };
  /** Nachricht an andere Skripte zustellen; target = null bedeutet alle außer dem Absender. */
  deliver(fromId: string, target: string | null, message: string, data: unknown): void;
  /** Neue Entity aus einem Baustein (Standardwerte) an einer Position. */
  makeEntity(ref: string, pos: Vec3): EntitySpec;
  /** Buchführung für world.spawn: Zulassen/Verbuchen/Abmelden. */
  spawns: {
    allow(owner: string): string | null;
    add(owner: string, id: string, lifetimeSec?: number): void;
    owns(owner: string, id: string): boolean;
    remove(id: string): void;
  };
}

const sameVec = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((n, i) => n === b[i]);
const SCRIPT = { source: 'script' } as const;

/** Wendet einen (unvertrauenswürdigen) Befehl des Skripts von `entityId` an. Wirft CommandError bei Fehlern. */
export function applyCommand(deps: CommandDeps, entityId: string, raw: unknown): void {
  const cmd = parseCommand(raw);
  const { store, bus } = deps;
  const entity = store.getState().entities[entityId];
  if (!entity) throw new CommandError('Das Objekt existiert nicht mehr');
  const update = (patch: Partial<EntitySpec>) => store.getState().updateEntity(entityId, patch, SCRIPT);

  switch (cmd.c) {
    case 'position':
      if (!sameVec(entity.transform.pos, cmd.v)) update({ transform: { ...entity.transform, pos: cmd.v } });
      return;
    case 'rotation': {
      const rot = eulerToQuat(cmd.v[0], cmd.v[1], cmd.v[2]);
      if (!sameVec(entity.transform.rot, rot)) update({ transform: { ...entity.transform, rot } });
      return;
    }
    case 'scale':
      if (!sameVec(entity.transform.scale, cmd.v)) update({ transform: { ...entity.transform, scale: cmd.v } });
      return;
    case 'color':
      if (entity.material?.color !== cmd.v) update({ material: { ...entity.material, color: cmd.v } });
      return;
    case 'emissive':
      if (entity.material?.emissive !== cmd.v) update({ material: { ...entity.material, emissive: cmd.v } });
      return;
    case 'alpha':
      if (entity.material?.alpha !== cmd.v) update({ material: { ...entity.material, alpha: cmd.v } });
      return;
    case 'particles': {
      const preset = cmd.preset ?? entity.particles?.preset ?? 'sparks';
      const next = { ...entity.particles, preset, enabled: cmd.on };
      update({ particles: next });
      return;
    }
    case 'impulse':
      bus.emit('entity.impulse', { entityId, impulse: cmd.v });
      return;
    case 'physics':
      if (entity.physics?.mode !== cmd.mode) update({ physics: { ...entity.physics, mode: cmd.mode } });
      return;
    case 'say': {
      const text = cmd.text.trim();
      if (!text) return;
      bus.emit('chat.message', { from: entityId, name: entity.name ?? 'Objekt', text, ts: Date.now(), kind: 'object' });
      return;
    }
    case 'setState':
      update({ state: { ...entity.state, [cmd.key]: cmd.value } });
      return;
    case 'media': {
      const media = entity.media;
      if (!media) throw new CommandError('Dieses Objekt hat keine Medien-Fläche');
      if (cmd.op === 'setImage' || cmd.op === 'setUrl') update({ media: { ...media, url: cmd.value } });
      else if (cmd.op === 'setText') update({ media: { ...media, text: cmd.value } });
      else {
        const count = media.urls?.length ?? 0;
        if (count === 0) return;
        const step = cmd.op === 'nextSlide' ? 1 : -1;
        const slide = (((media.slide ?? 0) + step) % count + count) % count;
        update({ media: { ...media, slide } });
      }
      return;
    }
    case 'send':
      bus.emit('script.message', { from: entityId, to: cmd.target, message: cmd.message, data: cmd.data });
      deps.deliver(entityId, cmd.target, cmd.message, cmd.data);
      return;
    case 'broadcast':
      bus.emit('script.message', { from: entityId, to: '*', message: cmd.message, data: cmd.data });
      deps.deliver(entityId, null, cmd.message, cmd.data);
      return;
    case 'sound':
      deps.audio.playSound(cmd.name);
      bus.emit('sound.play', { name: cmd.name });
      return;
    case 'tone':
      deps.audio.playTone(cmd.frequency, cmd.duration);
      bus.emit('sound.play', { frequency: cmd.frequency, duration: cmd.duration });
      return;
    case 'teleport':
      if (cmd.avatarId === deps.localAvatarId()) bus.emit('avatar.teleport', { position: cmd.v });
      return;
    case 'tween': {
      if (cmd.seconds > 0) bus.emit('entity.tween', { ids: [entityId], duration: cmd.seconds, ease: cmd.ease });
      if (cmd.op === 'move') {
        if (!sameVec(entity.transform.pos, cmd.v)) update({ transform: { ...entity.transform, pos: cmd.v } });
      } else if (cmd.op === 'rotate') {
        const rot = eulerToQuat(cmd.v[0], cmd.v[1], cmd.v[2]);
        if (!sameVec(entity.transform.rot, rot)) update({ transform: { ...entity.transform, rot } });
      } else if (!sameVec(entity.transform.scale, cmd.v)) {
        update({ transform: { ...entity.transform, scale: cmd.v } });
      }
      return;
    }
    case 'group': {
      const state = store.getState();
      const members = groupMembers(state.entities, state.order, cmd.name);
      if (members.length === 0) throw new CommandError(`Gruppe „${cmd.name.slice(0, 60)}“ nicht gefunden`);
      const ids = members.map((m) => m.id);
      const patch = (m: EntitySpec, p: Partial<EntitySpec>) => store.getState().updateEntity(m.id, p, SCRIPT);
      if (cmd.op === 'move' && cmd.v) {
        const d = cmd.v;
        if (cmd.seconds > 0) bus.emit('entity.tween', { ids, duration: cmd.seconds, ease: cmd.ease });
        for (const m of members) patch(m, { transform: { ...m.transform, pos: [m.transform.pos[0] + d[0], m.transform.pos[1] + d[1], m.transform.pos[2] + d[2]] } });
      } else if (cmd.op === 'rotate' && cmd.v) {
        const q = eulerToQuat(cmd.v[0], cmd.v[1], cmd.v[2]);
        const pivot: Vec3 =
          cmd.pivot ??
          (() => {
            const lo: Vec3 = [Infinity, Infinity, Infinity];
            const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
            for (const m of members) for (let k = 0; k < 3; k++) {
              lo[k] = Math.min(lo[k], m.transform.pos[k]);
              hi[k] = Math.max(hi[k], m.transform.pos[k]);
            }
            return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
          })();
        // Dreht nur um eine Achse (z. B. 360° um Z), bleibt der volle Winkel erhalten: 720° sind zwei Umläufe, auch wenn das Ergebnis gleich aussieht.
        const nonZero = cmd.v.filter((a) => a !== 0).length;
        const single: { axis: Vec3; angleDeg: number } | null =
          nonZero === 1 ? { axis: cmd.v[0] !== 0 ? [1, 0, 0] : cmd.v[1] !== 0 ? [0, 1, 0] : [0, 0, 1], angleDeg: cmd.v[0] || cmd.v[1] || cmd.v[2] } : null;
        const { axis, angleDeg } = single ?? quatToAxisAngle(q);
        if (cmd.seconds > 0) bus.emit('entity.tween', { ids, duration: cmd.seconds, ease: cmd.ease, orbit: { pivot, axis, angleDeg } });
        for (const m of members) {
          const rel: Vec3 = [m.transform.pos[0] - pivot[0], m.transform.pos[1] - pivot[1], m.transform.pos[2] - pivot[2]];
          const r = rotateVecByQuat(q, rel);
          const pos: Vec3 = [pivot[0] + r[0], pivot[1] + r[1], pivot[2] + r[2]];
          patch(m, { transform: { ...m.transform, pos, rot: quatMul(q, m.transform.rot as Quat) } });
        }
      } else if (cmd.op === 'color' && cmd.color) {
        for (const m of members) if (m.material?.color !== cmd.color) patch(m, { material: { ...m.material, color: cmd.color } });
      } else if (cmd.op === 'emissive' && cmd.color) {
        for (const m of members) if (m.material?.emissive !== cmd.color) patch(m, { material: { ...m.material, emissive: cmd.color } });
      } else if (cmd.op === 'alpha' && cmd.alpha !== undefined) {
        for (const m of members) if (m.material?.alpha !== cmd.alpha) patch(m, { material: { ...m.material, alpha: cmd.alpha } });
      }
      return;
    }
    case 'spawn': {
      const refusal = deps.spawns.allow(entityId);
      if (refusal) throw new CommandError(refusal);
      if (store.getState().entities[cmd.id]) throw new CommandError('Spawn: diese ID gibt es schon');
      const spawned = deps.makeEntity(cmd.ref, cmd.v);
      spawned.id = cmd.id;
      spawned.transform = { ...spawned.transform, pos: cmd.v };
      if (cmd.opts.scale) spawned.transform = { ...spawned.transform, scale: cmd.opts.scale };
      if (cmd.opts.color) spawned.material = { ...spawned.material, color: cmd.opts.color };
      spawned.name = cmd.opts.name ?? spawned.name ?? 'Erzeugtes Objekt';
      if (cmd.opts.physics || cmd.opts.mass !== undefined) spawned.physics = { ...(spawned.physics ?? { mode: 'static' }), mode: cmd.opts.physics ?? spawned.physics?.mode ?? 'static', ...(cmd.opts.mass !== undefined ? { mass: cmd.opts.mass } : {}) };
      store.getState().addEntity(spawned, SCRIPT);
      deps.spawns.add(entityId, cmd.id, cmd.opts.lifetime);
      return;
    }
    case 'destroy': {
      const target = store.getState().entities[cmd.target];
      if (!target) return;
      if (!deps.spawns.owns(entityId, cmd.target)) throw new CommandError('Es können nur mit world.spawn erzeugte Objekte entfernt werden');
      store.getState().removeEntity(cmd.target, SCRIPT);
      deps.spawns.remove(cmd.target);
      return;
    }
  }
}
