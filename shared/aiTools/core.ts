/** KI-Werkzeuge (Schemas): Kernwerkzeuge: Welt lesen, Objekte anlegen/ändern/entfernen, Umgebung, Skript, Medien, Avatar, Chat. Die Handler stehen in src/ai/core. */
import type { AiToolDefinition } from './types';
import { vec3, color, material, physics, particles, transformProps } from './schemaParts';

export const coreToolDefs: AiToolDefinition[] = [
  {
    name: 'get_world',
    description:
      'Liefert eine Zusammenfassung der Welt: Inselgröße, Himmel, alle Objekte (id, Name, Typ, Position, Größe, Farbe, ob Skript/Medien/Physik), Position des Nutzer-Avatars und den Katalog verfügbarer Bausteine. Gruppen mit mindestens 3 Teilen (Mauern, Türme) stehen als EINE Zeile mit Gruppen-id, Anzahl und grobem Rahmen; `group` listet die Mitglieder einer Gruppe, `name_contains` filtert nach Namen. Das Ergebnis ist groß: rufe es selten auf (die Ergebnisse der Bauwerkzeuge nennen schon Gruppen-id und Maße).',
    input_schema: { type: 'object', properties: { group: { type: 'string', description: 'Gruppen-id: nur deren Mitglieder auflisten' }, name_contains: { type: 'string', maxLength: 60 } } },
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
        state: { type: 'object', description: 'Freier Zustand, wird mit dem vorhandenen zusammengeführt, z. B. {"text": "Willkommen"}' },
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
        sea_mode: { enum: ['clouds', 'water'], description: 'Was unter der Insel liegt: Wolkenmeer oder Wasser' },
        sea_color: color,
        sea_waves: { type: 'number', minimum: 0, maximum: 1 },
        look: { enum: ['standard', 'filmisch', 'warm', 'kuehl', 'comic', 'retro'], description: 'Stimmungsvorlage (Farbkorrektur)' },
        weather: { enum: ['none', 'rain', 'snow', 'fog', 'fireflies'] },
        grass: { type: 'boolean', description: 'Grashalme (3D-Büschel) auf der Insel anzeigen; false = nur die grüne Bodenfläche, z. B. für Entwürfe und Grundrisse' },
        day_cycle_enabled: { type: 'boolean', description: 'Sonne und Himmel wandern durch den Tag' },
        day_cycle_minutes: { type: 'number', minimum: 1, maximum: 240, description: 'Dauer eines Tages in Minuten' },
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
