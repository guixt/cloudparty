/** Bibliotheks-Fenster: Suche, Tag-Filter, Kartenraster, Aktionen. */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import type { LibraryItemMeta } from '../../shared/library';
import type { PanelProps } from '../core/ui';
import { getLibrary } from './instance';
import { allTags, filterItems, parseTags } from './logic';
import { SaveDialog } from './saveDialog';
import { DRAG_TYPE, libraryUi } from './ui';

interface Rect { x: number; y: number; w: number; h: number }
const MIN_W = 340;
const MIN_H = 300;

function defaultRect(): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(480, Math.max(MIN_W, vw - 24));
  // Links neben dem Inspector-Bereich (rechts 290 px + Rand), oberhalb der Werkzeugleiste.
  const x = Math.max(8, vw - 290 - 24 - w);
  const y = 64;
  const h = Math.max(MIN_H, Math.min(600, vh - y - 84));
  return { x, y, w, h };
}

export function useLibraryItems(): { items: LibraryItemMeta[]; error: string } {
  const [items, setItems] = useState<LibraryItemMeta[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const api = getLibrary();
    if (!api) return;
    let alive = true;
    const load = () =>
      api.list().then(
        (list) => alive && (setItems(list), setError('')),
        (e: Error) => alive && setError(`Die Bibliothek konnte nicht geladen werden: ${e.message}`),
      );
    void load();
    const off = api.subscribe(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);
  return { items, error };
}

function Card({ item, canPlace, hint, onPlace, onMessage }: { item: LibraryItemMeta; canPlace: boolean; hint: string; onPlace: () => void; onMessage: (text: string, error?: boolean) => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [tags, setTags] = useState(item.tags.join(', '));
  const api = getLibrary()!;
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      onMessage((e as Error).message, true);
    }
  };
  if (mode === 'edit') {
    return (
      <div className="lib-card lib-card-edit" data-testid={`library-card-${item.id}`}>
        <input className="cp-input" data-testid="library-edit-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <textarea className="cp-textarea" data-testid="library-edit-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beschreibung" />
        <input className="cp-input" data-testid="library-edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, durch Komma getrennt" />
        <div className="lib-row">
          <button type="button" className="cp-button cp-button-primary" data-testid="library-edit-save" onClick={() => void run(async () => { await api.update(item.id, { name, description, tags: parseTags(tags) }); setMode('view'); })}>Speichern</button>
          <button type="button" className="cp-button" onClick={() => setMode('view')}>Abbrechen</button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="lib-card"
      data-testid={`library-card-${item.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, item.id);
        e.dataTransfer.setData('text/plain', item.name);
        e.dataTransfer.effectAllowed = 'copy';
        libraryUi.setState({ dragging: item.name });
      }}
      onDragEnd={() => libraryUi.setState({ dragging: null })}
    >
      <div className="lib-thumb">
        {item.thumbnail ? <img src={item.thumbnail} alt="" draggable={false} /> : <div className="lib-thumb-empty">{item.name.slice(0, 1)}</div>}
        {item.builtin && <span className="lib-badge" data-testid="library-badge">Mitgeliefert</span>}
      </div>
      <div className="lib-name" title={item.name}>{item.name}</div>
      <div className="cp-muted lib-small">{item.count} {item.count === 1 ? 'Objekt' : 'Objekte'}</div>
      {item.tags.length > 0 && <div className="lib-tags">{item.tags.map((t) => <span key={t} className="lib-tag">{t}</span>)}</div>}
      {mode === 'delete' ? (
        <div className="lib-confirm" data-testid="library-delete-confirm">
          <span>Wirklich löschen?</span>
          <button type="button" className="cp-button cp-button-danger" data-testid="library-delete-yes" onClick={() => void run(() => api.remove(item.id))}>Ja, löschen</button>
          <button type="button" className="cp-button" onClick={() => setMode('view')}>Abbrechen</button>
        </div>
      ) : (
        <div className="lib-actions">
          <button type="button" className="cp-button cp-button-primary" data-testid="library-place" disabled={!canPlace} title={canPlace ? 'Vor dir auf den Boden setzen (oder auf die Welt ziehen)' : hint} onClick={onPlace}>Platzieren</button>
          <div className="lib-row">
            {!item.builtin && <button type="button" className="cp-button lib-mini" data-testid="library-edit" onClick={() => setMode('edit')}>Bearbeiten</button>}
            <button type="button" className="cp-button lib-mini" data-testid="library-export" onClick={() => void run(() => api.exportItems([item.id]))}>Exportieren</button>
            {!item.builtin && <button type="button" className="cp-button cp-button-danger lib-mini" data-testid="library-delete" onClick={() => setMode('delete')}>Löschen</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export function LibraryWindow({ ctx }: PanelProps) {
  const { items, error: loadError } = useLibraryItems();
  const mode = useStore(ctx.store, (s) => s.mode);
  const canBuild = useStore(ctx.store, (s) => s.canBuild);
  const hasSelection = useStore(ctx.store, (s) => s.selectedIds.length > 0);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [rect, setRect] = useState<Rect>(defaultRect);
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ kind: 'move' | 'size'; px: number; py: number; rect: Rect } | null>(null);

  const tags = useMemo(() => allTags(items), [items]);
  const shown = useMemo(() => filterItems(items, query, tag), [items, query, tag]);
  const canPlace = mode === 'build' && canBuild;
  const hint = !canBuild ? 'Hier darfst du nicht bauen.' : 'Zum Platzieren in den Baumodus wechseln (Tab).';
  const say = useCallback((text: string, error = false) => setMessage({ text, error }), []);

  useEffect(() => {
    if (!message || message.error) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const place = async (item: LibraryItemMeta) => {
    try {
      await getLibrary()!.place(item.id);
      say(`„${item.name}" platziert. Mit Strg+Z lässt sich alles auf einmal zurücknehmen.`);
    } catch (e) {
      say((e as Error).message, true);
    }
  };
  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const added = await getLibrary()!.importFile(file);
      say(`${added.length} ${added.length === 1 ? 'Baustein' : 'Bausteine'} importiert.`);
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  const onKey = (event: ReactKeyboardEvent) => {
    event.stopPropagation();
    if (event.type === 'keydown' && event.key === 'Escape' && (event.target as HTMLElement).tagName !== 'INPUT') libraryUi.setState({ open: false });
  };
  const startDrag = (kind: 'move' | 'size') => (event: ReactPointerEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input')) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { kind, px: event.clientX, py: event.clientY, rect };
  };
  const moveDrag = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.px;
    const dy = event.clientY - d.py;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (d.kind === 'move') setRect({ ...d.rect, x: Math.min(Math.max(d.rect.x + dx, 80 - d.rect.w), vw - 80), y: Math.min(Math.max(d.rect.y + dy, 0), vh - 40) });
    else setRect({ ...d.rect, w: Math.min(Math.max(MIN_W, d.rect.w + dx), vw - d.rect.x), h: Math.min(Math.max(MIN_H, d.rect.h + dy), vh - d.rect.y) });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="cp-panel lib-window" data-testid="library-window" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} onKeyDown={onKey} onKeyUp={onKey} onKeyPress={onKey}>
      <div className="lib-titlebar" onPointerDown={startDrag('move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <span className="cp-title lib-title">Bibliothek</span>
        <button type="button" className="cp-button lib-mini" data-testid="library-close" onClick={() => libraryUi.setState({ open: false })}>Schließen</button>
      </div>
      <div className="lib-toolbar">
        <button type="button" className="cp-button cp-button-primary" data-testid="library-save-open" disabled={!hasSelection || !canBuild} title={hasSelection ? 'Gewählte Objekte als Baustein speichern (Strg+Umschalt+S)' : 'Zuerst Objekte auswählen'} onClick={() => libraryUi.setState({ saveOpen: true })}>
          Auswahl speichern …
        </button>
        <button type="button" className="cp-button" data-testid="library-import" onClick={() => fileInput.current?.click()}>Importieren</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden data-testid="library-import-input" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <div className="lib-search">
        <input className="cp-input" data-testid="library-search" type="search" placeholder="Suchen (Name, Tags, Beschreibung) …" value={query} onChange={(e) => setQuery(e.target.value)} />
        {tags.length > 0 && (
          <div className="lib-chips" data-testid="library-tags">
            <button type="button" className={`lib-chip ${tag === null ? 'lib-chip-on' : ''}`} onClick={() => setTag(null)}>Alle</button>
            {tags.map((t) => <button key={t} type="button" className={`lib-chip ${tag === t ? 'lib-chip-on' : ''}`} data-testid={`library-chip-${t}`} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
          </div>
        )}
      </div>
      {(message || loadError) && <div className={`lib-message ${message?.error || loadError ? 'lib-error' : ''}`} data-testid="library-message">{message?.text ?? loadError}</div>}
      {!canPlace && <div className="cp-muted lib-small lib-note">{hint}</div>}
      <div className="lib-grid" data-testid="library-grid">
        {shown.map((item) => <Card key={item.id} item={item} canPlace={canPlace} hint={hint} onPlace={() => void place(item)} onMessage={say} />)}
        {shown.length === 0 && <div className="cp-muted lib-empty">{items.length === 0 ? 'Lade …' : 'Keine passenden Bausteine gefunden.'}</div>}
      </div>
      <div className="lib-resize" onPointerDown={startDrag('size')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
    </div>
  );
}

export function LibraryOverlay({ ctx }: PanelProps) {
  const open = useStore(libraryUi, (s) => s.open);
  const saveOpen = useStore(libraryUi, (s) => s.saveOpen);
  const dragging = useStore(libraryUi, (s) => s.dragging);
  const mode = useStore(ctx.store, (s) => s.mode);
  return (
    <>
      {open && <LibraryWindow ctx={ctx} />}
      {saveOpen && <SaveDialog ctx={ctx} />}
      {dragging && (
        <div className="lib-drag-hint" data-testid="library-drag-hint">
          {mode === 'build' ? `„${dragging}" auf die Insel ziehen und loslassen` : 'Zum Platzieren zuerst in den Baumodus wechseln (Tab)'}
        </div>
      )}
    </>
  );
}
