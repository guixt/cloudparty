/** KI-Werkzeuge (Schemas): Steine (Bricks). Die Handler stehen in src/ai/core. */
import type { AiToolDefinition } from './types';
import { vec3, color } from './schemaParts';

export const brickToolDefs: AiToolDefinition[] = [
  {
    name: 'add_bricks',
    description:
      'Setzt Klemmbausteine (Noppensteine) in ein Raster. Maße: 1 Noppe = 0,25 m, Stein = 3 Platten (0,3 m) hoch, Platte/Fliese = 1 Platte (0,1 m). Jeder Eintrag: `x`, `z` = Ecke des Steins in NOPPEN (ganze Zahlen; 1 Noppe = 0,25 m; Weltposition = origin + 0,25 · Wert), `w` × `d` = Größe in Noppen (1–16), `kind` = stein | platte | fliese (glatt, ohne Noppen) | schraeg (Schrägstein: Noppen nur hinten, mind. 2 tief) | bogen (Bogenstein: abgerundete Schräge für Hauben, Kotflügel, Dachrundungen, mind. 2 tief) | schraeg_um (umgedrehte Schräge, Unterseite schräg, Oberseite voller Noppen) | viertel (Viertelrundung für abgerundete Ecken, Breite = Tiefe, die Rundung zeigt bei rot 0 nach +x/+z) | bogenlauf (Radlauf: Länge `d` ≥ 4 längs z, Dicke `w`, unten halbrunder Ausschnitt über einem Rad) | rund (Rundstein, Breite = Tiefe, eine Noppe) | rundplatte (runde Platte 1 Platte hoch für Scheinwerfer, Lenkrad, Kappen) | kuppel (Halbkugel, Breite = Tiefe, ohne Noppen) | rad (Rad: Achse längs x, `w` wird 1, `d` = gerader Durchmesser 2–8, rot 90 dreht die Achse nach z), `rot` = 0/90/180/270 (vertauscht bei 90/270 Breite und Tiefe), `color`. `y` = Unterkante in Platten ab `origin` (weglassen = automatisch auf dem Stein darunter, sonst auf dem Boden). `origin` [x, y, z] in Metern (Standard [0, 0, 0]). Bis zu 500 Steine pro Aufruf, als Gruppe.',
    input_schema: {
      type: 'object',
      properties: {
        origin: vec3,
        name: { type: 'string', maxLength: 80 },
        bricks: {
          type: 'array',
          minItems: 1,
          maxItems: 500,
          items: {
            type: 'object',
            properties: {
              x: { type: 'integer' },
              z: { type: 'integer' },
              y: { type: 'integer', minimum: 0 },
              w: { type: 'integer', minimum: 1, maximum: 16 },
              d: { type: 'integer', minimum: 1, maximum: 16 },
              kind: { enum: ['stein', 'platte', 'fliese', 'schraeg', 'bogen', 'schraeg_um', 'viertel', 'bogenlauf', 'rund', 'rundplatte', 'kuppel', 'rad'] },
              rot: { enum: [0, 90, 180, 270], description: 'Drehung in Grad um die Senkrechte. Schrägen/Bögen fallen bei 0 nach +z, 90 nach +x, 180 nach −z, 270 nach −x' },
              rot90: { type: 'boolean', description: 'veraltet, wie rot 90' },
              studs: { type: 'boolean', description: 'false = ganz ohne Noppen (für verdeckte Lagen)' },
              color,
            },
            required: ['x', 'z', 'w', 'd'],
          },
        },
      },
      required: ['bricks'],
    },
    mutates: true,
  },
  {
    name: 'fill_bricks',
    description:
      'Mauert ein Rechteck aus Klemmbausteinen mit versetzten Fugen (wie echtes Mauerwerk). `mode` = wall (einreihiger Rand: Hauswand, Turm) oder floor (volle Fläche aus Platten). `x`, `z` = Ecke in Noppen, `cols` × `rows` = Größe in Noppen (Wand: ≥ 3 × 3), `layers` = Anzahl Schichten (Wand: Stein hoch, Boden: Platten; Böden bestehen aus großen Platten bis 16 × 16 Noppen), `origin` [x, y, z] in Metern, `color`, `openings` (nur Wand; north = Seite mit kleinerem z, south = größerem z, west = kleinerem x, east = größerem x): [{ side: north|south|east|west, at (Noppen vom Wandanfang), width (Noppen), layers (Höhe in Schichten) }] für Türen und Fenster; mit `sill_layers` Brüstung. Bis zu 500 Steine pro Aufruf, höchstens 16 Öffnungen, Breite und Tiefe höchstens 128 Noppen (größer: mehrere Aufrufe).',
    input_schema: {
      type: 'object',
      properties: {
        mode: { enum: ['wall', 'floor'] },
        x: { type: 'integer' },
        z: { type: 'integer' },
        cols: { type: 'integer', minimum: 1, maximum: 128 },
        rows: { type: 'integer', minimum: 1, maximum: 128 },
        layers: { type: 'integer', minimum: 1, maximum: 40 },
        origin: vec3,
        color,
        name: { type: 'string', maxLength: 80 },
        openings: {
          type: 'array',
          maxItems: 16,
          items: {
            type: 'object',
            properties: {
              side: { enum: ['north', 'south', 'east', 'west'] },
              at: { type: 'integer', minimum: 0 },
              width: { type: 'integer', minimum: 1 },
              layers: { type: 'integer', minimum: 1 },
              sill_layers: { type: 'integer', minimum: 0 },
              name: { type: 'string', maxLength: 40, description: 'optionaler Name, z. B. „Südfenster“; sonst „Tür 1“, „Fenster 1“' },
            },
            required: ['side', 'at', 'width', 'layers'],
          },
        },
      },
      required: ['mode', 'x', 'z', 'cols', 'rows', 'layers'],
    },
    mutates: true,
  },
  {
    name: 'bricks_profile',
    description:
      'Baut ein Seitenprofil aus Klemmbausteinen in EINEM Aufruf, z. B. Karosserie eines Autos (Haube, Kabine, Heck) oder eine Dachlinie. `x`, `z` = Anfangsecke in Noppen, `width` = Breite längs x in Noppen, `base` = Plattenhöhe der Unterkante (Standard 0), `origin` [x, y, z] in Metern. `segments` = nacheinander längs +z: { len (Noppen), h (Höhe in Platten über base; 3 Platten = 1 Stein), edge_before / edge_after: none | slope | curve, color }. Mit edge_* wird die äußerste 2-Noppen-Reihe der obersten Lage am Segmentanfang (fällt nach −z) bzw. -ende (fällt nach +z) durch Schräg- bzw. Bogenstein ersetzt: so entstehen abgerundete Hauben und Heckpartien. Untere Lagen haben keine Noppen. Beispiel Auto (Länge längs z): segments [{len:6,h:5,edge_before:"curve"},{len:8,h:9,color:"#d93a2f"},{len:6,h:6,edge_after:"slope"}]. Bis zu 500 Teile, als Gruppe.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'integer' },
        z: { type: 'integer' },
        width: { type: 'integer', minimum: 1, maximum: 64 },
        base: { type: 'integer', minimum: 0 },
        origin: vec3,
        color,
        name: { type: 'string', maxLength: 80 },
        segments: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              len: { type: 'integer', minimum: 1, maximum: 64 },
              h: { type: 'integer', minimum: 1, maximum: 120 },
              edge_before: { enum: ['none', 'slope', 'curve'] },
              edge_after: { enum: ['none', 'slope', 'curve'] },
              color,
            },
            required: ['len', 'h'],
          },
        },
      },
      required: ['x', 'z', 'width', 'segments'],
    },
    mutates: true,
  },
];
