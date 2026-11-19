/**
 * Ausführung der KI-Werkzeuge. Alle Eingaben stammen vom Modell und gelten als nicht vertrauenswürdig:
 * jedes Argument wird geprüft, Namen/Texte werden nie interpretiert, nur gespeichert.
 */
import { AI_LIMITS, getToolDefinition } from '../../../shared/aiTools';
import type { EventBus } from '../../core/events';
import type { WorldStore } from '../../core/store';
import {
  LOOK_IDS,
  MATERIAL_PATTERNS,
  MATERIAL_PRESETS,
  WEATHER_KINDS,
  type EntitySpec,
  type LookId,
  type MaterialSpec,
  type MediaKind,
  type MediaSpec,
  type ParticleSpec,
  type PhysicsSpec,
  type SeaMode,
  type SkyPreset,
  type Vec3,
  type WeatherKind,
} from '../../../shared/types';
import { PREFABS, createEntityFromPrefab, getPrefab } from '../../world/entities/prefabs';
import { eulerToQuat } from '../../scripting/runtime/commands';
import { yawToward } from '../../../shared/front';
import { buildWorldSummary, wrapData } from './summary';
import { groupHandlers } from './groupTools';
import { libraryHandlers } from './libraryTools';
import { graphHandlers } from './graphTools';
import { planHandlers } from './planTools';
import { visionHandlers } from './visionTools';
import { buildHandlers } from './buildTools';
import { brickHandlers } from './brickTools';
import { placeHandlers } from './placeTools';
import { scriptTestHandlers } from './scriptTestTools';
import { imageHandlers } from './imageTools';
import { baseEntityFor, isKnownRef, knownRefs } from './refs';
import { belowSurface, describeBelowSurface, describeOverlaps, findOverlaps } from './overlap';

export interface ToolContext {
  store: WorldStore;
  bus: EventBus;
  getAvatar(): { position: Vec3; yaw: number } | null;
  confirm(question: string, detail?: string): Promise<boolean>;
  /** true = Freigabe-Modus auto: Rückfragen entfallen (Prüfungen und Limits bleiben aktiv). */
  autoApprove?: boolean;
  /** true = der Nutzer erlaubt Screenshots (Einstellung), pro Auftrag gelesen. */
  vision?: boolean;
  /** true = der Nutzer erlaubt die Bildsuche im Internet (Einstellung), pro Auftrag gelesen. */
  imageSearch?: boolean;
  /** Lädt ein Bild herunter, verkleinert es und liefert eine JPEG-Daten-URL (oder null). */
  fetchImage?(url: string): Promise<{ dataUrl: string; width: number; height: number } | null>;
  /** Rendert die Welt aus einer Kamera und liefert ein Base64-JPEG (ohne Präfix) oder null. */
  captureView?(req: import('./capture').ViewRequest): Promise<string | null>;
  /** Ids der Objekte, die seit Start des Auftrags neu entstanden und noch vorhanden sind. */
  createdSince?(): string[];
  /** Neu, entfernt und geändert seit Start des Auftrags (für what_changed). */
  changedSince?(): import('./placeTools').ChangeSet;
}
/** Zähler pro Auftrag. */
export interface RunCounters {
  toolCalls: number;
  newEntities: number;
  removals: number;
  /** Der Nutzer hat große Löschungen in diesem Auftrag bereits erlaubt. */
  removalsApproved?: boolean;
  /** Der Nutzer hat einen großen Bau (viele neue Objekte) in diesem Auftrag erlaubt. */
  bigBuildApproved?: boolean;
  /** Bisher gemachte Screenshots in diesem Auftrag. */
  screenshots?: number;
  imageSearches?: number;
  scriptTests?: number;
  imageDownloads?: number;
}
export interface ToolOutcome {
  ok: boolean;
  /** Inhalt des tool_result für das Modell. */
  content: string;
  /** Kurzer deutscher Satz für die Oberfläche. */
  summary: string;
  mutated: boolean;
  /** Optionales Bild (Base64-JPEG ohne Präfix), wird dem Modell als Bild im Werkzeugergebnis gezeigt. */
  image?: string;
}

export class ToolError extends Error {}
export const fail = (message: string): never => {
  throw new ToolError(message);
};

