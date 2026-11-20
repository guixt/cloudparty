import { useState, type KeyboardEvent } from 'react';
import { AI_MODELS, AI_RUN_LIMITS, AI_TOKEN_LIMITS, type AiRunLimitKey } from '../../../shared/aiTools';
import type { AssistantApi } from '../api';
import { BridgeSettings } from './BridgeSettings';
import { getRunLimits, getStoredRunLimits, isLongRunMode, resetRunLimits, setLongRunMode, setStoredRunLimits } from '../core/runLimits';
import { LOG_LEVELS, clearLog, exportLog, getLogEntries, getLogLevel, setLogLevel, type LogLevel } from '../core/log';

const LOG_LABELS: Record<LogLevel, string> = { off: 'Aus', normal: 'Normal (Werkzeuge, Tokens, Fehler)', detail: 'Ausführlich (auch Aufträge, Eingaben und Ergebnisse)' };

function downloadLog(): void {
  const blob = new Blob([exportLog()], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cloudparty-ki-protokoll-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lockere Prüfung: nicht leer, keine Leerzeichen, nicht absurd kurz. Gibt eine Fehlermeldung oder null zurück. */
export function validateApiKey(raw: string): string | null {
  const key = raw.trim();
  if (!key) return 'Bitte einen Key eingeben.';
  if (/\s/.test(key)) return 'Der Key darf keine Leerzeichen enthalten.';
  if (key.length < 12) return 'Der Key ist zu kurz – bitte vollständig einfügen.';
  return null;
}

const fmt = (n: number) => n.toLocaleString('de-DE');
/** Grobe Umrechnung für die Anzeige: ein Token ist etwa 0,6 deutsche Wörter. */
const words = (tokens: number) => fmt(Math.round((tokens * 0.6) / 100) * 100);

function LimitField({
  id,
  label,
  hint,
  range,
  value,
  onChange,
  unit = 'Tokens',
  words: showWords = true,
  effective,
}: {
  id: string;
  label: string;
  hint: string;
  range: { min: number; max: number; step?: number; default: number };
  value: number;
  onChange: (value: number) => void;
  /** Einheit hinter dem Feld (Standard: Tokens). */
  unit?: string;
  /** Wörter-Schätzung anzeigen (nur für Token-Grenzen sinnvoll). */
  words?: boolean;
  /** Wirksamer Wert, falls er vom eingestellten abweicht (Modus „Lange Pläne“). */
  effective?: number;
}) {
  // Eingabe als Text: so lässt sich das Feld beim Tippen auch kurz leeren; übernommen wird beim Verlassen bzw. mit Enter.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const parsed = Number(draft?.replace(/[.\s]/g, '').replace(',', '.'));
  const invalid = draft !== null && (draft.trim() === '' || !Number.isFinite(parsed));
  const commit = () => {
    if (draft === null) return;
    if (invalid) {
      setDraft(null);
      return;
    }
    const clamped = Math.min(range.max, Math.max(range.min, Math.round(parsed)));
    setDraft(null);
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className="ai-limit">
      <label className="cp-label" htmlFor={id}>
        {label} {showWords && <span className="cp-muted">(ca. {words(value)} Wörter)</span>}
        {effective !== undefined && effective !== value && <span className="cp-muted"> – wirksam: {fmt(effective)} (Lange Pläne)</span>}
      </label>
      <div className="cp-row">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className={`cp-input ai-number${invalid ? ' ai-number-invalid' : ''}`}
          data-testid={id}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(null);
          }}
        />
        <span className="cp-muted ai-unit">{unit}</span>
        <button type="button" className="cp-button ai-icon-btn" title="Standardwert" aria-label="Standardwert" data-testid={`${id}-reset`} onClick={() => { setDraft(null); onChange(range.default); }}>
          ↺
        </button>
      </div>
      <div className="ai-limit-hint cp-muted">
        {hint} Erlaubt: {fmt(range.min)} bis {fmt(range.max)} (Standard {fmt(range.default)}).
      </div>
    </div>
  );
}

