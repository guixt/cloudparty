/**
 * Nachrichtentypen Host <-> Worker und die reine Funktion, die einen
 * Skript-Befehl auf Store/Bus anwendet. Läuft auf dem Hauptthread; der Worker
 * gilt als nicht vertrauenswürdig, darum wird jeder Befehl hier validiert.
 *
 * Wichtig: Dieses Modul wird auch im Worker gebündelt (Euler, RateLimiter,
 * Typen) und darf daher zur Laufzeit nichts aus dem Store/Bus importieren.
 */
import { SCRIPT_SOUND_NAMES } from '../../../shared/scriptApi';
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

export type ScriptCommand =
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
  | { type: 'snapshot'; snapshot: EntitySnapshot };

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
    default:
      throw new CommandError('Unbekannter Befehl');
  }
}

// ------------------------------------------------------------ Anwenden

export interface CommandDeps {
  store: WorldStore;
  bus: EventBus;
  localAvatarId(): string;
  audio: { playSound(name: string): void; playTone(frequency: number, duration: number): void };
  /** Nachricht an andere Skripte zustellen; target = null bedeutet alle außer dem Absender. */
  deliver(fromId: string, target: string | null, message: string, data: unknown): void;
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
  }
}
