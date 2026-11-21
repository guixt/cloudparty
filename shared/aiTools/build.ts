/** KI-Werkzeuge (Schemas): Bauen: Mauern, Balken, Anordnungen, Maße, Überschneidungen. Die Handler stehen in src/ai/core. */
import type { AiToolDefinition } from './types';
import { vec3, material, physics, particles, transformProps } from './schemaParts';

export const buildToolDefs: AiToolDefinition[] = [
  {
    name: 'add_wall',
    description:
      'Baut eine Wand von Punkt `from` nach `to` (je [x, z], Meter) aus Boxen, als Gruppe. `height` = Höhe, `thickness` = Dicke (Standard 0,3), `y0` = Höhe des Wandfußes (Standard 0). `openings` = Türen/Fenster: {at (Abstand vom Wandanfang in m), width, height, sill (Höhe der Unterkante, 0 = Tür)}; die Wand wird um sie herum aus Stücken zusammengesetzt. Die Öffnungen werden mit Welt-Maßen gespeichert (Name, Mitte, Größe, Vorderseite): fit_to_opening setzt eine Tafel oder Scheibe hinein, verify prüft den Sitz, get_bounds listet sie. Spart Rechnen: eine Hauswand mit Tür ist ein Aufruf. `material`, `physics` (Standard static), `name` gelten für alle Teile.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        to: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        height: { type: 'number', minimum: 0.2, maximum: 60 },
        thickness: { type: 'number', minimum: 0.05, maximum: 5 },
        y0: { type: 'number' },
        openings: {
          type: 'array',
          maxItems: 10,
          items: {
            type: 'object',
            properties: { at: { type: 'number', minimum: 0 }, width: { type: 'number', minimum: 0.1 }, height: { type: 'number', minimum: 0.1 }, sill: { type: 'number', minimum: 0 }, name: { type: 'string', maxLength: 40, description: 'optionaler Name, z. B. „Südfenster“; sonst „Tür 1“, „Fenster 1“' } },
            required: ['at', 'width', 'height'],
          },
        },
        name: { type: 'string', maxLength: 80 },
        material,
        physics,
      },
      required: ['from', 'to', 'height'],
    },
    mutates: true,
  },
  {
    name: 'add_beam',
    description:
      'Setzt einen Balken, Pfosten, ein Seil oder Rohr von Punkt `from` nach `to` (je [x, y, z]). Länge, Mitte und Drehung rechnet das Werkzeug. `thickness` = Durchmesser/Dicke, `shape` = cylinder (Standard) oder box. Höchstens 60 m lang.',
    input_schema: {
      type: 'object',
      properties: {
        from: vec3,
        to: vec3,
        thickness: { type: 'number', minimum: 0.05, maximum: 10 },
        shape: { enum: ['cylinder', 'box'] },
        name: { type: 'string', maxLength: 80 },
        material,
        physics,
      },
      required: ['from', 'to', 'thickness'],
    },
    mutates: true,
  },
  {
    name: 'array',
    description:
      'Legt viele Kopien eines Bausteins in einem Muster an (als Gruppe): Zinnen, Säulen, Zaun, Sitzreihen. `pattern`: circle (`count`, `radius`, `center` [x,y,z], optional `start_degrees`, `face_center` = Vorderseite (+Z) zeigt zur Mitte), line (`count`, `start` [x,y,z], `step` [dx,dy,dz] pro Stück) oder grid (`rows`, `cols`, `spacing` [dx, dz], `origin` [x,y,z]). `y` ist wie bei add_entity die Position des Ursprungs (Grundformen: Mitte, Bausteine: Boden). Gemeinsame Größe, Material, Physik, Drehung für alle Kopien; höchstens 100 Stück.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        pattern: { enum: ['circle', 'line', 'grid'] },
        count: { type: 'integer', minimum: 2, maximum: 100 },
        radius: { type: 'number' },
        center: vec3,
        start_degrees: { type: 'number' },
        face_center: { type: 'boolean' },
        start: vec3,
        step: vec3,
        rows: { type: 'integer', minimum: 1, maximum: 100 },
        cols: { type: 'integer', minimum: 1, maximum: 100 },
        spacing: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        origin: vec3,
        name: { type: 'string', maxLength: 80 },
        scale: transformProps.scale,
        rotation_degrees: transformProps.rotation_degrees,
        material,
        physics,
        particles,
        state: { type: 'object', description: 'Freier Zustand, wird mit dem vorhandenen zusammengeführt, z. B. {"text": "Willkommen"}' },
      },
      required: ['ref', 'pattern'],
    },
    mutates: true,
  },
  {
    name: 'clone_group',
    description:
      'Kopiert ein Objekt oder eine ganze Gruppe (id = Objekt-id oder Gruppen-id „grp_…“) als neue Gruppe: verschoben (`offset`), um die Senkrechte gedreht (`rotate_y_degrees`, um den Mittelpunkt der Gruppe oder `pivot` [x, z]) und/oder gespiegelt (`mirror`: x spiegelt links/rechts, z vorne/hinten). `count` (bis 10) macht mehrere Kopien, jede weiter verschoben/gedreht als die vorige (Eckturm → vier Ecktürme). Mindestens eines von offset, rotate_y_degrees, mirror angeben.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID eines Objekts; gehört es zu einer Gruppe, wird die ganze Gruppe kopiert' },
        offset: vec3,
        rotate_y_degrees: { type: 'number' },
        pivot: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        mirror: { enum: ['x', 'z'] },
        count: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['id'],
    },
    mutates: true,
  },
  {
    name: 'get_bounds',
    description: 'Liest Maße (id = Objekt-id oder Gruppen-id „grp_…“): Minimum, Maximum, Mitte und Größe eines Objekts oder (wenn es zu einer Gruppe gehört) der ganzen Gruppe, in Metern. Bei zusammengesetzten Bausteinen (Bank, Baum …) nur geschätzt. Nutze es, bevor du etwas auf oder neben ein anderes Teil setzt.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    mutates: false,
  },
  {
    name: 'surface_height_at',
    description: 'Fragt für einen Punkt (x, z), wie hoch die oberste Fläche dort ist (Insel = 0, sonst die Oberkante darunter stehender Objekte), ob er auf der Insel liegt und wie weit der Inselrand entfernt ist. Nutze es, um Dinge auf den Boden oder auf andere Teile zu setzen.',
    input_schema: { type: 'object', properties: { x: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'z'] },
    mutates: false,
  },
  {
    name: 'check_overlaps',
    description:
      'Prüft, ob sich Objekte durchdringen (z. B. Balken, die in Wänden stecken, doppelte Böden, ineinander stehende Möbel). Ohne Argumente: die ganze Welt; mit `id` (Objekt, Gruppe oder Name): nur dieses Objekt bzw. diese Gruppe gegen alles andere. Liefert Paare mit Eindringtiefe und der Achse der kleinsten Verschiebung, außerdem Teile unter der Inseloberfläche. Gemessen werden Grundformen und Klemmbausteine; zusammengesetzte Bausteine (Bank, Baum …) ohne feste Maße nicht. Teile derselben Gruppe werden nicht gegeneinander geprüft. Beim Bauen meldet jedes Werkzeug neue Überschneidungen schon selbst.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Objekt-id, Gruppen-id oder Name (optional)' } } },
    mutates: false,
  },
];
