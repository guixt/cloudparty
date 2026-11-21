/**
 * Einreihen von Plan-Ausführungen: Anfragen („Ausführen“ an einem Knoten, „Alle ausführen“) werden sofort angenommen
 * und die betroffenen Knoten als „queued“ markiert, auch wenn die KI oder ein anderer Plan-Lauf gerade arbeitet.
 * Die Anfragen laufen danach der Reihe nach (ein Lauf zur Zeit).
 */
import { getPlan, type PlanCtx } from '../core/api';
import { getReviewAfterRun, getRoleModel } from '../../ai/core/settings';
import { markQueued, queueBlockReason, queueableOrder, releaseQueued, runPlan, runReview, type RunDeps } from './runner';

export interface RunRequest {
  planId: string;
  nodeId?: string;
  /** true = den Plan mit dem Prüfmodell kontrollieren (statt Knoten auszuführen). */
  review?: boolean;
}

export interface RunQueue {
  request(req: RunRequest): void;
  /** Anzahl wartender (noch nicht gestarteter) Anfragen. */
  pending(): number;
  /** Resolve, sobald alle Anfragen abgearbeitet sind. */
  idle(): Promise<void>;
}

export function createRunQueue(ctx: PlanCtx, getDeps: () => RunDeps | null, notify: (text: string, kind?: 'info' | 'error') => void, onStart?: () => void): RunQueue {
  const waiting: { req: RunRequest; nodeIds: string[] }[] = [];
  let draining: Promise<void> | null = null;

  async function drain(): Promise<void> {
    while (waiting.length > 0) {
      const { req, nodeIds } = waiting.shift() as { req: RunRequest; nodeIds: string[] };
      const deps = getDeps();
      if (!deps) {
        notify('Die KI ist nicht verfügbar.', 'error');
        releaseQueued(ctx, req.planId, nodeIds);
        continue;
      }
      try {
        if (req.review) {
          await runReview(ctx, req.planId, deps);
          continue;
        }
        const report = await runPlan(ctx, req.planId, req.nodeId, deps);
        if (!report.stoppedBecause && report.completed.length > 0) notify(`Fertig: ${report.completed.length} Knoten ausgeführt.`);
        // Automatische Prüfung nach „Alle ausführen“ (nur mit gesetztem Prüfmodell und ohne Abbruch).
        if (!req.nodeId && !report.stoppedBecause && report.completed.length > 0 && getReviewAfterRun() && getRoleModel('review')) {
          const again = getDeps();
          if (again) await runReview(ctx, req.planId, again);
        }
      } catch (error) {
        notify(`Der Plan-Lauf ist abgebrochen: ${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        releaseQueued(ctx, req.planId, nodeIds);
      }
    }
  }

  return {
    request(req) {
      let nodeIds: string[];
      if (req.review) {
        if (!getPlan(ctx, req.planId)) return notify('Diesen Plan gibt es nicht mehr.', 'error');
        if (!ctx.store.getState().canBuild) return notify('Du hast hier kein Baurecht.', 'error');
        waiting.push({ req, nodeIds: [] });
        onStart?.();
        if (!draining) {
          draining = drain().finally(() => {
            draining = null;
          });
        }
        return;
      }
      if (req.nodeId) {
        const reason = queueBlockReason(ctx, req.planId, req.nodeId);
        if (reason) return notify(reason, 'error');
        nodeIds = [req.nodeId];
      } else {
        const plan = getPlan(ctx, req.planId);
        if (!plan) return notify('Diesen Plan gibt es nicht mehr.', 'error');
        if (!ctx.store.getState().canBuild) return notify('Du hast hier kein Baurecht.', 'error');
        nodeIds = queueableOrder(plan);
        if (nodeIds.length === 0) return notify('Es gibt nichts einzureihen: alles ist fertig, deaktiviert oder schon eingereiht.');
      }
      markQueued(ctx, req.planId, nodeIds);
      waiting.push({ req, nodeIds });
      const queuedBehind = draining !== null;
      if (queuedBehind) notify(nodeIds.length === 1 ? 'Knoten eingereiht – er läuft nach dem aktuellen Auftrag.' : `${nodeIds.length} Knoten eingereiht.`);
      onStart?.();
      if (!draining) {
        draining = drain().finally(() => {
          draining = null;
        });
      }
    },
    pending: () => waiting.length,
    idle: () => draining ?? Promise.resolve(),
  };
}
