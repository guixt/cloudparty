/**
 * Beispiel-Graphen (Vorlagen im Editor, Beispiele für die KI). STUB des Fundaments –
 * Paket 18 füllt die Liste (nach seinem Katalog) und besitzt diese Datei.
 */
import type { GraphSpec } from './graph';

export interface GraphExample {
  id: string;
  title: string;
  description: string;
  graph: GraphSpec;
}

export const GRAPH_EXAMPLES: GraphExample[] = [];
