/** KI-Werkzeuge (Schemas): Platzieren, Ausrichten, Prüfen. Die Handler stehen in src/ai/core. */
import type { AiToolDefinition } from './types';
import { vec3 } from './schemaParts';

export const placeToolDefs: AiToolDefinition[] = [
  {
    name: 'place_relative',
    description:
      'Setzt ein Objekt oder eine Gruppe (`id`) relativ zu einem anderen (`relative_to`), ohne dass du Koordinaten rechnest. `where` = on_top (obendrauf), below (darunter), north (kleineres z), south (größeres z), west (kleineres x), east (größeres x). `gap` = Abstand in Metern (Standard 0, also bündig). Auf den anderen Achsen wird mittig ausgerichtet (beim Danebenstellen steht es auf gleicher Höhe wie das andere); `align_x`, `align_y`, `align_z` = min | center | max ändern das (z. B. align_x "min" = linke Kanten bündig). `offset` [x, y, z] verschiebt zusätzlich. Nutzt die Maße beider Teile (bei zusammengesetzten Bausteinen wie Bank/Baum geschätzt). Ersetzt get_bounds + Rechnen + update_entity.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Objekt-, Gruppen-id oder Name des Teils, das bewegt wird' },
        relative_to: { type: 'string', description: 'Objekt, Gruppe oder Name, an dem es sich ausrichtet (bleibt stehen)' },
        where: { enum: ['on_top', 'below', 'north', 'south', 'east', 'west'] },
        gap: { type: 'number', minimum: -50, maximum: 50 },
        align_x: { enum: ['min', 'center', 'max'] },
        align_y: { enum: ['min', 'center', 'max'] },
        align_z: { enum: ['min', 'center', 'max'] },
        offset: vec3,
      },
      required: ['id', 'relative_to', 'where'],
    },
    mutates: true,
  },
  {
    name: 'align_entities',
    description:
      'Richtet mehrere Objekte oder Gruppen (`ids`, 2–60) aus und/oder verteilt sie gleichmäßig. Ausrichten: `axis` (x | y | z) und `to` (min | center | max, Standard center): alle liegen dann auf derselben Kante bzw. Mittellinie (y + min = gleiche Standhöhe). Verteilen: `distribute_axis` (x | y | z) ordnet sie in der Reihenfolge ihrer Lage entlang der Achse an, mit gleichen Abständen zwischen erstem und letztem oder mit festem `gap` (Meter, vom ersten aus). Beides lässt sich kombinieren (z. B. Regalbretter: axis "x" to "min" + distribute_axis "y" mit gap 0,4).',
    input_schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 60 },
        axis: { enum: ['x', 'y', 'z'] },
        to: { enum: ['min', 'center', 'max'] },
        distribute_axis: { enum: ['x', 'y', 'z'] },
        gap: { type: 'number', minimum: -50, maximum: 50 },
      },
      required: ['ids'],
    },
    mutates: true,
  },
  {
    name: 'fit_to_opening',
    description:
      'Passt eine Medien-Tafel (EntitySpec.media-*) oder einen Quader (EntitySpec.box, z. B. eine Glasscheibe) in eine gespeicherte Wand-Öffnung ein (Fenster, Tür): Größe, Position, Drehung und Blickrichtung werden berechnet; bei Tafeln werden die Standfüße abgeschaltet und der versteckte Versatz von 0,9 m (Ursprung am Boden) berücksichtigt. `id` = die Tafel/der Quader, `wall` = eine Wand-Gruppe oder ein Teil davon, `opening` = Nummer (ab 1) oder Name der Öffnung (weglassen, wenn die Wand nur eine hat; die Liste steht im Ergebnis von add_wall/fill_bricks und in get_bounds). `face` = north | south | east | west: die Richtung, in die die Vorderseite zeigt (also die Seite, von der man das Bild sieht); Standard ist die Vorderseite der Öffnung. `fit` = contain (Seitenverhältnis behalten, Standard) oder stretch (Öffnung ganz ausfüllen, das Bild wird gestreckt). `mode` = flush (bündig in der Wand, Standard) oder surface (auf der Wandfläche davor). `inset` = Rand in Metern, `depth` = Dicke bei Quadern (Standard 0,05).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        wall: { type: 'string', description: 'Wand-Gruppe (id oder Name) oder ein Teil davon' },
        opening: { description: 'Nummer (ab 1) oder Name', anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string' }] },
        face: { enum: ['north', 'south', 'east', 'west'] },
        fit: { enum: ['contain', 'stretch'] },
        mode: { enum: ['flush', 'surface'] },
        inset: { type: 'number', minimum: 0, maximum: 5 },
        depth: { type: 'number', minimum: 0.05, maximum: 2 },
      },
      required: ['id', 'wall'],
    },
    mutates: true,
  },
  {
    name: 'verify',
    description:
      'Prüft Behauptungen über das Gebaute rechnerisch und nennt bei Fehlern Messwert und Korrektur (günstiger und genauer als ein Screenshot). `checks` (bis 12), je mit `type`: in_opening {id, wall, opening?, tolerance?} (sitzt das Objekt in der Öffnung: Mitte, Größe, Tiefe, Blickrichtung); no_overlap {id?} (keine Überschneidungen, ohne id für alles); touching {a, b, tolerance?} (berühren sich, Abstand oder Eindringen); on_ground {id, tolerance?} (steht auf dem Boden bzw. auf der darunterliegenden Fläche, schwebt nicht); size {id, size [x,y,z], tolerance?} (Weltmaße); inside {id, container, tolerance?} (liegt innerhalb eines anderen). Toleranz in Metern (Standard 0,05, bei touching 0,03).',
    input_schema: {
      type: 'object',
      properties: {
        checks: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: {
            type: 'object',
            properties: {
              type: { enum: ['in_opening', 'no_overlap', 'touching', 'on_ground', 'size', 'inside'] },
              id: { type: 'string' },
              wall: { type: 'string' },
              opening: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string' }] },
              a: { type: 'string' },
              b: { type: 'string' },
              container: { type: 'string' },
              size: vec3,
              tolerance: { type: 'number', minimum: 0.001, maximum: 5 },
            },
            required: ['type'],
          },
        },
      },
      required: ['checks'],
    },
    mutates: false,
  },
  {
    name: 'find_free_spot',
    description:
      'Sucht freie Bodenfläche für ein Objekt, ohne Überschneidung mit vorhandenen Objekten und innerhalb der Insel. `size` = [Breite x, Tiefe z] in Metern, `center` = [x, z] Suchmitte (Standard: beim Avatar), `radius` = Suchradius (Standard 15 m), `clearance` = Mindestabstand zu anderen (Standard 0,3 m), `height` = Höhe, die frei sein muss (Standard 2 m), `count` = Anzahl getrennter Plätze (1–5). Liefert x, z und y = 0 (Boden), sortiert nach Nähe zur Suchmitte. Nutze es für Möbel, Bäume, Zäune, statt Plätze zu raten.',
    input_schema: {
      type: 'object',
      properties: {
        size: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        center: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        radius: { type: 'number', minimum: 1, maximum: 150 },
        clearance: { type: 'number', minimum: 0, maximum: 10 },
        height: { type: 'number', minimum: 0.1, maximum: 100 },
        count: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['size'],
    },
    mutates: false,
  },
  {
    name: 'what_changed',
    description: 'Fasst zusammen, was sich seit Beginn dieses Auftrags geändert hat: neue Gruppen und Objekte (mit Maßen), geänderte Objekte (Position, Material, Name …) und entfernte. Nutze es am Ende zur Kontrolle statt get_world oder vieler get_bounds-Aufrufe.',
    input_schema: { type: 'object', properties: {} },
    mutates: false,
  },
];
