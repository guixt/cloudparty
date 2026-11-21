/** PLATZHALTER des Koordinators: wird von der Einheit „Geometrie A“ durch die echte Prüfung ersetzt (gleiche Signatur). */
import type { FreeformState } from './types';

/** Prüft und klemmt einen Freiform-State (Zahlen endlich, Punktzahlen und Maße begrenzt); wirft einen verständlichen Fehler bei Unbrauchbarem. */
export function sanitizeFreeformState(raw: unknown): FreeformState {
  if (typeof raw !== 'object' || raw === null) throw new Error('Freiform: state fehlt.');
  const kind = (raw as { kind?: unknown }).kind;
  if (kind !== 'lathe' && kind !== 'sweep' && kind !== 'patch') throw new Error('Freiform: kind muss lathe, sweep oder patch sein.');
  return raw as FreeformState;
}