const FORBIDDEN_SCRIPT = [/\bfetch\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bimport\s*\(/, /\beval\b/, /\bFunction\s*\(/, /\bimportScripts\b/];

// ---------------------------------------------------------------- Validierung

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function num(v: unknown, label: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`${label} muss eine endliche Zahl sein.`);
  if (v < min || v > max) return fail(`${label} muss zwischen ${min} und ${max} liegen (war ${v}).`);
  return v;
}
export function vec(v: unknown, label: string, min: number, max: number): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) return fail(`${label} muss ein Array aus genau 3 Zahlen sein.`);
  return [num(v[0], `${label}[0]`, min, max), num(v[1], `${label}[1]`, min, max), num(v[2], `${label}[2]`, min, max)];
}
export const coord = (v: unknown, label: string) => vec(v, label, -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate);
function size(v: unknown, label: string): Vec3 {
  const s = vec(v, label, -AI_LIMITS.maxSize, AI_LIMITS.maxSize);
  for (const c of s) if (Math.abs(c) < AI_LIMITS.minSize) return fail(`${label}: Beträge müssen mindestens ${AI_LIMITS.minSize} sein.`);
  return s;
}
function color(v: unknown, label: string): string {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) return fail(`${label} muss eine Farbe im Format #RRGGBB sein.`);
  return v.toLowerCase();
}
export function str(v: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof v !== 'string') return fail(`${label} muss Text sein.`);
  if (v.length > max) return fail(`${label} ist zu lang (max. ${max} Zeichen).`);
  if (!allowEmpty && v.trim() === '') return fail(`${label} darf nicht leer sein.`);
  return v;
}
function oneOf<T extends string>(v: unknown, label: string, options: readonly T[]): T {
  if (typeof v !== 'string' || !options.includes(v as T)) return fail(`${label} muss eines von ${options.join(', ')} sein.`);
  return v as T;
}
/** Ganze Zahl in [min, max]. */
export function int(v: unknown, label: string, min: number, max: number): number {
  const n = num(v, label, min, max);
  if (!Number.isInteger(n)) fail(`${label} muss eine ganze Zahl sein.`);
  return n;
}

