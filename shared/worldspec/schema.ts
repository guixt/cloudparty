/**
 * Zod-Schema der WorldSpec (Regeln: docs/worldspec.md, Typen: shared/types.ts).
 * Läuft im Browser und in Node: keine DOM- oder Node-APIs.
 */
import { z } from 'zod';
import { DEFAULT_ISLAND, IDENTITY_TRANSFORM, type Quat, type Vec3, type WorldSpec } from '../types';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EXTENSION_KEY = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;

/** Schlüssel der obersten Ebene; Erweiterungen dürfen damit nicht kollidieren. */
export const TOP_LEVEL_KEYS = [
  '$schema',
  'metadata',
  'environment',
  'rules',
  'personality',
  'island',
  'entities',
  'interactions',
  'extensions',
] as const;

/** Prüft, ob ein Wert als JSON gespeichert werden kann; liefert den Pfad des ersten Verstoßes. */
export function findNonJson(value: unknown, path = '', seen: object[] = []): string | null {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return null;
    case 'number':
      return Number.isFinite(value) ? null : path || '(Wert)';
    case 'object': {
      if (seen.includes(value as object)) return path || '(Wert)';
      const next = [...seen, value as object];
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const bad = findNonJson(value[i], `${path}[${i}]`, next);
          if (bad) return bad;
        }
        return null;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return path || '(Wert)';
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        const bad = findNonJson(inner, path ? `${path}.${key}` : key, next);
        if (bad) return bad;
      }
      return null;
    }
    default:
      return path || '(Wert)';
  }
}

/** Freies JSON-Objekt (state, params, extensions-Werte). */
const jsonRecord = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  const bad = findNonJson(value);
  if (bad) ctx.addIssue({ code: 'custom', message: `enthält bei „${bad}“ einen Wert, der sich nicht als JSON speichern lässt` });
});

const finite = z.number();
const vec3 = z.array(finite).length(3, 'muss genau 3 Zahlen enthalten') as unknown as z.ZodType<Vec3>;
const quat = z.array(finite).length(4, 'muss genau 4 Zahlen enthalten (x, y, z, w)') as unknown as z.ZodType<Quat>;
const hexColor = z.string().regex(HEX_COLOR, 'muss eine Farbe im Format #RRGGBB sein');
const nonEmpty = z.string().min(1, 'darf nicht leer sein');
const unit = (name = '') => finite.min(0, `${name}muss zwischen 0 und 1 liegen`).max(1, `${name}muss zwischen 0 und 1 liegen`);

const transformSchema = z
  .object({
    pos: vec3.default(() => [...IDENTITY_TRANSFORM.pos] as Vec3),
    rot: quat.default(() => [...IDENTITY_TRANSFORM.rot] as Quat),
    scale: vec3.default(() => [...IDENTITY_TRANSFORM.scale] as Vec3),
  })
  .default(() => ({ pos: [0, 0, 0] as Vec3, rot: [0, 0, 0, 1] as Quat, scale: [1, 1, 1] as Vec3 }));

const materialSchema = z.object({
  color: hexColor.optional(),
  emissive: hexColor.optional(),
  metallic: unit().optional(),
  roughness: unit().optional(),
  alpha: unit().optional(),
  textureUrl: z.string().optional(),
  preset: z.enum(['standard', 'metall', 'chrom', 'gold', 'glas', 'spiegel', 'lack', 'holz', 'stein', 'gummi', 'neon', 'hologramm']).optional(),
  reflect: unit().optional(),
  clearcoat: unit().optional(),
  glass: unit().optional(),
  ior: finite.min(1, 'muss zwischen 1 und 2.5 liegen').max(2.5, 'muss zwischen 1 und 2.5 liegen').optional(),
  mirror: z.boolean().optional(),
  emissiveIntensity: finite.min(0, 'muss zwischen 0 und 5 liegen').max(5, 'muss zwischen 0 und 5 liegen').optional(),
  pattern: z.enum(['none', 'karo', 'streifen', 'rauschen', 'ziegel', 'holz', 'wellen']).optional(),
  patternColor: hexColor.optional(),
  uvScale: finite.min(0.1, 'muss zwischen 0.1 und 50 liegen').max(50, 'muss zwischen 0.1 und 50 liegen').optional(),
});

const physicsSchema = z.object({
  mode: z.enum(['none', 'static', 'dynamic', 'trigger']),
  mass: finite.positive('muss größer als 0 sein').optional(),
  friction: finite.min(0, 'darf nicht negativ sein').optional(),
  restitution: unit().optional(),
});

const particlesSchema = z.object({
  preset: z.enum(['fire', 'sparks', 'smoke', 'confetti']),
  enabled: z.boolean().default(true),
  rate: finite.min(0, 'darf nicht negativ sein').optional(),
});

