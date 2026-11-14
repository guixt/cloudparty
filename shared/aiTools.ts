/**
 * Werkzeuge des KI-Assistenten (Claude Tool Use). VERTRAG: nur der Koordinator ändert diese Datei.
 *
 * Die Werkzeuge arbeiten auf den bestehenden Store-Aktionen (siehe src/core/store.ts).
 * Längen in Metern, Winkel in Grad, Farben als #RRGGBB.
 */

export const AI_LIMITS = {
  /** Maximale Runden (Modellaufrufe) pro Auftrag. */
  maxRounds: 12,
  /** Maximale Werkzeugaufrufe pro Auftrag. */
  maxToolCalls: 60,
  /** Maximal neu angelegte Entities pro Auftrag. */
  maxNewEntities: 80,
  /** Ab dieser Anzahl Löschungen pro Auftrag wird der Nutzer gefragt. */
  confirmRemovalsAt: 5,
  /** Koordinaten müssen innerhalb dieses Betrags liegen. */
  maxCoordinate: 200,
  minSize: 0.05,
  maxSize: 60,
  maxScriptBytes: 20_000,
  maxTextLength: 2_000,
  /** Ausgabegrenze pro Modellaufruf. */
  maxOutputTokens: 4096,
} as const;

export const AI_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (empfohlen)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (stärker, teurer)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (schnell, günstig)' },
] as const;
export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';

export const AI_STORAGE_KEYS = {
  apiKey: 'cloudparty.ai.key',
  model: 'cloudparty.ai.model',
  approval: 'cloudparty.ai.approval',
} as const;

/**
 * Freigabe-Modus des Assistenten:
 * - ask (Standard): fragt vor dem Speichern von Skripten und bei vielen Löschungen nach.
 * - auto: führt alles ohne Rückfragen aus (wie auto-accept bei KI-Agenten). Automatische
 *   Prüfungen (Syntax, gesperrte Befehle, Limits, Baurecht) und Rückgängig bleiben aktiv.
 */
export type AiApprovalMode = 'ask' | 'auto';
export const DEFAULT_AI_APPROVAL: AiApprovalMode = 'ask';

export type AiToolName =
  | 'get_world'
  | 'add_entity'
  | 'update_entity'
  | 'remove_entity'
  | 'set_environment'
  | 'set_script'
  | 'set_media'
  | 'move_avatar'
  | 'say';

export interface AiToolDefinition {
  name: AiToolName;
  description: string;
  /** JSON-Schema des Eingabeobjekts (wie von der Anthropic Messages API erwartet). */
  input_schema: Record<string, unknown>;
  /** Ändert die Welt (benötigt Baurecht). */
  mutates: boolean;
}

