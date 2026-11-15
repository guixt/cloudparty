/**
 * Kompaktform des Graphen für die KI und automatische Anordnung. STUB des Fundaments –
 * Paket 18 ersetzt die Umsetzung (Signaturen bleiben).
 */
import type { CompactGraph, GraphSpec } from './graph';

/** Wandelt die Kompaktform in einen vollständigen Graphen (mit automatischer Anordnung). Wirft Error mit deutscher Meldung bei Formfehlern. */
export function compactToGraph(_compact: CompactGraph): GraphSpec {
  throw new Error('Noch nicht verfügbar.');
}

/** Gegenrichtung (für die KI, um bestehende Graphen zu lesen). */
export function graphToCompact(_graph: GraphSpec): CompactGraph {
  return { nodes: [], connections: [] };
}

/** Ordnet Knoten von links nach rechts nach Ablauf an (setzt x/y). Gibt eine neue Liste zurück. */
export function autoLayout(graph: GraphSpec): GraphSpec {
  return graph;
}
