/**
 * Plan-Ausführung: führt Knoten eines Plans nacheinander durch den KI-Assistenten aus.
 * Jeder Knoten ist ein eigener Auftrag (ein Undo-Schritt) mit frischem Gesprächsverlauf: Die KI liest den
 * Knoten selbst per plan_get (inklusive der Ergebnisse der Vorgänger) und meldet ihn mit plan_complete_node.
 * Dadurch bleibt der Kontext klein, egal wie viele Knoten schon fertig sind.
 * Die Aufträge laufen über die Warteschlange des KI-Fensters: arbeitet die KI gerade, wartet der Knoten
 * (Status „queued“) und startet danach (Status „running“).
 */
import { isQueueable, isRunnable, queueableOrder, runOrder } from '../../../shared/plan';
import { outputBudget } from '../../ai/core/prompt';
import { getTokenLimits } from '../../ai/core/settings';
import { PlanError, getPlan, updateNode, type PlanCtx } from '../core/api';

/** Höchstens so viele Knoten pro „Alle ausführen“. */
export const MAX_NODES_PER_RUN = 20;
/** Grobe Obergrenze der Tokens (Ein- plus Ausgabe) pro Lauf; danach hält er zwischen zwei Knoten an. */
export const RUN_TOKEN_LIMIT = 600_000;

export type PromptResult = 'ok' | 'failed' | 'skipped';

