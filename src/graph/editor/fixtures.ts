import type { GraphSpec, NodeDef } from '../../../shared/graph';

export const FIX_DEFS: NodeDef[] = [
  { type: 'ev', title: 'Ereignis', category: 'Ereignisse', description: 'e', inputs: [], outputs: [{ id: 'then', label: 'Dann', kind: 'flow' }, { id: 'name', label: 'Name', kind: 'text' }], params: [] },
  { type: 'act', title: 'Aktion', category: 'Aktionen', description: 'a', inputs: [{ id: 'in', label: '', kind: 'flow' }, { id: 'text', label: 'Text', kind: 'text' }, { id: 'n', label: 'N', kind: 'number' }], outputs: [{ id: 'then', label: 'Dann', kind: 'flow' }],
    params: [{ id: 'text', label: 'Text', kind: 'text', default: 'Hi' }, { id: 'n', label: 'N', kind: 'number', default: 1 }] },
  { type: 'num', title: 'Zahl', category: 'Werte', description: 'z', inputs: [], outputs: [{ id: 'value', label: 'Wert', kind: 'number' }], params: [{ id: 'value', label: 'Wert', kind: 'number', default: 1 }] },
  { type: 'bool', title: 'Wahr', category: 'Logik', description: 'b', inputs: [], outputs: [{ id: 'value', label: 'Wert', kind: 'boolean' }], params: [] },
];
export const fixDef = (t: string) => FIX_DEFS.find((d) => d.type === t);
export function fixGraph(): GraphSpec {
  return { version: 1, enabled: true, nodes: [{ id: 'a', type: 'ev', x: 0, y: 0 }, { id: 'b', type: 'act', x: 300, y: 0 }, { id: 'c', type: 'num', x: 0, y: 200 }], edges: [] };
}
