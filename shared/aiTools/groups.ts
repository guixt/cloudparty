/** KI-Werkzeuge (Schemas): Gruppen. Die Handler stehen in src/ai/core. */
import type { AiToolDefinition } from './types';

export const groupToolDefs: AiToolDefinition[] = [
  {
    name: 'group_entities',
    description: 'Fasst Objekte zu einer Gruppe zusammen. Gruppen werden gemeinsam ausgewählt, bewegt, kopiert und als Baustein gespeichert. Ein Objekt gehört höchstens zu einer Gruppe (eine bestehende Zuordnung wird ersetzt).',
    input_schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 150 }, name: { type: 'string', maxLength: 80 } },
      required: ['ids'],
    },
    mutates: true,
  },
  {
    name: 'ungroup',
    description: 'Löst die Gruppe auf, zu der das genannte Objekt gehört. Die Objekte bleiben unverändert.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    mutates: true,
  },
];