export interface RunDeps {
  /**
   * Reiht einen Auftrag ein und meldet, wie er endete: ok = regulär beendet, failed = Fehler/Abbruch,
   * skipped = nie gestartet (kein Key, aus der Warteschlange entfernt). `beforeRun` läuft direkt vor dem Start.
   */
  runPrompt(prompt: string, hooks: { label: string; beforeRun: () => void }): Promise<PromptResult>;
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
export function buildNodePrompt(planId: string, nodeId: string, maxOutputTokens = getTokenLimits().maxOutputTokens): string {
  const b = outputBudget(maxOutputTokens);
  return [
    `Führe jetzt genau einen Knoten des Bauplans aus (plan="${planId}", node="${nodeId}").`,
    'Lies ihn zuerst mit plan_get (plan und node): du siehst Titel, Notizen und die Ergebnisse der Vorgänger.',
    'Baue nur diesen Knoten, passend zu den Maßen und Positionen der Vorgänger. Gruppiere zusammengehörige Teile mit group_entities, wenn es sinnvoll ist.',
    'Melde ihn am Ende mit plan_complete_node (ids der gebauten Objekte, Gruppe, kurze Zusammenfassung mit den wichtigen Maßen). Ändere andere Knoten nicht.',
    `Deine Antwort darf höchstens ${b.tokens} Tokens lang sein (etwa ${b.toolCalls} Werkzeugaufrufe). Arbeite in mehreren kleinen Schritten mit Werkzeugen, die viele Teile auf einmal erzeugen (add_wall, array, fill_bricks, clone_group), und schreibe keinen langen Text. Ist der Knoten dafür zu groß, teile ihn mit plan_add_node in kleinere Knoten (Vorgänger-Beziehung beachten), baue nur den ersten Teil und melde ihn mit plan_complete_node.`,
  ].join('\n');
}

/** Warum ein Knoten gerade nicht eingereiht werden kann (null = geht). Einreihen geht auch, während die KI arbeitet. */
export function queueBlockReason(ctx: PlanCtx, planId: string, nodeId: string): string | null {
  const plan = getPlan(ctx, planId);
  const node = plan?.nodes.find((n) => n.id === nodeId);
  if (!plan || !node) return 'Diesen Knoten gibt es nicht mehr.';
  if (!ctx.store.getState().canBuild) return 'Du hast hier kein Baurecht.';
  if (node.status === 'running') return 'Dieser Knoten läuft gerade.';
  if (node.status === 'queued') return 'Dieser Knoten wartet schon in der Warteschlange.';
  if (node.status === 'done') return 'Dieser Knoten ist schon fertig. Setze ihn zuerst auf offen zurück.';
  if (node.status === 'disabled') return 'Dieser Knoten ist deaktiviert.';
  if (!isQueueable(plan, nodeId)) return 'Die Vorgänger dieses Knotens sind noch nicht fertig (und nicht eingereiht).';
  return null;
}

/** Markiert Knoten als „queued“ (sie warten auf ihre Ausführung). */
export function markQueued(ctx: PlanCtx, planId: string, nodeIds: string[]): void {
  for (const id of nodeIds) {
    const n = getPlan(ctx, planId)?.nodes.find((x) => x.id === id);
    if (n && (n.status === 'open' || n.status === 'failed')) updateNode(ctx, planId, id, { status: 'queued' });
  }
}

/** Setzt eingereihte Knoten zurück auf offen (Lauf abgebrochen, Plan geändert …). */
export function releaseQueued(ctx: PlanCtx, planId: string, nodeIds: string[]): void {
  for (const id of nodeIds) {
    const n = getPlan(ctx, planId)?.nodes.find((x) => x.id === id);
    if (n?.status === 'queued') updateNode(ctx, planId, id, { status: 'open' });
  }
}

export { queueableOrder };

/**
 * Führt einen Knoten oder (ohne nodeId) alle noch nicht erledigten Knoten in Abhängigkeitsreihenfolge aus.
 * Knoten, die inzwischen von einem anderen Lauf erledigt wurden, werden übersprungen.
 */
export async function runPlan(ctx: PlanCtx, planId: string, nodeId: string | undefined, deps: RunDeps): Promise<RunReport> {
  const report: RunReport = { completed: [] };
  const initial = getPlan(ctx, planId);
  if (!initial) {
    deps.notify('Diesen Plan gibt es nicht mehr.', 'error');
    return { ...report, stoppedBecause: 'Plan nicht gefunden' };
  }
  const ids = nodeId ? [nodeId] : runOrder(initial);
  if (ids.length === 0) {
    deps.notify('Es gibt nichts auszuführen: alle Knoten sind fertig oder deaktiviert.');
    return report;
  }
  let spent = 0;
  let count = 0;

  const stop = (index: number, why: string, kind: 'info' | 'error' = 'error'): RunReport => {
    releaseQueued(ctx, planId, ids.slice(index));
    report.stoppedBecause = why;
    deps.notify(why, kind);
    return report;
  };

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const plan = getPlan(ctx, planId);
    const node = plan?.nodes.find((n) => n.id === id);
    if (!plan || !node) {
      if (!plan) return stop(i, 'Der Plan wurde während des Laufs gelöscht.');
      continue; // Knoten gelöscht
    }
    // Schon erledigt, deaktiviert oder von einem anderen Lauf in Arbeit: überspringen.
    if (node.status === 'done' || node.status === 'disabled' || node.status === 'running') continue;
    if (!ctx.store.getState().canBuild) return stop(i, 'Du hast hier kein Baurecht.');
    if (!isRunnable(plan, id)) return stop(i, 'Die Vorgänger eines Knotens sind nicht fertig geworden; der Lauf hält an.');
    if (count >= MAX_NODES_PER_RUN) return stop(i, `Pro Lauf werden höchstens ${MAX_NODES_PER_RUN} Knoten ausgeführt. Starte „Alle ausführen“ erneut für den Rest.`, 'info');
    if (spent > RUN_TOKEN_LIMIT) return stop(i, 'Das Token-Limit für einen Lauf ist erreicht. Starte „Alle ausführen“ erneut für den Rest.');

    const created = new Set<string>();
    const off = ctx.bus.on('entity.added', ({ entity, source, transient }) => {
      if (source === 'local' && !transient) created.add(entity.id);
    });
    let result: PromptResult = 'failed';
    try {
      markQueued(ctx, planId, [id]);
      const label = `Plan: ${node.title}`.slice(0, 70);
      result = await deps.runPrompt(buildNodePrompt(planId, id), {
        label,
        beforeRun: () => {
          // Direkt vor dem eigentlichen Start: Knoten läuft jetzt, frischer Gesprächsverlauf.
          try {
            updateNode(ctx, planId, id, { status: 'running', result: null });
          } catch (error) {
            if (!(error instanceof PlanError)) throw error;
          }
          deps.resetContext();
        },
      });
      spent += deps.lastRunTokens();
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      result = 'skipped';
    } finally {
      off();
    }

    const after = getPlan(ctx, planId)?.nodes.find((n) => n.id === id);
    if (!after) return stop(i + 1, 'Der Plan oder Knoten wurde während des Laufs gelöscht.');
    if (result === 'ok' && after.status === 'done') {
      report.completed.push(id);
    } else if (result === 'ok') {
      // Die KI hat vergessen, den Knoten abzuschließen: Ergebnis aus den neu angelegten Objekten ableiten.
      const alive = [...created].filter((eid) => !!ctx.store.getState().entities[eid]);
      updateNode(ctx, planId, id, { status: 'done', result: { entityIds: alive, summary: 'Automatisch verknüpft: die KI hat den Knoten nicht selbst abgeschlossen.' } });
      report.completed.push(id);
    } else if (result === 'skipped') {
      // Der Auftrag wurde nie gestartet (aus der Warteschlange entfernt, kein Key): Knoten zurück auf offen.
      if (after.status === 'queued' || after.status === 'running') updateNode(ctx, planId, id, { status: 'open' });
      return stop(i + 1, 'Der Auftrag wurde nicht gestartet.');
    } else {
      updateNode(ctx, planId, id, { status: 'failed' });
      report.failed = id;
      return stop(i + 1, 'Ein Knoten ist fehlgeschlagen oder wurde abgebrochen.');
    }
    count += 1;
  }
  return report;
}
