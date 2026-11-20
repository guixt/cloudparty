import { useState } from 'react';
import type { Props } from './types';

// ---------- Willkommen ----------
export function Welcome({ shell }: Props) {
  const [value, setValue] = useState('');
  const submit = () => value.trim() && void shell.setName(value);
  return (
    <div className="cp-modal-backdrop" data-testid="welcome-dialog">
      <form
        className="cp-modal cps-welcome"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="cps-welcome-icon" aria-hidden>
          ☁
        </div>
        <h2 className="cps-h2">Willkommen bei Cloudparty!</h2>
        <p className="cps-intro">
          Erkunde schwebende Inseln, baue eigene Welten, programmiere Objekte und triff andere Leute. Zum Start brauchst du nur einen Namen.
        </p>
        <label className="cp-label" htmlFor="cps-name">
          Wie möchtest du heißen?
        </label>
        <input
          id="cps-name"
          className="cp-input"
          data-testid="welcome-name"
          autoFocus
          maxLength={32}
          placeholder="Dein Name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="cps-actions">
          <button type="submit" className="cp-button cp-button-primary" data-testid="welcome-start" disabled={!value.trim()}>
            Los geht's
          </button>
        </div>
        <p className="cp-muted cps-small">Hilfe zur Steuerung findest du jederzeit mit der Taste H.</p>
      </form>
    </div>
  );
}
