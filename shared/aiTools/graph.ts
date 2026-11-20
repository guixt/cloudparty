/** KI-Werkzeuge (Schemas): Logik-Graph. Die Handler stehen in src/ai/core. */
import type { AiToolDefinition } from './types';

export const graphToolDefs: AiToolDefinition[] = [
  {
    name: 'set_graph',
    description:
      'Setzt den Logik-Graphen eines Objekts (grafische Blöcke, die zu einem Skript übersetzt werden; bevorzuge das gegenüber set_script für einfache Abläufe). Format: `nodes` = Liste {id, type, params?} mit Knotentypen aus dem Katalog im Systemprompt; `connections` = Strings der Form "knoten.ausgang -> knoten.eingang", z. B. "k.then -> f.in". Ablauf-Verbindungen (flow) laufen von einem Ausgang zu einem Eingang "in"; Daten-Verbindungen nur zwischen gleichen Typen. Ein ungültiger Graph wird mit Fehlermeldung abgelehnt.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID des Objekts' },
        nodes: {
          type: 'array',
          maxItems: 120,
          items: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string' }, params: { type: 'object' } }, required: ['id', 'type'] },
        },
        connections: { type: 'array', maxItems: 240, items: { type: 'string' } },
        enabled: { type: 'boolean' },
      },
      required: ['id', 'nodes', 'connections'],
    },
    mutates: true,
  },
];
