/**
 * Validierung der Werkzeug-Eingaben. Alle Eingaben stammen vom Modell und gelten als nicht vertrauenswürdig;
 * Verstöße werfen ToolError (executeTool macht daraus ein Fehlerergebnis).
 */
import { AI_LIMITS } from '../../../shared/aiTools';
import { MATERIAL_PATTERNS, MATERIAL_PRESETS, type MaterialSpec, type ParticleSpec, type PhysicsSpec, type Vec3 } from '../../../shared/types';

export class ToolError extends Error {}
export const fail = (message: string): never => {
  throw new ToolError(message);
};

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
export function size(v: unknown, label: string): Vec3 {
  const s = vec(v, label, -AI_LIMITS.maxSize, AI_LIMITS.maxSize);
  for (const c of s) if (Math.abs(c) < AI_LIMITS.minSize) return fail(`${label}: Beträge müssen mindestens ${AI_LIMITS.minSize} sein (auch flache Platten brauchen eine Dicke, z. B. [4, ${AI_LIMITS.minSize}, 4]; 0 ist nicht erlaubt).`);
  return s;
}
export function color(v: unknown, label: string): string {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) return fail(`${label} muss eine Farbe im Format #RRGGBB sein.`);
  return v.toLowerCase();
}
export function str(v: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof v !== 'string') return fail(`${label} muss Text sein.`);
  if (v.length > max) return fail(`${label} ist zu lang (max. ${max} Zeichen).`);
  if (!allowEmpty && v.trim() === '') return fail(`${label} darf nicht leer sein.`);
  return v;
}
export function oneOf<T extends string>(v: unknown, label: string, options: readonly T[]): T {
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
export function checkUrl(v: unknown, label: string): string {
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

export function parseMaterial(v: unknown, base?: MaterialSpec): MaterialSpec {
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
export function parsePhysics(v: unknown): PhysicsSpec {
  const p = obj(v, 'physics');
  const out: PhysicsSpec = { mode: oneOf(p.mode, 'physics.mode', ['none', 'static', 'dynamic', 'trigger'] as const) };
  if (p.mass !== undefined) out.mass = num(p.mass, 'physics.mass', 0.01, 100_000);
  if (p.friction !== undefined) out.friction = num(p.friction, 'physics.friction', 0, 5);
  if (p.restitution !== undefined) out.restitution = num(p.restitution, 'physics.restitution', 0, 1);
  return out;
}
export function parseParticles(v: unknown): ParticleSpec {
  const p = obj(v, 'particles');
  if (typeof p.enabled !== 'boolean') fail('particles.enabled muss true oder false sein.');
  const out: ParticleSpec = {
    preset: oneOf(p.preset, 'particles.preset', ['fire', 'sparks', 'smoke', 'confetti'] as const),
    enabled: p.enabled as boolean,
  };
  if (p.rate !== undefined) out.rate = num(p.rate, 'particles.rate', 1, 500);
  return out;
}
export function parseState(v: unknown): Record<string, unknown> {
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
