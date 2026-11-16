/**
 * Zentrale Datentypen für Welten (WorldSpec). Quelle: docs/worldspec.md,
 * erweitert um Material, Physik, Partikel, Skript und Medien pro Entity.
 * VERTRAG: Diese Datei wird nur vom Koordinator geändert.
 */
import type { GraphSpec } from './graph';

export type Vec3 = [number, number, number];
/** Quaternion als [x, y, z, w]. */
export type Quat = [number, number, number, number];

export interface Transform {
  pos: Vec3;
  rot: Quat;
  scale: Vec3;
}

/** Materialvoreinstellungen (setzen sinnvolle Werte; einzelne Felder überschreiben sie). */
export const MATERIAL_PRESETS = ['standard', 'metall', 'chrom', 'gold', 'glas', 'spiegel', 'lack', 'holz', 'stein', 'gummi', 'neon', 'hologramm'] as const;
export type MaterialPreset = (typeof MATERIAL_PRESETS)[number];
/** Prozedurale Muster auf der Oberfläche (ohne Bilddatei). */
export const MATERIAL_PATTERNS = ['none', 'karo', 'streifen', 'rauschen', 'ziegel', 'holz', 'wellen'] as const;
export type MaterialPattern = (typeof MATERIAL_PATTERNS)[number];

export interface MaterialSpec {
  /** Grundfarbe als #RRGGBB. */
  color?: string;
  /** Leuchtfarbe als #RRGGBB (für Glow). */
  emissive?: string;
  metallic?: number;
  roughness?: number;
  /** 0..1, 1 = undurchsichtig. */
  alpha?: number;
  textureUrl?: string;
  /** Voreinstellung; die übrigen Felder überschreiben einzelne Werte der Voreinstellung. */
  preset?: MaterialPreset;
  /** 0..1: Stärke der Umgebungs-Reflexion (Spiegelung von Himmel und Umgebung). */
  reflect?: number;
  /** 0..1: Klarlackschicht (zusätzlicher glänzender Film wie bei Autolack). */
  clearcoat?: number;
  /** 0..1: Glas – durchsichtig mit Lichtbrechung (Verzerrung des Dahinterliegenden). */
  glass?: number;
  /** Brechungsindex für Glas (1 = keine Brechung, 1.5 = Glas, 2.4 = Diamant). */
  ior?: number;
  /** Echtzeit-Spiegel (spiegelt die Szene wirklich); sinnvoll für ebene Flächen, kostet Leistung. */
  mirror?: boolean;
  /** 0..5: Helligkeit des Leuchtens (Faktor auf `emissive`). */
  emissiveIntensity?: number;
  /** Prozedurales Muster. */
  pattern?: MaterialPattern;
  /** Zweite Farbe des Musters als #RRGGBB. */
  patternColor?: string;
  /** Wiederholung des Musters/der Textur (0.1..50). */
  uvScale?: number;
}

export type PhysicsMode = 'none' | 'static' | 'dynamic' | 'trigger';
export interface PhysicsSpec {
  mode: PhysicsMode;
  mass?: number;
  friction?: number;
  restitution?: number;
}

export type ParticlePreset = 'fire' | 'sparks' | 'smoke' | 'confetti';
export interface ParticleSpec {
  preset: ParticlePreset;
  enabled: boolean;
  /** Partikel pro Sekunde; Standard hängt vom Preset ab. */
  rate?: number;
}

export interface ScriptSpec {
  /** JavaScript-Quelltext, siehe shared/scriptApi.ts. */
  source: string;
  enabled: boolean;
}

export type MediaKind = 'image' | 'web' | 'video' | 'slides' | 'text';
export interface MediaSpec {
  kind: MediaKind;
  /** Bild-, Webseiten- oder Video-URL (auch data:-URL für Uploads). */
  url?: string;
  /** Bilderfolge für kind = 'slides'. */
  urls?: string[];
  /** Aktuelle Folie (0-basiert). */
  slide?: number;
  /** Text für kind = 'text'. */
  text?: string;
}

/** Eine platzierte Instanz in der Welt. */
export interface EntitySpec {
  /** Eindeutige Instanz-ID innerhalb der Welt. */
  id: string;
  /** Prefab-Verweis, z. B. "EntitySpec.box" (siehe PREFAB_REFS). */
  ref: string;
  /** Anzeigename im Build-Modus. */
  name?: string;
  transform: Transform;
  /** Freier, JSON-serialisierbarer Zustand (z. B. { seats: 3 }). */
  state?: Record<string, unknown>;
  material?: MaterialSpec;
  physics?: PhysicsSpec;
  particles?: ParticleSpec;
  script?: ScriptSpec;
  media?: MediaSpec;
  /** glTF/GLB-URL für ref = "EntitySpec.model". */
  modelUrl?: string;
  /** Gruppen-ID: Objekte mit gleicher ID werden gemeinsam ausgewählt, bewegt, kopiert und gespeichert. */
  group?: string;
  /** Anzeigename der Gruppe (bei allen Mitgliedern gleich). */
  groupName?: string;
  /** Logik-Graph (siehe shared/graph.ts); hat Vorrang vor `script`, wenn aktiviert und fehlerfrei. */
  graph?: GraphSpec;
}

