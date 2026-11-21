/** KI-Werkzeuge (Schemas): Bibliothek. Die Handler stehen in src/ai/core. */
import type { AiToolDefinition } from './types';
import { vec3 } from './schemaParts';

export const libraryToolDefs: AiToolDefinition[] = [
  {
    name: 'library_list',
    description: 'Durchsucht die Bibliothek des Nutzers nach gespeicherten Bausteinen (Name, Beschreibung, Stichworte). Ohne query werden alle aufgelistet (höchstens 50).',
    input_schema: { type: 'object', properties: { query: { type: 'string', maxLength: 100 } } },
    mutates: false,
  },
  {
    name: 'library_place',
    description: 'Setzt einen Baustein aus der Bibliothek in die Welt (als Gruppe). `position` ist der Fußpunkt auf dem Boden (x, y, z), y meist 0.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, position: vec3, yaw_degrees: { type: 'number' }, group_name: { type: 'string', maxLength: 80 } },
      required: ['id', 'position'],
    },
    mutates: true,
  },
  {
    name: 'library_save',
    description: 'Speichert die genannten Objekte (Gruppen vollständig) als neuen Baustein in der Bibliothek des Nutzers. Verändert die Welt nicht.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 80 },
        description: { type: 'string', maxLength: 300 },
        tags: { type: 'array', items: { type: 'string', maxLength: 30 }, maxItems: 12 },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 300 },
      },
      required: ['name', 'ids'],
    },
    mutates: false,
  },
];
