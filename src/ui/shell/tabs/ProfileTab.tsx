import { useState } from 'react';
import { useShell, type Props } from '../types';

export function ProfileTab({ shell }: Props) {
  const name = useShell(shell, (s) => s.name) ?? '';
  const userId = useShell(shell, (s) => s.userId);
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void shell.setName(value).then(() => setSaved(true));
      }}
    >
      <label className="cp-label" htmlFor="cps-profile-name">
        Anzeigename
      </label>
      <input
        id="cps-profile-name"
        className="cp-input"
        data-testid="profile-name"
        maxLength={32}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
      />
      <div className="cps-actions">
        <button type="submit" className="cp-button cp-button-primary" data-testid="profile-save" disabled={!value.trim() || value.trim() === name}>
          {saved ? 'Gespeichert' : 'Speichern'}
        </button>
      </div>
      <p className="cp-muted cps-small">{userId ? `Benutzer-ID: ${userId}` : 'Du bist nicht mit einem Server verbunden.'}</p>
    </form>
  );
}
