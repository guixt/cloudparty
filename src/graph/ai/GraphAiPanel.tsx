/**
 * STUB des Fundaments – Paket 20 (KI-Erweiterungen) ersetzt die Umsetzung; die Props bleiben.
 * Wird vom Graph-Editor (Paket 19) eingebunden: Eingabe „Was soll das Objekt tun?“ → KI erzeugt einen Graphen.
 */
import type { GraphSpec } from '../../../shared/graph';

export interface GraphAiPanelProps {
  entityId: string;
  entityName: string;
  /** Aktueller Graph im Editor (zum Verbessern). */
  graph: GraphSpec;
  /** Übernimmt den vorgeschlagenen Graphen in den Editor (speichert NICHT; der Nutzer prüft ihn zuerst). */
  onApply(graph: GraphSpec): void;
}

export function GraphAiPanel(_props: GraphAiPanelProps) {
  return <div className="cp-muted">Die KI-Hilfe für Graphen ist noch nicht verfügbar.</div>;
}
