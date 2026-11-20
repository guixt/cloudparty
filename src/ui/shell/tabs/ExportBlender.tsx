import { useState } from 'react';
import { useStore } from 'zustand';
import { exportForBlender } from '../../../world/export';
import type { Props } from '../types';

export function ExportBlender({ shell }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const selected = useStore(shell.ctx.store, (s) => s.selectedIds);
  const run = async (selectionOnly: boolean, withScript: boolean) => {
    setBusy(true);
    setNote('');
    try {
      const res = await exportForBlender(shell.ctx, { ids: selectionOnly ? selected : undefined, withScript });
      const skipped = res.skipped.length > 0 ? ` ${res.skipped.length} Objekte ohne Entsprechung (Licht, Wasser, Spiegel) wurden ausgelassen.` : '';
      setNote(`${res.entities} Objekte exportiert.${skipped}`);
    } catch (e) {
      shell.ctx.bus.emit('ui.toast', { text: e instanceof Error ? e.message : 'Export fehlgeschlagen.', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cps-export" data-testid="export-blender">
      <div className="cp-label">Export nach Blender</div>
      <div className="cp-row">
        <button className="cp-button" disabled={busy} data-testid="export-glb" onClick={() => void run(false, false)}>
          Alles als .glb
        </button>
        <button className="cp-button" disabled={busy} data-testid="export-glb-script" title="Zusätzlich ein Blender-Skript, das Sammlungen, Sonne, Himmel und Kamera einrichtet" onClick={() => void run(false, true)}>
          .glb + Blender-Skript
        </button>
        {selected.length > 0 && (
          <button className="cp-button" disabled={busy} data-testid="export-glb-selection" onClick={() => void run(true, true)}>
            Nur Auswahl ({selected.length})
          </button>
        )}
      </div>
      {note && <p className="cp-muted" data-testid="export-note">{note}</p>}
    </div>
  );
}