export function obj(v: unknown, label: string): Record<string, unknown> {
  return isObj(v) ? v : fail(`${label} muss ein Objekt sein.`);
}
function checkUrl(v: unknown, label: string): string {
  const s = str(v, label, 2000);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(`${label} ist keine gültige Adresse.`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return fail(`${label} muss mit http:// oder https:// beginnen.`);
  return s;
}

function parseMaterial(v: unknown, base?: MaterialSpec): MaterialSpec {
  const m = obj(v, 'material');
  const out: MaterialSpec = { ...(base ?? {}) };
  if (m.color !== undefined) out.color = color(m.color, 'material.color');
  if (m.emissive !== undefined) out.emissive = color(m.emissive, 'material.emissive');
  if (m.metallic !== undefined) out.metallic = num(m.metallic, 'material.metallic', 0, 1);
  if (m.roughness !== undefined) out.roughness = num(m.roughness, 'material.roughness', 0, 1);
  if (m.alpha !== undefined) out.alpha = num(m.alpha, 'material.alpha', 0, 1);
  if (m.preset !== undefined) {
    out.preset = oneOf(m.preset, 'material.preset', MATERIAL_PRESETS);
    // Voreinstellung ohne eigene Farbe/Werte: die Standardfarbe des Bausteins darf sie nicht überstimmen (Gold wäre sonst rot).
    if (m.color === undefined) delete out.color;
    if (m.metallic === undefined) delete out.metallic;
    if (m.roughness === undefined) delete out.roughness;
  }
  if (m.reflect !== undefined) out.reflect = num(m.reflect, 'material.reflect', 0, 1);
  if (m.clearcoat !== undefined) out.clearcoat = num(m.clearcoat, 'material.clearcoat', 0, 1);
  if (m.glass !== undefined) out.glass = num(m.glass, 'material.glass', 0, 1);
  if (m.ior !== undefined) out.ior = num(m.ior, 'material.ior', 1, 2.5);
  if (m.mirror !== undefined) {
    if (typeof m.mirror !== 'boolean') fail('material.mirror muss true oder false sein.');
    out.mirror = m.mirror as boolean;
  }
  if (m.emissive_intensity !== undefined) out.emissiveIntensity = num(m.emissive_intensity, 'material.emissive_intensity', 0, 5);
  if (m.pattern !== undefined) out.pattern = oneOf(m.pattern, 'material.pattern', MATERIAL_PATTERNS);
  if (m.pattern_color !== undefined) out.patternColor = color(m.pattern_color, 'material.pattern_color');
  if (m.uv_scale !== undefined) out.uvScale = num(m.uv_scale, 'material.uv_scale', 0.1, 50);
  return out;
}
function parsePhysics(v: unknown): PhysicsSpec {
  const p = obj(v, 'physics');
  const out: PhysicsSpec = { mode: oneOf(p.mode, 'physics.mode', ['none', 'static', 'dynamic', 'trigger'] as const) };
  if (p.mass !== undefined) out.mass = num(p.mass, 'physics.mass', 0.01, 100_000);
  if (p.friction !== undefined) out.friction = num(p.friction, 'physics.friction', 0, 5);
  if (p.restitution !== undefined) out.restitution = num(p.restitution, 'physics.restitution', 0, 1);
  return out;
}
function parseParticles(v: unknown): ParticleSpec {
  const p = obj(v, 'particles');
  if (typeof p.enabled !== 'boolean') fail('particles.enabled muss true oder false sein.');
  const out: ParticleSpec = {
    preset: oneOf(p.preset, 'particles.preset', ['fire', 'sparks', 'smoke', 'confetti'] as const),
    enabled: p.enabled as boolean,
  };
  if (p.rate !== undefined) out.rate = num(p.rate, 'particles.rate', 1, 500);
  return out;
}
function parseState(v: unknown): Record<string, unknown> {
  const s = obj(v, 'state');
  let json: string;
  try {
    json = JSON.stringify(s);
  } catch {
    return fail('state ist nicht als JSON darstellbar.');
  }
  if (json.length > AI_LIMITS.maxTextLength * 2) return fail('state ist zu groß.');
  if ('__proto__' in s && Object.prototype.hasOwnProperty.call(s, '__proto__')) return fail('Ungültiger state-Schlüssel.');
  return JSON.parse(json) as Record<string, unknown>;
}

// ---------------------------------------------------------------- Hilfen

const fmt = (n: number) => {
  const v = Math.round(n * 10) / 10;
  return (v < 0 ? '−' : '') + String(Math.abs(v)).replace('.', ',');
};
const fmtPos = (p: Vec3) => `(${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])})`;
export const opts = { source: 'local' as const };

/** Mitglieder einer Gruppe (in Weltreihenfolge); leer, wenn es die Gruppe nicht gibt. */
export function groupMembers(ctx: ToolContext, groupId: string): EntitySpec[] {
  const { entities, order } = ctx.store.getState();
  return order.map((eid) => entities[eid]).filter((e): e is EntitySpec => !!e && e.group === groupId);
}

/** Eindeutiger Treffer nach Objektname (ohne Groß/Kleinschreibung); bei mehreren Treffern Fehler mit den ersten ids. */
function byName(ctx: ToolContext, sid: string): EntitySpec | undefined {
  const needle = sid.trim().toLowerCase();
  if (!needle) return undefined;
  const { entities, order } = ctx.store.getState();
  const hits = order.map((i) => entities[i]).filter((e): e is EntitySpec => !!e && (e.name ?? '').trim().toLowerCase() === needle);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(`Der Name "${sid.slice(0, 60)}" ist nicht eindeutig (${hits.length} Objekte, z. B. ${hits.slice(0, 5).map((h) => h.id).join(', ')}). Nimm eine id.`);
  return undefined;
}

/** Gruppe nach Gruppenname (eindeutig), sonst leer. */
function groupByName(ctx: ToolContext, sid: string): EntitySpec[] {
  const needle = sid.trim().toLowerCase();
  if (!needle) return [];
  const { entities, order } = ctx.store.getState();
  const hits = order.map((i) => entities[i]).filter((e): e is EntitySpec => !!e && !!e.group && (e.groupName ?? '').trim().toLowerCase() === needle);
  return new Set(hits.map((h) => h.group)).size === 1 ? hits : [];
}

export function getEntity(ctx: ToolContext, id: unknown): EntitySpec {
  const sid = str(id, 'id', 200);
  const entity = ctx.store.getState().entities[sid];
  if (entity) return entity;
  const members = groupMembers(ctx, sid);
  if (members.length > 0) {
    return fail(`"${sid.slice(0, 60)}" ist eine Gruppen-id, kein Objekt. Nimm die id eines Mitglieds (z. B. "${members[0].id}"); get_bounds, clone_group, use_texture, look, remove_entity und update_entity (material, physics, particles, move_by) akzeptieren auch Gruppen-ids.`);
  }
  return byName(ctx, sid) ?? fail(`Kein Objekt mit der id "${sid.slice(0, 60)}" gefunden. Rufe get_world auf, um gültige ids zu sehen.`);
}

/** Ziel eines Werkzeugs: ein Objekt oder (bei einer Gruppen-id oder einem eindeutigen Gruppennamen) alle Mitglieder der Gruppe. */
export function resolveTargets(ctx: ToolContext, id: unknown): { targets: EntitySpec[]; isGroup: boolean } {
  const sid = str(id, 'id', 200);
  const entity = ctx.store.getState().entities[sid];
  if (entity) return { targets: [entity], isGroup: false };
  const members = groupMembers(ctx, sid);
  if (members.length > 0) return { targets: members, isGroup: true };
  const named = byName(ctx, sid);
  if (named) return { targets: [named], isGroup: false };
  const byGroupName = groupByName(ctx, sid);
  if (byGroupName.length > 0) return { targets: byGroupName, isGroup: true };
  return { targets: [getEntity(ctx, id)], isGroup: false };
}

/** Wie getEntity, akzeptiert aber auch eine Gruppen-id (liefert dann das erste Mitglied). */
export function getEntityOrGroup(ctx: ToolContext, id: unknown): EntitySpec {
  return resolveTargets(ctx, id).targets[0];
}

/** Liste von ids (Objekt-ids, Gruppen-ids oder Namen) zu Objekten; Gruppen werden zu ihren Mitgliedern, ohne Doppelte. */
export function expandTargets(ctx: ToolContext, raw: unknown[]): EntitySpec[] {
  const out = new Map<string, EntitySpec>();
  raw.forEach((v) => {
    for (const e of resolveTargets(ctx, str(v, 'id', 200)).targets) out.set(e.id, e);
  });
  return [...out.values()];
}

/**
 * Prüft vor dem Anlegen von `count` Objekten die Grenzen: je Auftrag (maxNewEntities), je Welt (maxWorldEntities)
 * und fragt ab confirmNewEntitiesAt einmal pro Auftrag den Nutzer (außer im Modus „alles erlaubt“).
 */
export async function reserveEntities(ctx: ToolContext, counters: RunCounters, count: number, what: string): Promise<void> {
  const total = counters.newEntities + count;
  if (total > AI_LIMITS.maxNewEntities) {
    fail(`Limit: höchstens ${AI_LIMITS.maxNewEntities} neue Objekte pro Auftrag (${what} braucht ${count}, schon neu: ${counters.newEntities}). Teile die Arbeit auf mehrere Aufträge auf oder frage den Nutzer.`);
  }
  const inWorld = ctx.store.getState().order.length;
  if (inWorld + count > AI_LIMITS.maxWorldEntities) {
    fail(`Die Welt hat höchstens ${AI_LIMITS.maxWorldEntities} Objekte (jetzt ${inWorld}, ${what} braucht ${count}). Entferne Objekte oder fasse Teile zu größeren zusammen (z. B. große Platten statt vieler kleiner Steine).`);
  }
  if (!ctx.autoApprove && !counters.bigBuildApproved && total >= AI_LIMITS.confirmNewEntitiesAt) {
    const yes = await ctx.confirm(`Die KI möchte in diesem Auftrag insgesamt ${total} neue Objekte anlegen (${what}). Erlauben?`);
    if (!yes) fail('Nutzer hat abgelehnt');
    counters.bigBuildApproved = true;
  }
}

export function ok(content: string, summary: string, mutated: boolean): ToolOutcome {
  return { ok: true, content, summary, mutated };
}

/** Prüft Skriptquelltext; wirft ToolError bei Verstößen. Führt das Skript nie aus. */
export function validateScript(source: unknown): string {
  const src = str(source, 'source', AI_LIMITS.maxScriptBytes, true);
  if (new TextEncoder().encode(src).length > AI_LIMITS.maxScriptBytes) fail(`Das Skript ist zu groß (max. ${AI_LIMITS.maxScriptBytes} Bytes).`);
  for (const pattern of FORBIDDEN_SCRIPT) {
    if (pattern.test(src)) fail(`Das Skript verwendet etwas Unerlaubtes (${pattern.source.replace(/\\b|\\s\*|\\\(/g, '')}). Skripte haben keinen Netz- oder Code-Nachlade-Zugriff.`);
  }
  try {
    // Nur Syntaxprüfung: die Funktion wird nie aufgerufen.
    new Function(src);
  } catch (error) {
    fail(`Syntaxfehler im Skript: ${(error as Error).message}`);
  }
  return src;
}

// ---------------------------------------------------------------- Werkzeuge

export type Handler = (input: Record<string, unknown>, ctx: ToolContext, counters: RunCounters) => Promise<ToolOutcome> | ToolOutcome;

export function applyCommon(entity: EntitySpec, input: Record<string, unknown>, existing?: EntitySpec): EntitySpec {
  const next: EntitySpec = { ...entity, transform: { ...entity.transform } };
  if (input.name !== undefined) next.name = str(input.name, 'name', 80, true);
  if (input.position !== undefined) next.transform.pos = coord(input.position, 'position');
  if (input.rotation_degrees !== undefined) {
    const d = vec(input.rotation_degrees, 'rotation_degrees', -3600, 3600);
    next.transform.rot = eulerToQuat(d[0], d[1], d[2]);
  }
  if (input.face_toward !== undefined) {
    const t = input.face_toward as unknown[];
    if (!Array.isArray(t) || (t.length !== 2 && t.length !== 3) || t.some((v) => typeof v !== 'number' || !Number.isFinite(v))) fail('face_toward muss [x, z] oder [x, y, z] sein.');
    const [tx, tz] = t.length === 2 ? [t[0] as number, t[1] as number] : [t[0] as number, t[2] as number];
    const yaw = yawToward(next.transform.pos[0], next.transform.pos[2], tx, tz);
    next.transform.rot = eulerToQuat(0, yaw, 0);
  }
  if (input.scale !== undefined) next.transform.scale = size(input.scale, 'scale');
  if (input.material !== undefined) next.material = parseMaterial(input.material, existing?.material);
  if (input.physics !== undefined) next.physics = parsePhysics(input.physics);
  if (input.particles !== undefined) next.particles = parseParticles(input.particles);
  if (input.state !== undefined) next.state = { ...(existing?.state ?? {}), ...parseState(input.state) };
  return next;
}

const handlers: Record<string, Handler> = {
  get_world(_input, ctx) {
    const summary = buildWorldSummary(ctx.store.getState(), ctx.getAvatar(), {
      ...(typeof _input.group === 'string' ? { group: _input.group.slice(0, 100) } : {}),
      ...(typeof _input.name_contains === 'string' ? { nameContains: _input.name_contains.slice(0, 60) } : {}),
    });
    return ok(wrapData(JSON.stringify(summary)), 'Welt angesehen', false);
  },

  async add_entity(input, ctx, counters) {
    await reserveEntities(ctx, counters, 1, 'dieses Objekt');
    const ref = str(input.ref, 'ref', 100);
    if (!isKnownRef(ref)) {
      fail(`Unbekannter ref "${ref.slice(0, 60)}". Gültige refs: ${knownRefs().join(', ')}`);
    }
    const position = coord(input.position, 'position');
    const base = baseEntityFor(ref);
    // `position` ist der Ursprung der Entity (Mitte bei Grundformen, Boden bei Zusammengesetztem).
    base.transform.pos = position;
    const entity = applyCommon(base, input, base);
    ctx.store.getState().addEntity(entity, opts);
    counters.newEntities += 1;
    const label = entity.name || getPrefab(ref)?.label || 'Objekt';
    return ok(`Objekt angelegt, id="${entity.id}".`, `${label} hinzugefügt bei ${fmtPos(entity.transform.pos)}`, true);
  },

  update_entity(input, ctx) {
    const { targets, isGroup } = resolveTargets(ctx, input.id);
    if (isGroup) {
      const bad = ['position', 'rotation_degrees', 'scale', 'state'].filter((k) => input[k] !== undefined);
      if (bad.length > 0) fail(`Bei einer Gruppen-id sind ${bad.join(', ')} nicht erlaubt (jedes Teil hat eine eigene Lage). Nutze move_by, material, physics, particles oder name, oder clone_group zum Drehen/Spiegeln.`);
    }
    const changed = ['name', 'position', 'rotation_degrees', 'face_toward', 'scale', 'material', 'physics', 'particles', 'state', 'move_by'].some((k) => input[k] !== undefined);
    if (!changed) fail('update_entity: keine Änderung angegeben.');
    targets.forEach((entity, i) => {
      const own = isGroup && input.name !== undefined ? { ...input, name: `${str(input.name, 'name', 80, true)} ${i + 1}` } : input;
      let next = applyCommon(entity, own, entity);
      if (input.move_by !== undefined) {
        const d = vec(input.move_by, 'move_by', -2 * AI_LIMITS.maxCoordinate, 2 * AI_LIMITS.maxCoordinate);
        const p = next.transform.pos;
        next = { ...next, transform: { ...next.transform, pos: coord([p[0] + d[0], p[1] + d[1], p[2] + d[2]], 'neue Position') } };
      }
      const { id: _id, ...patch } = next;
      void _id;
      ctx.store.getState().updateEntity(entity.id, patch, opts);
    });
    return ok(isGroup ? `${targets.length} Objekte der Gruppe geändert.` : 'Objekt geändert.', isGroup ? `Gruppe (${targets.length} Objekte) geändert` : `${targets[0].name || 'Objekt'} geändert`, true);
  },

  async remove_entity(input, ctx, counters) {
    const { targets, isGroup } = resolveTargets(ctx, input.id);
    const first = targets[0];
    if (!ctx.autoApprove && !counters.removalsApproved && counters.removals + 1 >= AI_LIMITS.confirmRemovalsAt) {
      const what = isGroup ? `die Gruppe „${(first.groupName || 'Gruppe').slice(0, 40)}“ mit ${targets.length} Objekten` : 'ein weiteres Objekt';
      const yes = await ctx.confirm(`Die KI möchte ${what} entfernen (Aktion ${counters.removals + 1} in diesem Auftrag). Erlauben?`, first.name || first.ref);
      if (!yes) fail('Nutzer hat abgelehnt');
      counters.removalsApproved = true;
    }
    for (const e of targets) ctx.store.getState().removeEntity(e.id, opts);
    counters.removals += 1;
    if (isGroup) return ok(`Gruppe entfernt (${targets.length} Objekte).`, `${first.groupName || 'Gruppe'} entfernt (${targets.length} Objekte)`, true);
    return ok('Objekt entfernt.', `${first.name || 'Objekt'} entfernt`, true);
  },

  set_environment(input, ctx) {
    const env = ctx.store.getState().world.environment;
    const next = { ...env, sky: { ...env.sky }, light: { ...env.light } };
    let any = false;
    if (input.sky_preset !== undefined) {
      next.sky.preset = oneOf(input.sky_preset, 'sky_preset', ['clear', 'dusk', 'night', 'custom'] as const) as SkyPreset;
      any = true;
    }
    if (input.sky_color !== undefined) {
      next.sky.color = color(input.sky_color, 'sky_color');
      if (input.sky_preset === undefined) next.sky.preset = 'custom';
      any = true;
    }
    if (input.light_intensity !== undefined) {
      next.light.intensity = num(input.light_intensity, 'light_intensity', 0, 10);
      any = true;
    }
    if (input.light_temperature_k !== undefined) {
      next.light.temperatureK = num(input.light_temperature_k, 'light_temperature_k', 1000, 12000);
      any = true;
    }
    if (input.sun_azimuth_degrees !== undefined || input.sun_elevation_degrees !== undefined) {
      const cur = typeof next.light.direction === 'object' ? next.light.direction : { azimuth: 40, elevation: 50 };
      next.light.direction = {
        azimuth: input.sun_azimuth_degrees !== undefined ? num(input.sun_azimuth_degrees, 'sun_azimuth_degrees', -3600, 3600) : cur.azimuth,
        elevation: input.sun_elevation_degrees !== undefined ? num(input.sun_elevation_degrees, 'sun_elevation_degrees', -90, 90) : cur.elevation,
      };
      any = true;
    }
    if (input.sea_mode !== undefined || input.sea_color !== undefined || input.sea_waves !== undefined) {
      const sea = { mode: 'clouds' as SeaMode, ...(next.sea ?? {}) };
      if (input.sea_mode !== undefined) sea.mode = oneOf(input.sea_mode, 'sea_mode', ['clouds', 'water'] as const);
      if (input.sea_color !== undefined) sea.color = color(input.sea_color, 'sea_color');
      if (input.sea_waves !== undefined) sea.waves = num(input.sea_waves, 'sea_waves', 0, 1);
      next.sea = sea;
      any = true;
    }
    if (input.look !== undefined) {
      next.look = oneOf(input.look, 'look', LOOK_IDS) as LookId;
      any = true;
    }
    if (input.weather !== undefined) {
      next.weather = oneOf(input.weather, 'weather', WEATHER_KINDS) as WeatherKind;
      any = true;
    }
    if (input.grass !== undefined) {
      if (typeof input.grass !== 'boolean') fail('grass muss true oder false sein.');
      next.grass = input.grass as boolean;
      any = true;
    }
    if (input.day_cycle_enabled !== undefined || input.day_cycle_minutes !== undefined) {
      const cycle = { enabled: false, minutesPerDay: 20, ...(next.dayCycle ?? {}) };
      if (input.day_cycle_enabled !== undefined) {
        if (typeof input.day_cycle_enabled !== 'boolean') fail('day_cycle_enabled muss true oder false sein.');
        cycle.enabled = input.day_cycle_enabled as boolean;
      }
      if (input.day_cycle_minutes !== undefined) cycle.minutesPerDay = num(input.day_cycle_minutes, 'day_cycle_minutes', 1, 240);
      next.dayCycle = cycle;
      any = true;
    }
    if (!any) fail('set_environment: keine Änderung angegeben.');
    ctx.store.getState().setEnvironment(next, opts);
    return ok('Umgebung geändert.', 'Umgebung geändert', true);
  },

  async set_script(input, ctx) {
    const entity = getEntity(ctx, input.id);
    const source = validateScript(input.source);
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') fail('enabled muss true oder false sein.');
    if (source.trim() === '') {
      ctx.store.getState().updateEntity(entity.id, { script: undefined }, opts);
      return ok('Skript entfernt.', `Skript von ${entity.name || 'Objekt'} entfernt`, true);
    }
    if (!ctx.autoApprove) {
      const yes = await ctx.confirm(`Die KI möchte ein Skript an „${(entity.name || entity.ref).slice(0, 60)}“ hängen. Skripte sind Code – bitte prüfen. Erlauben?`, source);
      if (!yes) fail('Nutzer hat abgelehnt');
    }
    ctx.store.getState().updateEntity(entity.id, { script: { source, enabled: (input.enabled as boolean | undefined) ?? true } }, opts);
    return ok('Skript gesetzt.', `Skript an ${entity.name || 'Objekt'} gehängt`, true);
  },

  set_media(input, ctx) {
    const entity = getEntity(ctx, input.id);
    const fromRef = /^EntitySpec\.media-(image|web|video|slides|text)$/.exec(entity.ref)?.[1] as MediaKind | undefined;
    const kind: MediaKind | undefined =
      input.kind !== undefined ? oneOf(input.kind, 'kind', ['image', 'web', 'video', 'slides', 'text'] as const) : entity.media?.kind ?? fromRef;
    if (!kind) fail('kind ist erforderlich, weil dieses Objekt keine Medien-Fläche ist.');
    const media: MediaSpec = { ...(entity.media ?? {}), kind: kind as MediaKind };
    if (input.url !== undefined) media.url = checkUrl(input.url, 'url');
    if (input.urls !== undefined) {
      if (!Array.isArray(input.urls) || input.urls.length > 50) fail('urls muss eine Liste mit höchstens 50 Adressen sein.');
      media.urls = (input.urls as unknown[]).map((u, i) => checkUrl(u, `urls[${i}]`));
    }
    if (input.slide !== undefined) {
      const s = num(input.slide, 'slide', 0, 1000);
      if (!Number.isInteger(s)) fail('slide muss eine ganze Zahl sein.');
      media.slide = s;
    }
    if (input.text !== undefined) media.text = str(input.text, 'text', AI_LIMITS.maxTextLength, true);
    ctx.store.getState().updateEntity(entity.id, { media }, opts);
    return ok('Medien gesetzt.', `Medien von ${entity.name || 'Objekt'} gesetzt`, true);
  },

  move_avatar(input, ctx) {
    const hasPos = input.position !== undefined;
    const hasYaw = input.yaw_degrees !== undefined;
    if (!hasPos && !hasYaw && input.emote === undefined) fail('move_avatar: weder position, yaw_degrees noch emote angegeben.');
    const parts: string[] = [];
    if (hasPos || hasYaw) {
      const cur = ctx.getAvatar();
      const position = hasPos ? coord(input.position, 'position') : cur?.position ?? ([0, 0, 0] as Vec3);
      const yawDeg = hasYaw ? num(input.yaw_degrees, 'yaw_degrees', -3600, 3600) : undefined;
      ctx.bus.emit('avatar.teleport', { position, ...(yawDeg !== undefined ? { yaw: (yawDeg * Math.PI) / 180 } : {}) });
      parts.push(`Avatar versetzt nach ${fmtPos(position)}`);
    }
    if (input.emote !== undefined) {
      const emote = oneOf(input.emote, 'emote', ['wave', 'agree', 'raise-hand', 'dance'] as const);
      ctx.bus.emit('avatar.requestEmote', { name: emote });
      parts.push(`Geste „${emote}“`);
    }
    return ok('Avatar bewegt.', parts.join(', '), false);
  },

  say(input, ctx) {
    const text = str(input.text, 'text', 500);
    ctx.bus.emit('chat.message', { from: 'system', name: 'KI-Assistent', text, ts: Date.now(), kind: 'system' });
    return ok('Nachricht angezeigt.', 'Nachricht gesendet', false);
  },
};

/** Führt ein Werkzeug aus. Wirft nie; Fehler kommen als `ok: false` zurück. */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext, counters: RunCounters): Promise<ToolOutcome> {
  const def = getToolDefinition(name);
  const handler = def ? (handlers[name] ?? groupHandlers[name] ?? libraryHandlers[name] ?? graphHandlers[name] ?? planHandlers[name] ?? visionHandlers[name] ?? buildHandlers[name] ?? brickHandlers[name] ?? scriptTestHandlers[name] ?? imageHandlers[name] ?? placeHandlers[name]) : undefined;
  if (!def || !handler) {
    const msg = `Unbekanntes Werkzeug "${name.slice(0, 40)}".`;
    return { ok: false, content: msg, summary: msg, mutated: false };
  }
  try {
    if (isObj(rawInput) && rawInput.__invalidJson) fail('Die Argumente waren kein gültiges JSON.');
    const input = rawInput === undefined || rawInput === null ? {} : obj(rawInput, 'Argumente');
    if (def.mutates && !ctx.store.getState().canBuild) {
      return { ok: false, content: 'Der Nutzer hat auf dieser Insel kein Baurecht. Es kann nichts verändert werden; erkläre das dem Nutzer.', summary: 'Kein Baurecht', mutated: false };
    }
    const before = def.mutates ? ctx.store.getState() : null;
    const beforeOrder = before ? new Set(before.order) : null;
    const beforeTransforms = before ? new Map(before.order.map((id) => [id, before.entities[id]?.transform])) : null;
    const outcome = await handler(input, ctx, counters);
    if (!outcome.ok || !outcome.mutated || !beforeOrder || !beforeTransforms || name === 'check_overlaps') return outcome;
    // Nach dem Bauen: neue oder verschobene Objekte auf Überschneidungen und Lage unter dem Boden prüfen.
    const after = ctx.store.getState();
    const changed: string[] = [];
    for (const id of after.order) {
      if (!beforeOrder.has(id) || beforeTransforms.get(id) !== after.entities[id]?.transform) changed.push(id);
      if (changed.length >= 300) break;
    }
    if (changed.length === 0) return outcome;
    const result = findOverlaps(after.entities, after.order, changed);
    const below = belowSurface(after.entities, changed);
    const notes: string[] = [];
    if (result.total > 0) notes.push(describeOverlaps(after.entities, result));
    if (below.length > 0) notes.push(describeBelowSurface(after.entities, below));
    if (notes.length === 0) return outcome;
    return { ...outcome, content: `${outcome.content}\n${notes.join('\n')}`, summary: result.total > 0 ? `${outcome.summary} (⚠ ${result.total} Überschneidung${result.total === 1 ? '' : 'en'})` : outcome.summary };
  } catch (error) {
    const message = error instanceof ToolError ? error.message : `Interner Fehler: ${(error as Error)?.message ?? 'unbekannt'}`;
    return { ok: false, content: message, summary: `${name} fehlgeschlagen: ${message}`.slice(0, 200), mutated: false };
  }
}
