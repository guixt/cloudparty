/** set_graph: nimmt die Kompaktform, übersetzt sie und prüft sie. Führt nie etwas aus; keine Rückfrage nötig (deklarativ). */
import { AI_LIMITS } from '../../../shared/aiTools';
import type { CompactGraph, GraphSpec, ParamValue } from '../../../shared/graph';
import { compactToGraph } from '../../../shared/graphCompact';
import { compileGraph } from '../../../shared/graphCompile';
import { NODE_DEFS, getNodeDef } from '../../../shared/graphNodes';
import { fail, getEntity, isObj, ok, opts, str, type Handler } from './tools';

void AI_LIMITS;

function portHint(types: string[]): string {
  const lines = [...new Set(types)].map((t) => {
    const d = getNodeDef(t);
    return d ? `${t}: ein[${d.inputs.map((p) => `${p.id}:${p.kind}`).join(',')}] aus[${d.outputs.map((p) => `${p.id}:${p.kind}`).join(',')}]` : null;
  });
  const known = lines.filter(Boolean);
  const unknown = types.filter((t) => !getNodeDef(t));
  return [known.length ? `Gültige Ports: ${known.join('; ')}.` : '', unknown.length ? `Unbekannte Typen: ${unknown.join(', ')}. Gültige Typen: ${NODE_DEFS.map((d) => d.type).join(', ')}.` : ''].filter(Boolean).join(' ');
}

export const graphHandlers: Record<string, Handler> = {
  set_graph(input, ctx) {
    const entity = getEntity(ctx, input.id);
    if (!Array.isArray(input.nodes) || input.nodes.length > 120) fail('nodes muss eine Liste mit höchstens 120 Knoten sein.');
    if (!Array.isArray(input.connections) || input.connections.length > 240) fail('connections muss eine Liste mit höchstens 240 Verbindungen sein.');
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') fail('enabled muss true oder false sein.');
    const nodes: CompactGraph['nodes'] = (input.nodes as unknown[]).map((n, i) => {
      if (!isObj(n)) return fail(`nodes[${i}] muss ein Objekt sein.`);
      const node: CompactGraph['nodes'][number] = { id: str(n.id, `nodes[${i}].id`, 60), type: str(n.type, `nodes[${i}].type`, 60) };
      if (n.params !== undefined) {
        if (!isObj(n.params)) fail(`nodes[${i}].params muss ein Objekt sein.`);
        const params: Record<string, ParamValue> = {};
        for (const [k, v] of Object.entries(n.params as Record<string, unknown>)) {
          if (k === '__proto__') fail('Ungültiger Parametername.');
          if (typeof v === 'string' && v.length > AI_LIMITS.maxTextLength) fail(`nodes[${i}].params.${k} ist zu lang.`);
          if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') fail(`nodes[${i}].params.${k} muss Text, Zahl oder Wahrheitswert sein.`);
          params[k] = v as ParamValue;
        }
        node.params = params;
      }
      return node;
    });
    const connections = (input.connections as unknown[]).map((c, i) => str(c, `connections[${i}]`, 200));
    const types = nodes.map((n) => n.type);
    let graph: GraphSpec;
    try {
      graph = compactToGraph({ nodes, connections });
    } catch (error) {
      return fail(`Der Graph ist ungültig: ${(error as Error).message} ${portHint(types)}`.trim());
    }
    graph = { ...graph, enabled: (input.enabled as boolean | undefined) ?? true };
    const { errors } = compileGraph(graph);
    if (errors.length > 0) {
      const titleOf = (id?: string) => {
        const n = id ? graph.nodes.find((x) => x.id === id) : undefined;
        return n ? ` (${getNodeDef(n.type)?.title ?? n.type})` : '';
      };
      const list = errors.slice(0, 15).map((e) => `- ${e.nodeId ? `Knoten ${e.nodeId}${titleOf(e.nodeId)}: ` : ''}${e.message}`).join('\n');
      return fail(`Der Graph hat Fehler und wurde nicht gesetzt:\n${list}\n${portHint(types)} Korrigiere und rufe set_graph erneut auf.`);
    }
    ctx.store.getState().updateEntity(entity.id, { graph }, opts);
    return ok('Graph gesetzt.', `Graph an ${entity.name || 'Objekt'} gesetzt (${graph.nodes.length} Knoten)`, true);
  },
};
