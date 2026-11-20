import { useState } from 'react';
import type { SkyPreset } from '../../../../shared/types';
import { SKY_LABELS } from '../controller';
import { useShell, type Props } from '../types';

export function NewTab({ shell }: Props) {
  const online = useShell(shell, (s) => s.serverOnline);
  const [name, setName] = useState('Meine Insel');
  const [sky, setSky] = useState<SkyPreset>('clear');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await shell.createIsland(name, sky);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <p className="cp-muted">{online ? 'Die Insel wird auf dem Server angelegt, und du wirst ihre Besitzerin oder ihr Besitzer.' : 'Du bist offline: Die Insel wird nur in diesem Browser gespeichert.'}</p>
      <label className="cp-label" htmlFor="cps-new-name">
        Name der Insel
      </label>
      <input id="cps-new-name" className="cp-input" data-testid="new-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="cp-label" htmlFor="cps-new-sky">
        Himmel
      </label>
      <select id="cps-new-sky" className="cp-select" data-testid="new-sky" value={sky} onChange={(e) => setSky(e.target.value as SkyPreset)}>
        {(Object.keys(SKY_LABELS) as (keyof typeof SKY_LABELS)[]).map((key) => (
          <option key={key} value={key}>
            {SKY_LABELS[key]}
          </option>
        ))}
      </select>
      <div className="cps-actions">
        <button type="submit" className="cp-button cp-button-primary" data-testid="new-create" disabled={busy || !name.trim()}>
          Insel erstellen
        </button>
      </div>
    </form>
  );
}
