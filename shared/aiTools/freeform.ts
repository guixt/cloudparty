/** KI-Werkzeuge (Schemas): Gekrümmte Flächen (Freiform): Bogenwand, Drehkörper, Kontrollpunkt-Fläche, Lamellenwand. Handler: src/ai/core/freeformTools.ts. */
import type { AiToolDefinition } from './types';
import { vec3 } from './schemaParts';
import { FREEFORM_LIMITS } from '../freeform/types';

const material = { type: 'object', description: 'wie bei add_entity: color (#RRGGBB), preset, alpha, metallic, roughness …' };
const xz = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 };

export const freeformToolDefs: AiToolDefinition[] = [
  {
    name: 'add_curved_wall',
    description: `Gekrümmte Wand/Platte entlang eines Pfades als EIN Objekt. \`path\` = Punkte {p:[x,z], bulge?}: bulge = Pfeilhöhe des Bogens zum NÄCHSTEN Punkt in m (positiv = links, 0 = gerade). Bogenwand (0,0) nach (6,0), 1,5 m Pfeilhöhe: path [{p:[0,0],bulge:1.5},{p:[6,0]}]. \`height\`, \`height_end\` (Höhenverlauf), \`thickness\` (Standard 0,3), \`y0\` = Unterkante, \`closed\` schließt den Pfad. \`openings\` wie bei add_wall ({at = Abstand vom Pfadanfang in m, width, height, sill}), als Öffnungen gespeichert. Höchstens ${FREEFORM_LIMITS.maxPoints} Punkte, ${FREEFORM_LIMITS.maxCuts} Öffnungen.`,
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'array',
          minItems: 2,
          maxItems: FREEFORM_LIMITS.maxPoints,
          items: { type: 'object', properties: { p: xz, bulge: { type: 'number', description: 'Pfeilhöhe des Bogens zum nächsten Punkt in m, positiv = links' } }, required: ['p'] },
        },
        height: { type: 'number', minimum: 0.2, maximum: 60 },
        height_end: { type: 'number', minimum: 0.2, maximum: 60 },
        thickness: { type: 'number', minimum: 0.05, maximum: 5 },
        y0: { type: 'number' },
        closed: { type: 'boolean' },
        openings: {
          type: 'array',
          maxItems: FREEFORM_LIMITS.maxCuts,
          items: {
            type: 'object',
            properties: { at: { type: 'number', minimum: 0 }, width: { type: 'number', minimum: 0.1 }, height: { type: 'number', minimum: 0.1 }, sill: { type: 'number', minimum: 0 }, name: { type: 'string', maxLength: 40 } },
            required: ['at', 'width', 'height'],
          },
        },
        name: { type: 'string', maxLength: 80 },
        material,
      },
      required: ['path', 'height'],
    },
    mutates: true,
  },
  {
    name: 'add_lathe',
    description: `Drehkörper: \`profile\` = Punkte [radius, y] von unten nach oben (relativ zu \`position\` = Fußpunkt), um die Senkrechte gedreht. Schale/Wanne: [[0,0],[1.5,0],[1.5,0.5],[1.7,0.5]]; Säule: [[0,0],[0.4,0],[0.3,0.2],[0.3,3],[0.4,3.2],[0,3.2]]. \`sweep_degrees\` (Standard 360), \`start_degrees\`, \`ellipse\` = Verhältnis z/x (oval). Höchstens ${FREEFORM_LIMITS.maxPoints} Punkte.`,
    input_schema: {
      type: 'object',
      properties: {
        profile: { type: 'array', minItems: 2, maxItems: FREEFORM_LIMITS.maxPoints, items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } },
        sweep_degrees: { type: 'number', minimum: 1, maximum: 360 },
        start_degrees: { type: 'number' },
        ellipse: { type: 'number', minimum: 0.1, maximum: 10 },
        position: vec3,
        name: { type: 'string', maxLength: 80 },
        material,
      },
      required: ['profile', 'position'],
    },
    mutates: true,
  },
  {
    name: 'add_surface',
    description: `Geschwungene Fläche aus Kontrollpunkt-Gitter (Zeilen × Spalten, je [x,y,z] relativ zu \`position\`). Decke 6 × 6 m, Mitte höher: grid [[[0,3,0],[3,3.8,0],[6,3,0]],[[0,3.4,3],[3,4.4,3],[6,3.4,3]],[[0,3,6],[3,3.8,6],[6,3,6]]]. \`degree\` 1–3 (Standard 3), \`thickness\` (0 = einseitig). Höchstens ${FREEFORM_LIMITS.maxGrid} × ${FREEFORM_LIMITS.maxGrid} Punkte.`,
    input_schema: {
      type: 'object',
      properties: {
        grid: { type: 'array', minItems: 2, maxItems: FREEFORM_LIMITS.maxGrid, items: { type: 'array', minItems: 2, maxItems: FREEFORM_LIMITS.maxGrid, items: vec3 } },
        degree: { enum: [1, 2, 3] },
        thickness: { type: 'number', minimum: 0, maximum: 5 },
        position: vec3,
        name: { type: 'string', maxLength: 80 },
        material,
      },
      required: ['grid', 'position'],
    },
    mutates: true,
  },
  {
    name: 'add_wavy_wall',
    description: 'Wellen-/Lamellenwand von `from` [x,z] nach `to` [x,z], seitlich sinusförmig: `amplitude` (m), `wave_length` (m je Welle). `thickness` Standard 0,2, `y0` = Unterkante.',
    input_schema: {
      type: 'object',
      properties: {
        from: xz,
        to: xz,
        height: { type: 'number', minimum: 0.2, maximum: 60 },
        thickness: { type: 'number', minimum: 0.05, maximum: 5 },
        amplitude: { type: 'number', minimum: 0.01, maximum: 20 },
        wave_length: { type: 'number', minimum: 0.2, maximum: 100 },
        y0: { type: 'number' },
        name: { type: 'string', maxLength: 80 },
        material,
      },
      required: ['from', 'to', 'height', 'amplitude', 'wave_length'],
    },
    mutates: true,
  },
  {
    name: 'update_freeform',
    description: 'Ändert eine Freiform nachträglich. `id` = Objekt- oder Gruppen-id (wirkt nur auf Freiformen), `changes` = Teil-Änderungen am Formzustand, zusammengeführt: path, height, heightEnd, thickness, y0, closedPath, wave {amplitude,length}, profile, sweepDeg, startDeg, ellipse, grid, degree, cuts. Beispiel: changes {height: 4}. Lage/Farbe/Name: update_entity.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, changes: { type: 'object' } },
      required: ['id', 'changes'],
    },
    mutates: true,
  },
];
