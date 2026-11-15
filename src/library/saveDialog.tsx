/** Kleiner Dialog „Auswahl als Baustein speichern". */
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { LIBRARY_LIMITS } from '../../shared/library';
import { askClaude, hasAiKey } from '../ai/core';
import type { PanelProps } from '../core/ui';
import { describeEntitiesForAi, expandGroups, parseAiLabel, parseTags } from './logic';
import { getLibrary } from './instance';
import { libraryUi } from './ui';

const AI_SYSTEM =
  'Du hilfst in einer 3D-Bauwelt, Bausteine zu beschriften. Antworte ausschließlich mit einem JSON-Objekt der Form ' +
  '{"name": "...", "description": "...", "tags": ["..."]} auf Deutsch. Name: höchstens 40 Zeichen. Beschreibung: ein Satz. Tags: 2 bis 5 kurze Stichwörter.';

export function SaveDialog({ ctx }: PanelProps) {
  const selectedIds = useStore(ctx.store, (s) => s.selectedIds);
  const entities = useStore(ctx.store, (s) => s.entities);
  const ids = useMemo(() => expandGroups(selectedIds, entities), [selectedIds, entities]);
  const firstGroup = ids.map((id) => entities[id]?.groupName).find(Boolean);
  const [name, setName] = useState(firstGroup ?? '');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const close = () => libraryUi.setState({ saveOpen: false });
  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      const api = getLibrary();
      if (!api) throw new Error('Die Bibliothek ist noch nicht bereit.');
      const meta = await api.save({ name, description, tags: parseTags(tags), ids });
      ctx.bus.emit('ui.toast', { text: `Baustein „${meta.name}" gespeichert (${meta.count} Objekte).`, kind: 'info' });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const suggest = async () => {
    setError('');
    setAiBusy(true);
    try {
      const list = describeEntitiesForAi(ids.map((id) => entities[id]).filter(Boolean));
      const reply = await askClaude({ system: AI_SYSTEM, prompt: `Beschrifte diesen Baustein aus ${ids.length} Objekten:\n${list}`, maxTokens: 400 });
      const label = parseAiLabel(reply.text);
      if (!label) throw new Error('Die KI-Antwort konnte nicht gelesen werden. Bitte noch einmal versuchen.');
      setName(label.name);
      setDescription(label.description);
      setTags(label.tags.join(', '));
    } catch (e) {
      setError(`KI-Beschriftung fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  };
  const onKey = (event: ReactKeyboardEvent) => {
    event.stopPropagation();
    if (event.type === 'keydown') {
      if (event.key === 'Escape') close();
      else if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
        event.preventDefault();
        void submit();
      }
    }
  };
  return (
    <div className="lib-modal" onKeyDown={onKey} onKeyUp={onKey} onKeyPress={onKey}>
      <div className="cp-panel lib-dialog" data-testid="library-save-dialog" role="dialog" aria-label="Auswahl als Baustein speichern">
        <div className="cp-title">Auswahl als Baustein speichern</div>
        <p className="cp-muted lib-small">{ids.length} {ids.length === 1 ? 'Objekt' : 'Objekte'} (ganze Gruppen werden mitgenommen).</p>
        <label className="lib-field">
          <span>Name</span>
          <input className="cp-input" data-testid="library-save-name" autoFocus maxLength={LIBRARY_LIMITS.maxNameLength} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Mein Gartenhaus" />
        </label>
        <label className="lib-field">
          <span>Beschreibung (optional)</span>
          <textarea className="cp-textarea" data-testid="library-save-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="lib-field">
          <span>Tags (durch Komma getrennt)</span>
          <input className="cp-input" data-testid="library-save-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Haus, Garten" />
        </label>
        {error && <div className="lib-error" data-testid="library-save-error">{error}</div>}
        <div className="lib-dialog-actions">
          {hasAiKey() && (
            <button type="button" className="cp-button" data-testid="library-save-ai" disabled={aiBusy || ids.length === 0} onClick={suggest} title="Die KI schlägt Name, Beschreibung und Tags vor">
              {aiBusy ? 'KI überlegt …' : 'Mit KI beschriften'}
            </button>
          )}
          <span className="lib-spacer" />
          <button type="button" className="cp-button" data-testid="library-save-cancel" onClick={close}>Abbrechen</button>
          <button type="button" className="cp-button cp-button-primary" data-testid="library-save-submit" disabled={busy || ids.length === 0} onClick={() => void submit()}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
