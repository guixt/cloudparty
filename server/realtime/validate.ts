/**
 * Laufzeit-Validierung eingehender Client-Nachrichten. Alle Fehlertexte sind Deutsch.
 */
import { DEFAULT_APPEARANCE, type AvatarAppearance, type AvatarMotion, type AvatarNetState, type EmoteState } from '../../shared/avatar';
import { FREEFORM_REF, sanitizeFreeformState } from '../../shared/freeform';
import { MAX_CHAT_LENGTH, type ClientMessage } from '../../shared/protocol';
import type { EntitySpec, EnvironmentSpec } from '../../shared/types';

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_COORD = 10000;
export const MAX_ENTITY_BYTES = 200_000;
export const MAX_SIGNAL_BYTES = 16_000;
export const MAX_ENVIRONMENT_BYTES = 20_000;
const MOTIONS: readonly AvatarMotion[] = ['idle', 'walk', 'run', 'jump', 'fly', 'sit'];

const fail = <T>(error: string): Validated<T> => ({ ok: false, error });
const ok = <T>(value: T): Validated<T> => ({ ok: true, value });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumArray = (v: unknown, len: number): v is number[] => Array.isArray(v) && v.length === len && v.every(isNum);

export function isValidIslandId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(id);
}

/** Trimmen, Steuerzeichen entfernen, Leerraum zusammenfassen, max. 32 Zeichen, Fallback „Gast". */
export function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') return 'Gast';
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32).trim();
  return clean || 'Gast';
}

export function sanitizeAppearance(value: unknown): AvatarAppearance {
  const out: AvatarAppearance = { ...DEFAULT_APPEARANCE };
  if (isObj(value)) {
    for (const key of ['skin', 'hair', 'shirt', 'pants'] as const) {
      const v = value[key];
      if (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)) out[key] = v;
    }
  }
  return out;
}

export function validateAvatarState(value: unknown): Validated<AvatarNetState> {
  if (!isObj(value)) return fail('Ungültiger Avatar-Zustand.');
  const { position, yaw, motion, emotes } = value;
  if (!isNumArray(position, 3) || position.some((c) => Math.abs(c) > MAX_COORD)) return fail('Ungültige Avatar-Position.');
  if (!isNum(yaw)) return fail('Ungültige Avatar-Drehung.');
  if (typeof motion !== 'string' || !MOTIONS.includes(motion as AvatarMotion)) return fail('Ungültige Bewegungsart.');
  const cleanEmotes: Record<string, EmoteState> = {};
  if (emotes !== undefined) {
    if (!isObj(emotes)) return fail('Ungültige Gesten.');
    const keys = Object.keys(emotes);
    if (keys.length > 8) return fail('Zu viele Gestenkanäle.');
    for (const key of keys) {
      const e = emotes[key];
      if (key.length > 32 || !isObj(e)) return fail('Ungültige Geste.');
      if (typeof e.name !== 'string' || e.name.length > 64 || !isNum(e.startedAt)) return fail('Ungültige Geste.');
      if (e.durationMs !== undefined && !isNum(e.durationMs)) return fail('Ungültige Geste.');
      if (e.intensity !== undefined && !isNum(e.intensity)) return fail('Ungültige Geste.');
      if (e.loop !== undefined && typeof e.loop !== 'boolean') return fail('Ungültige Geste.');
      const clean: EmoteState = { name: e.name, startedAt: e.startedAt };
      if (e.durationMs !== undefined) clean.durationMs = e.durationMs as number;
      if (e.intensity !== undefined) clean.intensity = e.intensity as number;
      if (e.loop !== undefined) clean.loop = e.loop as boolean;
      cleanEmotes[key] = clean;
    }
  }
  return ok({ position: [position[0], position[1], position[2]], yaw, motion: motion as AvatarMotion, emotes: cleanEmotes });
}