type Tab = 'access' | 'limits' | 'features' | 'log';
const TABS: [Tab, string][] = [
  ['access', 'Zugang'],
  ['limits', 'Limits'],
  ['features', 'Funktionen'],
  ['log', 'Protokoll'],
];

const RUN_GROUPS: { title: string; keys: AiRunLimitKey[] }[] = [
  { title: 'Laufzeit pro Auftrag (ein Plan-Knoten ist ein Auftrag)', keys: ['maxRounds', 'maxToolCalls', 'maxNewEntities', 'confirmNewEntitiesAt', 'confirmRemovalsAt'] },
  { title: 'Bilder und Tests pro Auftrag', keys: ['maxScreenshots', 'maxImageSearches', 'maxImageDownloads', 'maxScriptTests'] },
  { title: 'Plan-Lauf („Alle ausführen“)', keys: ['planNodesPerRun', 'planTokensPerRun'] },
];
const RUN_UNITS: Partial<Record<AiRunLimitKey, string>> = { planTokensPerRun: 'Tokens', maxRounds: 'Schritte', maxToolCalls: 'Aufrufe', maxNewEntities: 'Objekte', confirmNewEntitiesAt: 'Objekte', confirmRemovalsAt: 'Löschungen', planNodesPerRun: 'Knoten' };