export type SkyPreset = 'clear' | 'dusk' | 'night' | 'custom';
export type SeaMode = 'clouds' | 'water';
export interface SeaSpec {
  /** Was unter der Insel liegt: Wolkenmeer (Standard) oder Wasser. */
  mode: SeaMode;
  /** Wasserfarbe #RRGGBB. */
  color?: string;
  /** Wellenhöhe 0..1. */
  waves?: number;
}
export const WEATHER_KINDS = ['none', 'rain', 'snow', 'fog', 'fireflies'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];
/** Stimmungsvorlagen (Farbkorrektur und Nachbearbeitung), siehe src/engine/environment/features/looks.ts. */
export const LOOK_IDS = ['standard', 'filmisch', 'warm', 'kuehl', 'comic', 'retro'] as const;
export type LookId = (typeof LOOK_IDS)[number];
export interface DayCycleSpec {
  enabled: boolean;
  /** Dauer eines vollen Tages in Minuten (1..240). */
  minutesPerDay: number;
}

export interface EnvironmentSpec {
  sky: { preset: SkyPreset; color?: string };
  light: { intensity: number; temperatureK: number; direction: { azimuth: number; elevation: number } | string };
  audio: { soundscapeRef?: string; volume: number };
  /** Meer unter der Insel (Standard: Wolkenmeer). */
  sea?: SeaSpec;
  /** Stimmungsvorlage (Standard: standard). */
  look?: LookId;
  /** Tageszyklus (Sonne und Himmel wandern). */
  dayCycle?: DayCycleSpec;
  /** Wetter (Standard: none). */
  weather?: WeatherKind;
}

export type MovementMode = 'grounded' | 'flying' | 'noclip';
export interface RulesSpec {
  movement: { mode: MovementMode; speed: number };
  gravity: { enabled: boolean; strength?: number };
  abilities: { id: string; enabled: boolean; params?: Record<string, unknown> }[];
}

export interface PersonalitySpec {
  mood: string;
  densityHints: { min: number; max: number; peak: number };
}

export interface InteractionSpec {
  ref: string;
  bindTo?: string;
  conditions?: { if: string }[];
  effects?: { do: string }[];
}

/** Form der schwebenden Insel. Oberseite liegt bei y = 0, Mittelpunkt im Ursprung. */
export interface IslandSpec {
  /** Radius in Metern (Standard 40). */
  radius: number;
  /** Dicke des Felssockels nach unten in Metern (Standard 18). */
  depth: number;
  /** Zufalls-Seed für Umriss und Hügel. */
  seed: number;
}

export interface WorldSpec {
  $schema?: string;
  metadata: { name: string; version: string; id?: string; owner?: string };
  environment: EnvironmentSpec;
  rules: RulesSpec;
  personality: PersonalitySpec;
  island?: IslandSpec;
  entities: EntitySpec[];
  interactions: InteractionSpec[];
  extensions?: Record<string, unknown>;
}

/** Bekannte Prefab-Verweise. Paket 4 (Entities) und 12 (Medien) setzen sie um. */
export const PREFAB_REFS = [
  'EntitySpec.box',
  'EntitySpec.sphere',
  'EntitySpec.cylinder',
  'EntitySpec.cone',
  'EntitySpec.plane',
  'EntitySpec.torus',
  'EntitySpec.avatar-spawn',
  'EntitySpec.bench',
  'EntitySpec.chair',
  'EntitySpec.table',
  'EntitySpec.lantern',
  'EntitySpec.light',
  'EntitySpec.tree',
  'EntitySpec.rock',
  'EntitySpec.sign',
  'EntitySpec.model',
  'EntitySpec.media-image',
  'EntitySpec.media-web',
  'EntitySpec.media-video',
  'EntitySpec.media-slides',
  'EntitySpec.media-text',
  'EntitySpec.water',
  'EntitySpec.mirror',
  'EntitySpec.waterfall',
  'EntitySpec.brick',
] as const;
export type PrefabRef = (typeof PREFAB_REFS)[number];

export const IDENTITY_TRANSFORM: Transform = { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] };
export const DEFAULT_ISLAND: IslandSpec = { radius: 40, depth: 18, seed: 7 };

let idCounter = 0;
/** Erzeugt eine kurze, praktisch eindeutige Entity-ID. */
export function newEntityId(prefix = 'e'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
