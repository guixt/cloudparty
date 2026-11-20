/**
 * Registry der Werkzeug-Handler. Jede Handler-Gruppe (tools.ts, groupTools.ts, …) registriert ihre Tabelle über
 * `registerHandlers`; `executeTool` schlägt Handler hier nach. Schemas stehen in shared/aiTools/ (Verbindung nur über den Namen).
 * Doppelte Namen werfen beim Laden einen Fehler. Diese Datei importiert zur Laufzeit nichts (keine Zyklen).
 */
import type { Handler } from './tools';

const registry = new Map<string, Handler>();

/** Registriert eine Handler-Tabelle und gibt sie unverändert zurück. Wirft bei doppelten Namen. */
export function registerHandlers<T extends Record<string, Handler>>(table: T): T {
  for (const [name, handler] of Object.entries(table)) {
    if (registry.has(name)) throw new Error(`Werkzeug-Handler doppelt registriert: ${name}`);
    registry.set(name, handler);
  }
  return table;
}

export function getHandler(name: string): Handler | undefined {
  return registry.get(name);
}

export function registeredToolNames(): string[] {
  return [...registry.keys()];
}
