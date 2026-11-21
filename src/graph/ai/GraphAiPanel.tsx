/** KI-Hilfe im Graph-Editor: Beschreibung → Graph. Modellausgaben werden nur als Text angezeigt. */
import { useRef, useState } from 'react';
import type { GraphSpec } from '../../../shared/graph';
import { askClaude, hasAiKey } from '../../ai/core';
import type { AskClaude } from '../../ai/api';
import { generateGraph, summarizeGraph, type Attempt } from './graphAiLogic';

export interface GraphAiPanelProps {
  entityId: string;
  entityName: string;
  /** Aktueller Graph im Editor (zum Verbessern). */
  graph: GraphSpec;
  /** Übernimmt den vorgeschlagenen Graphen in den Editor (speichert NICHT; der Nutzer prüft ihn zuerst). */
  onApply(graph: GraphSpec): void;
  /** Nur für Tests. */
  ask?: AskClaude;
  hasKey?: () => boolean;
}

export function GraphAiPanel({ entityName, graph, onApply, ask = askClaude, hasKey = hasAiKey }: GraphAiPanelProps) {
  const [goal, setGoal] = useState('');
  const [improve, setImprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Attempt | null>(null);
  const abort = useRef<AbortController | null>(null);
  const key = hasKey();
  const hasGraph = graph.nodes.length > 0;

  async function run() {
    if (busy || !goal.trim() || !key) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await generateGraph({ ask, goal, current: graph, improve: improve && hasGraph, signal: controller.signal, onStatus: setStatus }));
      setStatus('');
    } catch (e) {
      const err = e as Error;
      setStatus('');
      setError(err.name === 'AbortError' ? 'Abgebrochen.' : err.message || 'Die KI-Anfrage ist fehlgeschlagen.');
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }

  const usable = result?.graph && result.errors.length === 0;
  return (
    <div className="cp-col" style={{ gap: 8 }}>
      <label>
        Was soll {entityName ? `„${entityName}“` : 'das Objekt'} tun?
        <textarea className="cp-input" rows={4} value={goal} maxLength={2000} onChange={(e) => setGoal(e.target.value)} placeholder="Was soll das Objekt tun?" aria-label="Was soll das Objekt tun?" />
      </label>
      {hasGraph && (
        <label>
          <input type="checkbox" checked={improve} onChange={(e) => setImprove(e.target.checked)} /> Aktuellen Graphen verbessern
        </label>
      )}
      {!key && <div className="cp-muted">KI-Key in den KI-Einstellungen eintragen (Knopf „KI“ in der Leiste)</div>}
      <div className="cp-row" style={{ gap: 8 }}>
        <button className="cp-btn" disabled={!key || busy || !goal.trim()} onClick={() => void run()}>
          Graph erzeugen
        </button>
        {busy && (
          <button className="cp-btn" onClick={() => abort.current?.abort()}>
            Stopp
          </button>
        )}
      </div>
      {status && <div className="cp-muted" role="status">{status}</div>}
      {error && <div role="alert">{error}</div>}
      {result && (
        <div className="cp-col" style={{ gap: 6 }}>
          {result.graph && <div>{summarizeGraph(result.graph)}</div>}
          {result.errors.length > 0 && (
            <ul aria-label="Fehler">
              {result.errors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          {result.warnings.length > 0 && (
            <ul aria-label="Hinweise">
              {result.warnings.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <div className="cp-row" style={{ gap: 8 }}>
            {usable && (
              <button
                className="cp-btn"
                onClick={() => {
                  onApply(result.graph as GraphSpec);
                  setResult(null);
                }}
              >
                Übernehmen
              </button>
            )}
            <button className="cp-btn" onClick={() => setResult(null)}>
              Verwerfen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