const scriptSchema = z.object({
  source: z.string(),
  enabled: z.boolean().default(true),
});

const mediaSchema = z.object({
  kind: z.enum(['image', 'web', 'video', 'slides', 'text']),
  url: z.string().optional(),
  urls: z.array(z.string()).optional(),
  slide: z.number().int('muss eine ganze Zahl sein').min(0, 'darf nicht negativ sein').optional(),
  text: z.string().optional(),
});

const graphParam = z.union([z.string(), z.number(), z.boolean()]);
const graphEndpoint = z.object({ node: z.string(), port: z.string() });
export const graphSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean().default(true),
  nodes: z
    .array(z.object({ id: z.string().min(1), type: z.string().min(1), x: finite, y: finite, params: z.record(z.string(), graphParam).optional() }))
    .max(300, 'höchstens 300 Knoten'),
  edges: z.array(z.object({ from: graphEndpoint, to: graphEndpoint })).max(600, 'höchstens 600 Verbindungen'),
});

export const entitySchema = z.object({
  id: nonEmpty,
  ref: nonEmpty,
  name: z.string().optional(),
  transform: transformSchema,
  state: jsonRecord.optional(),
  material: materialSchema.optional(),
  physics: physicsSchema.optional(),
  particles: particlesSchema.optional(),
  script: scriptSchema.optional(),
  media: mediaSchema.optional(),
  modelUrl: z.string().optional(),
  group: z.string().optional(),
  groupName: z.string().optional(),
  graph: graphSchema.optional(),
});

const ELEVATION_MSG = 'Elevation muss zwischen -90 und 90 Grad liegen';
type Direction = { azimuth: number; elevation: number } | string;
/** Richtung als { azimuth, elevation } oder als Text "azimuth,elevation". */
const direction = z.unknown().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const checkElevation = (el: number) => {
    if (el < -90 || el > 90) fail(ELEVATION_MSG);
  };
  if (value === undefined) return fail('fehlt (Pflichtfeld)');
  if (typeof value === 'string') {
    const parts = value.split(',').map((part) => part.trim());
    const nums = parts.map((part) => (part === '' ? NaN : Number(part)));
    if (parts.length !== 2 || nums.some((n) => !Number.isFinite(n))) {
      return fail('muss als „Azimut,Elevation“ (z. B. „45,25“) oder als Objekt { azimuth, elevation } angegeben werden');
    }
    return checkElevation(nums[1]);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { azimuth, elevation } = value as Record<string, unknown>;
    if (typeof azimuth !== 'number' || !Number.isFinite(azimuth) || typeof elevation !== 'number' || !Number.isFinite(elevation)) {
      return fail('muss die Zahlen „azimuth“ und „elevation“ enthalten');
    }
    return checkElevation(elevation);
  }
  fail('muss als „Azimut,Elevation“ (z. B. „45,25“) oder als Objekt { azimuth, elevation } angegeben werden');
}) as unknown as z.ZodType<Direction>;

const environmentSchema = z
  .object({
    sky: z.object({ preset: z.enum(['clear', 'dusk', 'night', 'custom']), color: hexColor.optional() }).superRefine((sky, ctx) => {
      if (sky.preset !== 'custom' && sky.color !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['color'], message: 'ist nur beim Himmel-Preset „custom“ erlaubt' });
      }
      if (sky.preset === 'custom' && sky.color === undefined) {
        ctx.addIssue({ code: 'custom', path: ['color'], message: 'fehlt (beim Himmel-Preset „custom“ erforderlich)' });
      }
    }),
    light: z.object({
      intensity: finite.min(0, 'muss zwischen 0 und 10 liegen').max(10, 'muss zwischen 0 und 10 liegen'),
      temperatureK: finite.min(1000, 'muss zwischen 1000 und 12000 liegen').max(12000, 'muss zwischen 1000 und 12000 liegen'),
      direction,
    }),
    audio: z.object({
      soundscapeRef: nonEmpty.optional(),
      volume: unit(),
    }),
    sea: z.object({ mode: z.enum(['clouds', 'water']), color: hexColor.optional(), waves: unit().optional() }).optional(),
    look: z.enum(['standard', 'filmisch', 'warm', 'kuehl', 'comic', 'retro']).optional(),
    dayCycle: z.object({ enabled: z.boolean(), minutesPerDay: finite.min(1, 'muss zwischen 1 und 240 liegen').max(240, 'muss zwischen 1 und 240 liegen') }).optional(),
    weather: z.enum(['none', 'rain', 'snow', 'fog', 'fireflies']).optional(),
    grass: z.boolean().optional(),
  });

