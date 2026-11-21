import { useRef } from 'react';
import type { PanelProps } from '../../core/ui';
import { newEntityId } from '../../../shared/types';
import { exportWorldToFile, importWorldFromFile } from './io';
import './persistence.css';

/** Meldung mit den ersten Fehlern einer fehlgeschlagenen Prüfung. */
export function formatImportErrors(errors: string[]): string {
  const shown = errors.slice(0, 3).join(' · ');
  const more = errors.length > 3 ? ` (und ${errors.length - 3} weitere)` : '';
  return `Import fehlgeschlagen: ${shown}${more}`;
}

export function WorldFileButtons({ ctx }: PanelProps) {
  const input = useRef<HTMLInputElement>(null);

  const onExport = () => {
    const world = ctx.store.getState().toWorldSpec();
    exportWorldToFile(world);
    ctx.bus.emit('ui.toast', { text: `„${world.metadata.name}“ wurde exportiert.` });
  };

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    const result = await importWorldFromFile(file);
    if (!result.ok) {
      ctx.bus.emit('ui.toast', { text: formatImportErrors(result.errors), kind: 'error' });
      return;
    }
    const world = result.world;
    // Eine fremde Datei darf keine lokal gespeicherte Welt mit gleicher ID überschreiben.
    try {
      if (world.metadata.id && (await ctx.persistence.load(world.metadata.id))) {
        world.metadata = { ...world.metadata, id: newEntityId('welt') };
      }
    } catch {
      /* Speicher nicht lesbar: ID behalten */
    }
    ctx.store.getState().loadWorld(world);
    ctx.bus.emit('ui.toast', { text: `„${world.metadata.name}“ wurde importiert.` });
  };

  return (
    <div className="cp-panel cp-worldfile" data-testid="worldfile">
      <button type="button" className="cp-button" onClick={onExport} title="Welt als Datei speichern">
        Exportieren
      </button>
      <button type="button" className="cp-button" onClick={() => input.current?.click()} title="Welt aus Datei laden">
        Importieren
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Weltdatei auswählen"
        data-testid="worldfile-input"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
    </div>
  );
}
