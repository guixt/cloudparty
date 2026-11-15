/**
 * Katalog der Knoten. STARTER des Fundaments – Paket 18 (Logik-Graph Kern) erweitert und besitzt diese Datei.
 * Die Namen (type) und Port-IDs hier sind Teil des gespeicherten Formats: nach Auslieferung nicht umbenennen.
 */
import type { NodeCategory, NodeDef } from './graph';

export const NODE_DEFS: NodeDef[] = [
  {
    type: 'on_click',
    title: 'Beim Anklicken',
    category: 'Ereignisse',
    description: 'Startet, wenn ein Avatar das Objekt anklickt.',
    inputs: [],
    outputs: [
      { id: 'then', label: 'Dann', kind: 'flow' },
      { id: 'name', label: 'Name des Avatars', kind: 'text' },
    ],
    params: [],
  },
  {
    type: 'set_color',
    title: 'Farbe setzen',
    category: 'Aktionen',
    description: 'Setzt die Farbe des Objekts.',
    inputs: [
      { id: 'in', label: '', kind: 'flow' },
      { id: 'color', label: 'Farbe', kind: 'color' },
    ],
    outputs: [{ id: 'then', label: 'Dann', kind: 'flow' }],
    params: [{ id: 'color', label: 'Farbe', kind: 'color', default: '#ff0000' }],
  },
  {
    type: 'say',
    title: 'Sagen',
    category: 'Aktionen',
    description: 'Gibt einen Text im Chat aus.',
    inputs: [
      { id: 'in', label: '', kind: 'flow' },
      { id: 'text', label: 'Text', kind: 'text' },
    ],
    outputs: [{ id: 'then', label: 'Dann', kind: 'flow' }],
    params: [{ id: 'text', label: 'Text', kind: 'text', default: 'Hallo!' }],
  },
  {
    type: 'branch',
    title: 'Wenn … dann',
    category: 'Ablauf',
    description: 'Führt je nach Bedingung den einen oder den anderen Zweig aus.',
    inputs: [
      { id: 'in', label: '', kind: 'flow' },
      { id: 'condition', label: 'Bedingung', kind: 'boolean' },
    ],
    outputs: [
      { id: 'true', label: 'Ja', kind: 'flow' },
      { id: 'false', label: 'Nein', kind: 'flow' },
    ],
    params: [{ id: 'condition', label: 'Bedingung', kind: 'boolean', default: true }],
  },
  {
    type: 'number',
    title: 'Zahl',
    category: 'Werte',
    description: 'Eine feste Zahl.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wert', kind: 'number' }],
    params: [{ id: 'value', label: 'Wert', kind: 'number', default: 1 }],
  },
];

export function getNodeDef(type: string): NodeDef | undefined {
  return NODE_DEFS.find((def) => def.type === type);
}

export function nodesByCategory(): { category: NodeCategory; nodes: NodeDef[] }[] {
  const order: NodeCategory[] = ['Ereignisse', 'Aktionen', 'Ablauf', 'Logik', 'Werte', 'Variablen', 'Medien'];
  return order.map((category) => ({ category, nodes: NODE_DEFS.filter((def) => def.category === category) })).filter((group) => group.nodes.length > 0);
}
