/**
 * Übersetzer Graph → Skript. STUB des Fundaments – Paket 18 (Logik-Graph Kern) ersetzt die Umsetzung.
 * Die Signaturen bleiben. Reine Funktionen ohne DOM/Node-Abhängigkeit (läuft im Browser, im Worker und in Tests).
 */
import type { CompileResult, GraphIssue, GraphSpec } from './graph';
import type { EntitySpec } from './types';

/** Übersetzt den Graphen in Skript-Quelltext (Format: shared/scriptApi.ts). */
export function compileGraph(_graph: GraphSpec): CompileResult {
  return { source: '', errors: [{ message: 'Der Graph-Übersetzer ist noch nicht verfügbar.' }], warnings: [] };
}

/** Prüft Struktur, Typen der Verbindungen, Grenzen (GRAPH_LIMITS) und Zyklen, ohne Quelltext zu erzeugen. */
export function validateGraph(_graph: GraphSpec): GraphIssue[] {
  return [];
}

/**
 * Der Quelltext, den die Skript-Laufzeit für diese Entity ausführen soll:
 * ein aktivierter, fehlerfreier Graph hat Vorrang vor `entity.script`.
 * Rückgabe null = nichts auszuführen.
 */
export function entityScriptSource(entity: Pick<EntitySpec, 'script' | 'graph'>): { source: string; enabled: boolean } | null {
  if (entity.script) return { source: entity.script.source, enabled: entity.script.enabled };
  return null;
}
