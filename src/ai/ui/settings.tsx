import { useState, type KeyboardEvent } from 'react';
import { AI_MODELS } from '../../../shared/aiTools';
import type { AssistantApi } from '../api';

/** Lockere Prüfung: nicht leer, keine Leerzeichen, nicht absurd kurz. Gibt eine Fehlermeldung oder null zurück. */
export function validateApiKey(raw: string): string | null {
  const key = raw.trim();
  if (!key) return 'Bitte einen Key eingeben.';
  if (/\s/.test(key)) return 'Der Key darf keine Leerzeichen enthalten.';
  if (key.length < 12) return 'Der Key ist zu kurz – bitte vollständig einfügen.';
  return null;
}

export function SettingsDialog({ api, explain, onClose }: { api: AssistantApi; explain: boolean; onClose: () => void }) {
  const [, force] = useState(0);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const settings = api.getSettings();
  const known = AI_MODELS.some((m) => m.id === settings.model);

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
        <div className="cp-row ai-modal-actions">
          <button type="button" className="cp-button" data-testid="ai-settings-close" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