export function SettingsDialog({ api, explain, onClose }: { api: AssistantApi; explain: boolean; onClose: () => void }) {
  const [, force] = useState(0);
  const [tab, setTab] = useState<Tab>('access');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const settings = api.getSettings();
  const known = AI_MODELS.some((m) => m.id === settings.model);
  const stored = getStoredRunLimits();
  const effective = getRunLimits();
  const longRun = isLongRunMode();

  const save = () => {
    const problem = validateApiKey(key);
    if (problem) return setError(problem);
    api.setApiKey(key.trim());
    setKey('');
    setError(null);
    force((n) => n + 1);
  };
  const stop = (e: KeyboardEvent) => e.stopPropagation();

  return (
    <div className="cp-modal-backdrop ai-modal-backdrop" data-testid="ai-settings" onKeyDown={stop} onKeyUp={stop}>
      <div className="cp-modal ai-modal" role="dialog" aria-label="KI-Einstellungen">
        <div className="cp-title">KI-Einstellungen</div>
        <div className="ai-tabs" role="tablist" data-testid="ai-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`cp-button${tab === id ? ' cp-button-active' : ''}`} data-testid={`ai-tab-${id}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'access' && (
          <>
            {explain && !settings.hasKey && (
              <p className="ai-explain" data-testid="ai-need-key">
                Für den Assistenten brauchst du einen eigenen Anthropic-API-Key. Trage ihn hier ein, danach kannst du loslegen.
              </p>
            )}
            <label className="cp-label" htmlFor="ai-key">
              Anthropic-API-Key
            </label>
            {settings.hasKey ? (
              <div className="cp-row">
                <span className="ai-key-ok" data-testid="ai-key-saved">
                  Key gespeichert ✓
                </span>
                <button
                  type="button"
                  className="cp-button cp-button-danger"
                  data-testid="ai-key-clear"
                  onClick={() => {
                    api.setApiKey('');
                    force((n) => n + 1);
                  }}
                >
                  Key löschen
                </button>
              </div>
            ) : (
              <div className="cp-row">
                <input
                  id="ai-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="cp-input"
                  data-testid="ai-key-input"
                  placeholder="sk-ant-…"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') save();
                  }}
                />
                <button type="button" className="cp-button cp-button-primary" data-testid="ai-key-save" onClick={save}>
                  Speichern
                </button>
              </div>
            )}
            {error && (
              <div className="ai-error-text" role="alert">
                {error}
              </div>
            )}
            <label className="cp-label" htmlFor="ai-model">
              Modell
            </label>
            <select
              id="ai-model"
              className="cp-select"
              data-testid="ai-model"
              value={settings.model}
              onChange={(e) => {
                api.setModel(e.target.value);
                force((n) => n + 1);
              }}
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {!known && <option value={settings.model}>{settings.model}</option>}
            </select>
            <ul className="ai-notes cp-muted">
              <li>Der Key wird nur in diesem Browser gespeichert und direkt an Anthropic gesendet – nie an den Cloudparty-Server oder in Weltdateien.</li>
              <li>Anfragen kosten Geld (Abrechnung bei Anthropic).</li>
              <li>Der Assistent sieht den Inhalt dieser Insel.</li>
              <li>
                Einen Key erstellst du in der{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                  Anthropic Console
                </a>
                .
              </li>
            </ul>
          </>
        )}

        {tab === 'limits' && (
          <>
            <label className="ai-radio ai-longrun" title="Hebt alle Grenzen unten auf großzügige Werte an, bis du die Seite neu lädst oder den Tab schließt">
              <input
                type="checkbox"
                data-testid="ai-long-run"
                checked={longRun}
                onChange={(e) => {
                  setLongRunMode(e.target.checked);
                  force((n) => n + 1);
                }}
              />
              <span>
                <strong>Lange Pläne (temporär)</strong> – hebt alle Laufzeit-Grenzen auf großzügige Werte an, nur bis zum Neuladen bzw. Schließen des Tabs. Deine gespeicherten Werte bleiben unverändert. Das kann mehr Tokens und Kosten verursachen.
              </span>
            </label>
            <div className="cp-label">Länge pro Anfrage</div>
            <LimitField
              id="ai-max-output"
              label="Maximale Antwortlänge"
              hint="Wird eine Antwort abgeschnitten (z. B. bei großen Bauaufträgen oder langen Skripten), erhöhe diesen Wert. Längere Antworten kosten mehr."
              range={AI_TOKEN_LIMITS.output}
              value={settings.maxOutputTokens}
              onChange={(value) => {
                api.setTokenLimits({ maxOutputTokens: value });
                force((n) => n + 1);
              }}
            />
            <LimitField
              id="ai-max-input"
              label="Maximale Eingabelänge"
              hint="So viel Weltdaten und Gesprächsverlauf sieht die KI pro Anfrage. Wird es mehr, lässt sie zuerst ältere Gesprächsteile weg und kürzt große Ergebnisse. Mehr Eingabe kostet mehr."
              range={AI_TOKEN_LIMITS.input}
              value={settings.maxInputTokens}
              onChange={(value) => {
                api.setTokenLimits({ maxInputTokens: value });
                force((n) => n + 1);
              }}
            />
            {RUN_GROUPS.map((g) => (
              <div key={g.title} data-testid="ai-run-group">
                <div className="cp-label">{g.title}</div>
                {g.keys.map((k) => (
                  <LimitField
                    key={k}
                    id={`ai-run-${k}`}
                    label={AI_RUN_LIMITS[k].label}
                    hint={AI_RUN_LIMITS[k].hint}
                    range={AI_RUN_LIMITS[k]}
                    value={stored[k] ?? AI_RUN_LIMITS[k].default}
                    effective={longRun ? effective[k] : undefined}
                    unit={RUN_UNITS[k] ?? 'Stück'}
                    words={false}
                    onChange={(value) => {
                      setStoredRunLimits({ [k]: value });
                      force((n) => n + 1);
                    }}
                  />
                ))}
              </div>
            ))}
            <div className="cp-row">
              <button
                type="button"
                className="cp-button"
                data-testid="ai-run-reset"
                onClick={() => {
                  resetRunLimits();
                  api.setTokenLimits({ maxInputTokens: AI_TOKEN_LIMITS.input.default, maxOutputTokens: AI_TOKEN_LIMITS.output.default });
                  force((n) => n + 1);
                }}
              >
                Alle Limits auf Standard
              </button>
            </div>
          </>
        )}

        {tab === 'features' && (
          <>
            <div className="cp-label">Freigaben</div>
            <label className="ai-radio">
              <input
                type="radio"
                name="ai-approval"
                data-testid="ai-approval-ask"
                checked={settings.approval !== 'auto'}
                onChange={() => {
                  api.setApproval('ask');
                  setConfirmAuto(false);
                  force((n) => n + 1);
                }}
              />
              <span>Vor Skripten und vielen Löschungen fragen (empfohlen)</span>
            </label>
            <label className="ai-radio">
              <input
                type="radio"
                name="ai-approval"
                data-testid="ai-approval-auto"
                checked={settings.approval === 'auto' || confirmAuto}
                onChange={() => {
                  if (settings.approval !== 'auto') setConfirmAuto(true);
                }}
              />
              <span>Alles erlauben – die KI arbeitet ohne Rückfragen</span>
            </label>
            {confirmAuto && settings.approval !== 'auto' && (
              <div className="ai-warning" role="alert" data-testid="ai-approval-warning">
                Skripte der KI werden ohne Prüfung gespeichert und laufen sofort. Gesperrte Befehle, Größenlimits und das Baurecht werden weiterhin geprüft, und mit „Rückgängig“ kannst du einen Auftrag zurücknehmen.
                <div className="cp-row ai-modal-actions">
                  <button type="button" className="cp-button" data-testid="ai-approval-cancel" onClick={() => setConfirmAuto(false)}>
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="cp-button cp-button-primary"
                    data-testid="ai-approval-confirm"
                    onClick={() => {
                      api.setApproval('auto');
                      setConfirmAuto(false);
                      force((n) => n + 1);
                    }}
                  >
                    Alles erlauben
                  </button>
                </div>
              </div>
            )}
            <div className="cp-label">Screenshots und Bilder</div>
            <label className="ai-radio">
              <input
                type="checkbox"
                data-testid="ai-vision"
                checked={settings.vision}
                onChange={(e) => {
                  api.setVision(e.target.checked);
                  force((n) => n + 1);
                }}
              />
              <span>Die KI darf Screenshots der Welt ansehen (kostet zusätzliche Tokens; die Bilder gehen an Anthropic)</span>
            </label>
            <label className="ai-radio">
              <input
                type="checkbox"
                data-testid="ai-image-search"
                checked={settings.imageSearch}
                onChange={(e) => {
                  api.setImageSearch(e.target.checked);
                  force((n) => n + 1);
                }}
              />
              <span>Die KI darf im Internet nach freien Bildern suchen (Wikimedia Commons, Openverse; der Suchbegriff geht an diese Dienste, die Bilder werden verkleinert in der Welt gespeichert)</span>
            </label>
            <BridgeSettings />
          </>
        )}

        {tab === 'log' && (
          <>
            <div className="cp-label">Protokoll</div>
            <select
              className="cp-select"
              data-testid="ai-log-level"
              value={getLogLevel()}
              onChange={(e) => {
                setLogLevel(e.target.value as LogLevel);
                force((n) => n + 1);
              }}
            >
              {LOG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LOG_LABELS[l]}
                </option>
              ))}
            </select>
            <p className="cp-muted">Bleibt nur in diesem Browser (der API-Key wird nie protokolliert). Im Ausführlich-Modus stehen auch deine Aufträge und die Antworten der KI darin; gib die Datei nur weiter, wenn du das möchtest. {getLogEntries().length} Einträge.</p>
            <div className="cp-row">
              <button type="button" className="cp-button" data-testid="ai-log-export" disabled={getLogEntries().length === 0} onClick={downloadLog}>
                Protokoll exportieren
              </button>
              <button
                type="button"
                className="cp-button cp-button-danger"
                data-testid="ai-log-clear"
                onClick={() => {
                  clearLog();
                  force((n) => n + 1);
                }}
              >
                Löschen
              </button>
            </div>
          </>
        )}

        <div className="cp-row ai-modal-actions">
          <button type="button" className="cp-button" data-testid="ai-settings-close" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