const vec3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Farbe als #RRGGBB' };
const material = {
  type: 'object',
  properties: {
    color,
    emissive: color,
    metallic: { type: 'number', minimum: 0, maximum: 1 },
    roughness: { type: 'number', minimum: 0, maximum: 1 },
    alpha: { type: 'number', minimum: 0, maximum: 1 },
  },
};
const physics = {
  type: 'object',
  properties: {
    mode: { enum: ['none', 'static', 'dynamic', 'trigger'] },
    mass: { type: 'number', minimum: 0.01 },
    friction: { type: 'number', minimum: 0, maximum: 5 },
    restitution: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['mode'],
};
const particles = {
  type: 'object',
  properties: { preset: { enum: ['fire', 'sparks', 'smoke', 'confetti'] }, enabled: { type: 'boolean' }, rate: { type: 'number', minimum: 1, maximum: 500 } },
  required: ['preset', 'enabled'],
};
const transformProps = {
  position: { ...vec3, description: 'Mittelpunkt in Metern (x, y, z); y nach oben, Inseloberseite bei y = 0' },
  rotation_degrees: { ...vec3, description: 'Drehung in Grad (x, y, z)' },
  scale: { ...vec3, description: 'Größe pro Achse (Faktor, 1 = Standardgröße)' },
};

export const AI_TOOLS: AiToolDefinition[] = [
  {
    name: 'get_world',
    description:
      'Liefert eine Zusammenfassung der Welt: Inselgröße, Himmel, alle Objekte (id, Name, Typ, Position, Größe, Farbe, ob Skript/Medien/Physik), Position des Nutzer-Avatars und den Katalog verfügbarer Bausteine. Rufe das zuerst auf, wenn du bestehende Objekte brauchst.',
    input_schema: { type: 'object', properties: {} },
    mutates: false,
  },
  {
    name: 'add_entity',
    description:
      'Platziert einen neuen Baustein. `ref` stammt aus dem Katalog von get_world (z. B. EntitySpec.box, EntitySpec.bench, EntitySpec.tree). Grundformen (box, sphere, cylinder, cone, plane, torus) sind um `position` zentriert (ein Würfel der Größe 1 auf dem Boden hat y = 0.5); zusammengesetzte Bausteine (Bank, Baum, Laterne, Tafeln …) haben ihren Ursprung am Boden (y = 0).',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        name: { type: 'string', maxLength: 80 },
        ...transformProps,
        material,
        physics,
        particles,
        state: { type: 'object', description: 'Freier Zustand, z. B. {"seats": 3} oder {"text": "Willkommen"} für Schilder' },
      },
      required: ['ref', 'position'],
    },
    mutates: true,
  },
  {
    name: 'update_entity',
    description: 'Ändert ein bestehendes Objekt. Nur die angegebenen Felder werden geändert. Mit `move_by` verschiebst du relativ zur aktuellen Position.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string', maxLength: 80 },
        ...transformProps,
        move_by: { ...vec3, description: 'Relative Verschiebung in Metern' },
        material,
        physics,
        particles,
        state: { type: 'object' },
      },
      required: ['id'],
    },
    mutates: true,
  },
  {
    name: 'remove_entity',
    description: 'Entfernt ein Objekt anhand seiner id. Bei vielen Löschungen fragt die Oberfläche den Nutzer.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    mutates: true,
  },
  {
    name: 'set_environment',
    description: 'Ändert Himmel und Licht der Insel.',
    input_schema: {
      type: 'object',
      properties: {
        sky_preset: { enum: ['clear', 'dusk', 'night', 'custom'] },
        sky_color: color,
        light_intensity: { type: 'number', minimum: 0, maximum: 10 },
        light_temperature_k: { type: 'number', minimum: 1000, maximum: 12000 },
        sun_azimuth_degrees: { type: 'number' },
        sun_elevation_degrees: { type: 'number', minimum: -90, maximum: 90 },
      },
    },
    mutates: true,
  },
  {
    name: 'set_script',
    description:
      'Hängt ein JavaScript-Skript an ein Objekt (ersetzt ein vorhandenes). Das Skript definiert Ereignisfunktionen auf oberster Ebene (onStart, onClick, onTouch, onTriggerEnter, onTriggerExit, onTick, onMessage, onChat) und nutzt nur die Objekte `self` und `world` sowie log/setTimeout/setInterval laut Skript-API im Systemprompt. Ein leerer `source` entfernt das Skript.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, source: { type: 'string' }, enabled: { type: 'boolean' } },
      required: ['id', 'source'],
    },
    mutates: true,
  },
  {
    name: 'set_media',
    description:
      'Konfiguriert eine Medien-Fläche (Bild-, Web-, Video-, Folien-Tafel oder Text-Schild). Webadressen müssen mit http:// oder https:// beginnen. Das Objekt sollte ein EntitySpec.media-*-Baustein sein.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        kind: { enum: ['image', 'web', 'video', 'slides', 'text'] },
        url: { type: 'string' },
        urls: { type: 'array', items: { type: 'string' }, maxItems: 50 },
        slide: { type: 'integer', minimum: 0 },
        text: { type: 'string', maxLength: 2000 },
      },
      required: ['id'],
    },
    mutates: true,
  },
  {
    name: 'move_avatar',
    description: 'Versetzt den Avatar des Nutzers und/oder löst eine Geste aus.',
    input_schema: {
      type: 'object',
      properties: { position: vec3, yaw_degrees: { type: 'number' }, emote: { enum: ['wave', 'agree', 'raise-hand', 'dance'] } },
    },
    mutates: false,
  },
  {
    name: 'say',
    description: 'Gibt dem Nutzer eine kurze Textnachricht im KI-Fenster. Deine normale Antwort ist ohnehin sichtbar; nutze das nur für Zwischenmeldungen bei langen Aufträgen.',
    input_schema: { type: 'object', properties: { text: { type: 'string', maxLength: 500 } }, required: ['text'] },
    mutates: false,
  },
];

export function getToolDefinition(name: string): AiToolDefinition | undefined {
  return AI_TOOLS.find((tool) => tool.name === name);
}
