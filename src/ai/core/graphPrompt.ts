/** Beschreibung des Logik-Graph-Formats für die KI (Systemprompt und Graph-KI-Panel). Der Katalog wird aus NODE_DEFS erzeugt. */
import type { CompactGraph, NodeDef, ParamDef, PortDef } from '../../../shared/graph';
import { GRAPH_EXAMPLES, type GraphExample } from '../../../shared/graphExamples';
import { graphToCompact } from '../../../shared/graphCompact';
import { NODE_DEFS } from '../../../shared/graphNodes';

const ports = (list: PortDef[]) => list.map((p) => `${p.id}:${p.kind}`).join(',');
function param(p: ParamDef): string {
  const def = typeof p.default === 'string' ? `"${p.default}"` : String(p.default);
  const opts = p.kind === 'select' && p.options ? `[${p.options.map((o) => o.value).join('|')}]` : '';
  return `${p.id}${opts}=${def}`;
}

/** Eine Zeile pro Knotentyp. */
export function nodeCatalogPrompt(defs: NodeDef[] = NODE_DEFS): string {
  return defs
    .map((d) => `- ${d.type} (${d.title}, ${d.category}) ein[${ports(d.inputs)}] aus[${ports(d.outputs)}]${d.params.length ? ` params{${d.params.map(param).join(', ')}}` : ''}`)
    .join('\n');
}

const FALLBACK: CompactGraph = {
  nodes: [
    { id: 'k', type: 'on_click' },
    { id: 'f', type: 'set_color', params: { color: '#33cc66' } },
    { id: 's', type: 'say', params: { text: 'Hallo!' } },
  ],
  connections: ['k.then -> f.in', 'f.then -> s.in'],
};

/** Beispiele aus GRAPH_EXAMPLES (höchstens 3) oder ein kleines festes Beispiel. */
export function graphExamplesPrompt(examples: GraphExample[] = GRAPH_EXAMPLES): string {
  const parts: string[] = [];
  for (const ex of examples.slice(0, 3)) {
    try {
      const json = JSON.stringify(graphToCompact(ex.graph));
      if (json.length < 1500 && ex.graph.nodes.length > 0) parts.push(`${ex.title} – ${ex.description}\n${json}`);
    } catch {
      /* Beispiel überspringen */
    }
  }
  if (parts.length === 0) parts.push(`Klick färbt grün und sagt Hallo\n${JSON.stringify(FALLBACK)}`);
  return parts.join('\n\n');
}

export function graphFormatPrompt(defs: NodeDef[] = NODE_DEFS, examples: GraphExample[] = GRAPH_EXAMPLES): string {
  return `Kompaktformat: { "nodes": [{ "id": "k", "type": "on_click", "params": {…} }], "connections": ["k.then -> f.in"] }
- Jeder Knoten hat eine kurze eindeutige id und einen type aus dem Katalog. Verbindungen: "knoten.ausgang -> knoten.eingang" mit den Port-ids aus dem Katalog.
- Ablauf (flow): Ausgang → Eingang "in". Ereignis-Knoten haben keinen Eingang und starten den Ablauf. Ein Ausgang darf zu mehreren Zielen führen.
- Daten-Verbindungen nur zwischen gleichen Arten (Zahl → Text ist erlaubt); ein Daten-Eingang ohne Verbindung nimmt den gleichnamigen Parameter. Daten-Eingänge haben höchstens eine Quelle.
- Farben als #RRGGBB. Verwende nur Knotentypen und Port-ids aus dem Katalog.
Katalog (type (Titel, Kategorie) ein[port:art] aus[port:art] params{name=Standard}):
${nodeCatalogPrompt(defs)}
Beispiele:
${graphExamplesPrompt(examples)}`;
}