/** Gibt einen Fehlertext zurück oder null, wenn die Entity formal in Ordnung ist. */
export function validateEntity(value: unknown): Validated<EntitySpec> {
  if (!isObj(value)) return fail('Ungültiges Objekt.');
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 80) return fail('Ungültige Objekt-ID.');
  if (typeof value.ref !== 'string' || value.ref.length < 1 || value.ref.length > 100) return fail('Ungültiger Objekt-Verweis.');
  if (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 200)) return fail('Ungültiger Objektname.');
  const t = value.transform;
  if (!isObj(t) || !isNumArray(t.pos, 3) || !isNumArray(t.rot, 4) || !isNumArray(t.scale, 3)) return fail('Ungültige Transformation.');
  for (const key of ['state', 'material', 'physics', 'particles', 'script', 'media', 'graph'] as const) {
    if (value[key] !== undefined && !isObj(value[key])) return fail(`Ungültiger Abschnitt „${key}".`);
  }
  if (value.modelUrl !== undefined && typeof value.modelUrl !== 'string') return fail('Ungültige Modell-URL.');
  for (const key of ['group', 'groupName'] as const) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || (value[key] as string).length > 200)) return fail(`Ungültiges Feld „${key}".`);
  }
  if (isObj(value.graph) && (!Array.isArray(value.graph.nodes) || !Array.isArray(value.graph.edges) || value.graph.nodes.length > 300 || value.graph.edges.length > 600)) return fail('Ungültiger Logik-Graph.');
  if (value.ref === FREEFORM_REF) {
    try {
      sanitizeFreeformState(value.state);
    } catch (err) {
      return fail(err instanceof Error && err.message ? err.message : 'Ungültiger Freiform-State.');
    }
  }
  let size: number;
  try {
    size = JSON.stringify(value).length;
  } catch {
    return fail('Objekt nicht serialisierbar.');
  }
  if (size > MAX_ENTITY_BYTES) return fail('Das Objekt ist zu groß (max. 200 kB).');
  return ok(value as unknown as EntitySpec);
}

export function validateEnvironment(value: unknown): Validated<EnvironmentSpec> {
  if (!isObj(value)) return fail('Ungültige Umgebung.');
  const { sky, light, audio } = value;
  if (!isObj(sky) || typeof sky.preset !== 'string') return fail('Ungültiger Himmel.');
  if (sky.color !== undefined && typeof sky.color !== 'string') return fail('Ungültiger Himmel.');
  if (!isObj(light) || !isNum(light.intensity) || !isNum(light.temperatureK)) return fail('Ungültiges Licht.');
  if (!(typeof light.direction === 'string' || (isObj(light.direction) && isNum(light.direction.azimuth) && isNum(light.direction.elevation)))) {
    return fail('Ungültige Lichtrichtung.');
  }
  if (!isObj(audio) || !isNum(audio.volume)) return fail('Ungültiger Ton.');
  if (JSON.stringify(value).length > MAX_ENVIRONMENT_BYTES) return fail('Die Umgebung ist zu groß.');
  return ok(value as unknown as EnvironmentSpec);
}

/** Prüft jede eingehende Nachricht; liefert eine bereinigte, typisierte Kopie. */
export function validateClientMessage(raw: unknown): Validated<ClientMessage> {
  if (!isObj(raw) || typeof raw.type !== 'string') return fail('Ungültige Nachricht.');
  switch (raw.type) {
    case 'join': {
      if (!isValidIslandId(raw.island)) return fail('Ungültige Insel-ID.');
      if (raw.token !== undefined && typeof raw.token !== 'string') return fail('Ungültiges Token.');
      return ok({
        type: 'join',
        island: raw.island,
        name: sanitizeName(raw.name),
        token: raw.token as string | undefined,
        appearance: sanitizeAppearance(raw.appearance),
      });
    }
    case 'avatar': {
      const state = validateAvatarState(raw.state);
      return state.ok ? ok({ type: 'avatar', state: state.value }) : state;
    }
    case 'chat': {
      if (typeof raw.text !== 'string') return fail('Ungültiger Chat-Text.');
      return ok({ type: 'chat', text: raw.text.trim().slice(0, MAX_CHAT_LENGTH) });
    }
    case 'entity.upsert': {
      const entity = validateEntity(raw.entity);
      return entity.ok ? ok({ type: 'entity.upsert', entity: entity.value }) : entity;
    }
    case 'entity.remove': {
      if (typeof raw.id !== 'string' || raw.id.length < 1 || raw.id.length > 80) return fail('Ungültige Objekt-ID.');
      return ok({ type: 'entity.remove', id: raw.id });
    }
    case 'environment': {
      const environment = validateEnvironment(raw.environment);
      return environment.ok ? ok({ type: 'environment', environment: environment.value }) : environment;
    }
    case 'signal': {
      if (typeof raw.channel !== 'string' || raw.channel.length < 1 || raw.channel.length > 64) return fail('Ungültiger Signal-Kanal.');
      const size = JSON.stringify(raw.data ?? null).length;
      if (size > MAX_SIGNAL_BYTES) return fail('Das Signal ist zu groß (max. 16 kB).');
      return ok({ type: 'signal', channel: raw.channel, data: raw.data ?? null });
    }
    default:
      return fail('Unbekannter Nachrichtentyp.');
  }
}
