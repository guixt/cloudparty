/** Tab „KI" im Skript-Editor: Skript erzeugen und Fehler erklären. Ausgaben werden nur als Text gezeigt. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AskClaude, AskOptions, AskResult } from '../../../ai/api';
import { askClaude, hasAiKey } from '../../../ai/core';
import type { LogLine, StatusInfo } from '../logic';
import { diffLines, diffStats } from './diff';
import { type ExtractResult } from './extract';
import { explainError, generateScript, MAX_LOG_LINES } from './generate';
import './ai.css';

declare global {
  interface Window {
    /** NUR FÜR TESTS: ersetzt `askClaude` und gilt als vorhandener Key. */
    __cloudpartyAskMock?: (options: AskOptions) => Promise<AskResult>;
  }
}

export interface AiPanelProps {
  entityName: string;
  entityRef?: string;
  otherNames: readonly string[];
  getSource: () => string;
  /** Ersetzt den Editorinhalt (speichert nicht). */
  setSource: (source: string) => void;
  getLogLines: () => readonly LogLine[];
  getStatus: () => StatusInfo | undefined;
  /** Für Tests; sonst Mock-Hook bzw. Kern-Client. */
  ask?: AskClaude;
  hasKey?: boolean;
}

interface Proposal {
  result: ExtractResult;
  base: string;
}

export function AiPanel(props: AiPanelProps) {
  const [description, setDescription] = useState('');
  const [useCurrent, setUseCurrent] = useState(true);
  const [busy, setBusy] = useState<'generate' | 'explain' | null>(null);
  const [stream, setStream] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const mock = typeof window !== 'undefined' ? window.__cloudpartyAskMock : undefined;
  const ask: AskClaude = props.ask ?? mock ?? askClaude;
  const keyOk = props.hasKey ?? (mock ? true : hasAiKey());
  const current = props.getSource();
  const hasCurrent = current.trim() !== '';

  const run = async (kind: 'generate' | 'explain') => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(kind);
    setStream('');
    setError(null);
    setProposal(null);
    setExplanation(null);
    const base = props.getSource();
    try {
      if (kind === 'generate') {
        const result = await generateScript({
          ask,
          description,
          currentSource: useCurrent && base.trim() ? base : undefined,
          name: props.entityName,
          ref: props.entityRef,
          otherNames: props.otherNames,
          signal: controller.signal,
          onDelta: (d) => setStream((s) => s + d),
        });
        if (!controller.signal.aborted) setProposal({ result, base });
      } else {
        const lines = props.getLogLines().slice(-MAX_LOG_LINES).map((l) => `[${l.level === 'error' ? 'Fehler' : 'Log'}] ${l.message}`);
        const status = props.getStatus();
        const out = await explainError({
          ask,
          source: base,
          logLines: lines,
          status: status ? `${status.status}${status.message ? ` – ${status.message}` : ''}` : 'unbekannt',
          signal: controller.signal,
          onDelta: (d) => setStream((s) => s + d),
        });
        if (!controller.signal.aborted) {
          setExplanation(out.explanation || 'Keine Erklärung erhalten.');
          if (out.fix) setProposal({ result: out.fix, base });
        }
      }
    } catch (e) {
      if (controller.signal.aborted) setError('Abgebrochen.');
      else setError(e instanceof Error ? e.message : 'Unbekannter Fehler bei der KI-Anfrage.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(null);
      setStream('');
    }
  };

  const stop = () => abortRef.current?.abort();
  const apply = () => {
    if (!proposal) return;
    props.setSource(proposal.result.code);
    setProposal(null);
  };

  return (
    <div className="se-pane ai-panel" data-testid="ai-panel">
      {!keyOk && (
        <p className="ai-hint" data-testid="ai-nokey">
          KI-Key in den KI-Einstellungen eintragen (Knopf „KI" in der Leiste).
        </p>
      )}
      <label className="ai-label" htmlFor="ai-desc">Was soll das Objekt tun?</label>
      <textarea
        id="ai-desc"
        className="cp-input ai-desc"
        data-testid="ai-description"
        rows={3}
        value={description}
        placeholder="z. B. Beim Anklicken wechselt das Objekt die Farbe und spielt einen Ton."
        onChange={(e) => setDescription(e.target.value)}
        disabled={busy !== null}
      />
      {hasCurrent && (
        <label className="se-check">
          <input type="checkbox" data-testid="ai-use-current" checked={useCurrent} onChange={(e) => setUseCurrent(e.target.checked)} /> Aktuelles Skript als Ausgangspunkt verwenden
        </label>
      )}
      <div className="ai-buttons">
        <button type="button" className="cp-button cp-button-primary" data-testid="ai-generate" disabled={!keyOk || busy !== null || description.trim() === ''} onClick={() => void run('generate')}>
          Skript erzeugen
        </button>
        <button type="button" className="cp-button" data-testid="ai-explain" disabled={!keyOk || busy !== null} onClick={() => void run('explain')} title="Erklärt die letzten Zeilen der Konsole">
          Fehler erklären
        </button>
        {busy && (
          <button type="button" className="cp-button" data-testid="ai-stop" onClick={stop}>
            Stopp
          </button>
        )}
      </div>

      {busy && (
        <div className="ai-stream" data-testid="ai-stream">
          <div className="cp-muted">{busy === 'generate' ? 'Die KI schreibt …' : 'Die KI analysiert …'}</div>
          <pre>{stream}</pre>
        </div>
      )}
      {error && <div className="ai-error" data-testid="ai-error" role="alert">{error}</div>}
      {explanation !== null && (
        <div className="ai-card" data-testid="ai-explanation">
          <strong>Erklärung</strong>
          <p className="ai-text">{explanation}</p>
        </div>
      )}
      {proposal && <ProposalCard proposal={proposal} fixMode={explanation !== null} onApply={apply} onDiscard={() => setProposal(null)} />}
    </div>
  );
}

function ProposalCard({ proposal, fixMode, onApply, onDiscard }: { proposal: Proposal; fixMode: boolean; onApply: () => void; onDiscard: () => void }) {
  const { result, base } = proposal;
  const diff = useMemo(() => diffLines(base, result.code), [base, result.code]);
  const stats = diffStats(diff);
  return (
    <div className="ai-card" data-testid="ai-result">
      {!fixMode && result.explanation && <p className="ai-text" data-testid="ai-result-text">{result.explanation}</p>}
      {result.warnings.map((w, i) => (
        <div key={i} className="ai-warning" data-testid="ai-warning">{w}</div>
      ))}
      <div className="cp-muted">Änderungen: +{stats.added} / −{stats.removed} Zeilen</div>
      <div className="ai-diff" data-testid="ai-diff">
        {diff.map((l, i) => (
          <div key={i} className={`ai-line ai-${l.type}`} data-type={l.type}>
            <span className="ai-sign">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
            <span>{l.text || ' '}</span>
          </div>
        ))}
      </div>
      <div className="ai-buttons">
        <button type="button" className="cp-button cp-button-primary" data-testid="ai-apply" onClick={onApply}>
          {fixMode ? 'Korrigiertes Skript übernehmen' : 'Übernehmen'}
        </button>
        <button type="button" className="cp-button" data-testid="ai-discard" onClick={onDiscard}>
          Verwerfen
        </button>
        <span className="cp-muted">Gespeichert wird erst mit Strg+S.</span>
      </div>
    </div>
  );
}