const rulesSchema = z.object({
  movement: z.object({
    mode: z.enum(['grounded', 'flying', 'noclip']),
    speed: finite.positive('muss größer als 0 sein'),
  }),
  gravity: z
    .object({ enabled: z.boolean(), strength: finite.optional() })
    .superRefine((gravity, ctx) => {
      if (gravity.enabled && !(gravity.strength !== undefined && gravity.strength > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['strength'],
          message: gravity.strength === undefined ? 'fehlt (bei aktivierter Schwerkraft erforderlich)' : 'muss bei aktivierter Schwerkraft größer als 0 sein',
        });
      }
    }),
  abilities: z
    .array(z.object({ id: nonEmpty, enabled: z.boolean().default(true), params: jsonRecord.optional() }))
    .default(() => []),
});

const personalitySchema = z.object({
  mood: nonEmpty,
  densityHints: z
    .object({
      min: z.number().int('muss eine ganze Zahl sein').min(0, 'darf nicht negativ sein'),
      max: z.number().int('muss eine ganze Zahl sein').min(0, 'darf nicht negativ sein'),
      peak: z.number().int('muss eine ganze Zahl sein').min(0, 'muss eine Stunde zwischen 0 und 23 sein').max(23, 'muss eine Stunde zwischen 0 und 23 sein'),
    })
    .superRefine((hints, ctx) => {
      if (hints.max < hints.min) ctx.addIssue({ code: 'custom', path: ['max'], message: 'darf nicht kleiner als „min“ sein' });
    }),
});

const islandSchema = z
  .object({
    radius: finite.positive('muss größer als 0 sein').default(DEFAULT_ISLAND.radius),
    depth: finite.positive('muss größer als 0 sein').default(DEFAULT_ISLAND.depth),
    seed: finite.default(DEFAULT_ISLAND.seed),
  })
  .default(() => ({ ...DEFAULT_ISLAND }));

export const interactionSchema = z.object({
  ref: nonEmpty,
  bindTo: nonEmpty.optional(),
  conditions: z.array(z.object({ if: z.string() })).optional(),
  effects: z.array(z.object({ do: z.string() })).optional(),
});

const metadataSchema = z.object({
  name: z.string().trim().min(1, 'darf nicht leer sein').max(100, 'darf höchstens 100 Zeichen lang sein'),
  version: z.string().regex(SEMVER, 'muss eine Version im Format MAJOR.MINOR.PATCH sein (z. B. 1.0.0)'),
  id: nonEmpty.optional(),
  owner: z.string().optional(),
});

export const worldSpecSchema = z
  .object({
    $schema: z.string().optional(),
    metadata: metadataSchema,
    environment: environmentSchema,
    rules: rulesSchema,
    personality: personalitySchema,
    island: islandSchema,
    entities: z.array(entitySchema).default(() => []),
    interactions: z.array(interactionSchema).default(() => []),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((world, ctx) => {
    const seen = new Map<string, number>();
    world.entities.forEach((entity, index) => {
      if (seen.has(entity.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['entities', index, 'id'],
          message: `„${entity.id}“ ist doppelt vergeben (schon bei entities[${seen.get(entity.id)}]); IDs müssen eindeutig sein`,
        });
      } else seen.set(entity.id, index);
    });
    world.interactions.forEach((interaction, index) => {
      if (interaction.bindTo !== undefined && !seen.has(interaction.bindTo)) {
        ctx.addIssue({
          code: 'custom',
          path: ['interactions', index, 'bindTo'],
          message: `verweist auf „${interaction.bindTo}“, aber es gibt kein Objekt mit dieser ID`,
        });
      }
    });
    for (const [key, value] of Object.entries(world.extensions ?? {})) {
      const path = ['extensions', key];
      if ((TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
        ctx.addIssue({ code: 'custom', path, message: 'kollidiert mit einem Feld der obersten Ebene' });
      } else if (!EXTENSION_KEY.test(key)) {
        ctx.addIssue({ code: 'custom', path, message: 'Namen müssen die Form „anbieter.funktion“ haben (z. B. acme.analytics)' });
      }
      const bad = findNonJson(value);
      if (bad) ctx.addIssue({ code: 'custom', path, message: `enthält bei „${bad || key}“ einen Wert, der sich nicht als JSON speichern lässt` });
    }
  });

// Kompilzeit-Prüfung: Schema-Ausgabe passt zu WorldSpec und WorldSpec zur Schema-Eingabe.
type Out = z.output<typeof worldSpecSchema>;
type In = z.input<typeof worldSpecSchema>;
const _outputIsWorldSpec = (value: Out): WorldSpec => value;
const _worldSpecIsInput = (value: WorldSpec): In => value;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _mutual: Equal<Omit<Out, 'island'>, Omit<WorldSpec, 'island'>> = true;
void _outputIsWorldSpec;
void _worldSpecIsInput;
void _mutual;
