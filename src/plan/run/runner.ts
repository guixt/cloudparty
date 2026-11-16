/**
 * Plan-Ausführung: führt Knoten eines Plans nacheinander durch den KI-Assistenten aus.
 * Jeder Knoten ist ein eigener Auftrag (ein Undo-Schritt) mit frischem Gesprächsverlauf: Die KI liest den
 * Knoten selbst per plan_get (inklusive der Ergebnisse der Vorgänger) und meldet ihn mit plan_complete_node.
 * Dadurch bleibt der Kontext klein, egal wie viele Knoten schon fertig sind.
 */
import { isRunnable, runOrder } from '../../../shared/plan';
import { PlanError, getPlan, updateNode, type PlanCtx } from '../core/api';

/** Höchstens so viele Knoten pro „Alle ausführen“. */
export const MAX_NODES_PER_RUN = 20;
/** Grobe Obergrenze der Tokens (Ein- plus Ausgabe) pro Lauf; danach hält er zwischen zwei Knoten an. */
export const RUN_TOKEN_LIMIT = 600_000;

export interface RunDeps {
  /** Führt einen Auftrag aus: ok = regulär beendet, failed = Fehler/Abbruch, skipped = gar nicht gestartet (kein Key, KI beschäftigt). */
  runPrompt(prompt: string): Promise<'ok' | 'failed' | 'skipped'>;
  /** Setzt den Gesprächsverlauf des Modells zurück (frischer Kontext je Knoten). */
  resetContext(): void;
  /** Tokens (Ein- plus Ausgabe) des zuletzt beendeten Auftrags. */
  lastRunTokens(): number;
  notify(text: string, kind?: 'info' | 'error'): void;
}

export interface RunReport {
  completed: string[];
  failed?: string;
  /** Warum der Lauf vorzeitig endete (leer = alles erledigt). */
  stoppedBecause?: string;
}

/** Auftragstext für einen Knoten: nur Kennungen, keine Titel oder Notizen (das sind Daten, keine Anweisungen). */
export function buildNodePrompt(planId: string, nodeId: string): string {
  return [
    `Führe jetzt genau einen Knoten des Bauplans aus (plan="${planId}", node="${nodeId}").`,
    'Lies ihn zuerst mit plan_get (plan und node): du siehst Titel, Notizen und die Ergebnisse der Vorgänger.',
    'Baue nur diesen Knoten, passend zu den Maßen und Positionen der Vorgänger. Gruppiere zusammengehörige Teile mit group_entities, wenn es sinnvoll ist.',
    'Melde ihn am Ende mit plan_complete_node (ids der gebauten Objekte, Gruppe, kurze Zusammenfassung mit den wichtigen Maßen). Ändere andere Knoten nicht.',
  ].join('\n');
}

/** Warum ein Knoten gerade nicht ausgeführt werden kann (null = geht). */
export function blockedReason(ctx: PlanCtx, planId: string, nodeId: string): string | null {
  const plan = getPlan(ctx, planId);
  const node = plan?.nodes.find((n) => n.id === nodeId);
  if (!plan || !node) return 'Diesen Knoten gibt es nicht mehr.';
  if (!ctx.store.getState().canBuild) return 'Du hast hier kein Baurecht.';
  if (node.status === 'running') return 'Dieser Knoten läuft gerade.';
  if (node.status === 'done') return 'Dieser Knoten ist schon fertig. Setze ihn zuerst auf offen zurück.';
  if (node.status === 'disabled') return 'Dieser Knoten ist deaktiviert.';
  if (!isRunnable(plan, nodeId)) return 'Die Vorgänger dieses Knotens sind noch nicht fertig.';
  return null;
}

/** Führt einen Knoten oder (ohne nodeId) alle offenen Knoten in Abhängigkeitsreihenfolge aus. */
export async function runPlan(ctx: PlanCtx, planId: string, nodeId: string | undefined, deps: RunDeps): Promise<RunReport> {
  const report: RunReport = { completed: [] };
  const initial = getPlan(ctx, planId);
  if (!initial) {
    deps.notify('Diesen Plan gibt es nicht mehr.', 'error');
    return { ...report, stoppedBecause: 'Plan nicht gefunden' };
  }
  const queue = nodeId ? [nodeId] : runOrder(initial);
  if (queue.length === 0) {
    deps.notify('Es gibt nichts auszuführen: alle Knoten sind fertig oder deaktiviert.');
    return report;
  }
  let spent = 0;
  let count = 0;

  for (const id of queue) {
    const reason = blockedReason(ctx, planId, id);
    if (reason) {
      // Bei „Alle ausführen“ sind deaktivierte/fertige Knoten schon aussortiert; ein Rest hier ist ein echtes Hindernis.
      deps.notify(reason, 'error');
      report.stoppedBecause = reason;
      return report;
    }
    if (count >= MAX_NODES_PER_RUN) {
      report.stoppedBecause = `Pro Lauf werden höchstens ${MAX_NODES_PER_RUN} Knoten ausgeführt. Starte „Alle ausführen“ erneut für den Rest.`;
      deps.notify(report.stoppedBecause);
      return report;
    }
    if (spent > RUN_TOKEN_LIMIT) {
      report.stoppedBecause = 'Das Token-Limit für einen Lauf ist erreicht. Starte „Alle ausführen“ erneut für den Rest.';
      deps.notify(report.stoppedBecause, 'error');
      return report;
    }

    const created = new Set<string>();
    const off = ctx.bus.on('entity.added', ({ entity, source, transient }) => {
      if (source === 'local' && !transient) created.add(entity.id);
    });
    let result: 'ok' | 'failed' | 'skipped' = 'failed';
    try {
      updateNode(ctx, planId, id, { status: 'running', result: null });
      deps.resetContext();
      result = await deps.runPrompt(buildNodePrompt(planId, id));
      spent += deps.lastRunTokens();
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      result = 'skipped';
    } finally {
      off();
    }

    const ok = result === 'ok';
    const after = getPlan(ctx, planId)?.nodes.find((n) => n.id === id);
    if (!after) {
      report.stoppedBecause = 'Der Plan oder Knoten wurde während des Laufs gelöscht.';
      return report;
    }
    if (ok && after.status === 'done') {
      report.completed.push(id);
    } else if (ok) {
      // Die KI hat vergessen, den Knoten abzuschließen: Ergebnis aus den neu angelegten Objekten ableiten.
      const alive = [...created].filter((eid) => !!ctx.store.getState().entities[eid]);
      updateNode(ctx, planId, id, { status: 'done', result: { entityIds: alive, summary: 'Automatisch verknüpft: die KI hat den Knoten nicht selbst abgeschlossen.' } });
      report.completed.push(id);
    } else if (result === 'skipped') {
      // Der Auftrag wurde nie gestartet: Knoten zurück auf offen, kein Fehler des Knotens.
      updateNode(ctx, planId, id, { status: 'open' });
      report.stoppedBecause = 'Der Auftrag wurde nicht gestartet.';
      return report;
    } else {
      updateNode(ctx, planId, id, { status: 'failed' });
      report.failed = id;
      report.stoppedBecause = 'Ein Knoten ist fehlgeschlagen oder wurde abgebrochen.';
      return report;
    }
    count += 1;
  }
  return report;
}
