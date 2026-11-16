/** Panel „Medien" (Slot right, nur Bau-Modus): Inhalt der gewählten Medien-Fläche bearbeiten. */
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { EntitySpec, MediaKind, MediaSpec } from '../../../shared/types';
import type { PanelProps } from '../../core/ui';
import { EMBED_HINT } from './overlay';
import { KIND_LABELS, aspectForImage, mediaKindOfRef, shortUrl, wrapSlide } from './helpers';
import { fileToDataUrl } from './upload';

const KINDS: MediaKind[] = ['image', 'slides', 'web', 'video', 'text'];

/** Misst die Pixelgröße eines Bildes (auch ohne CORS möglich, da nur geladen und nicht gelesen wird). */
function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Das Bild konnte nicht geladen werden.'));
    img.src = url;
  });
}

function UrlField({ value, placeholder, onCommit, testId }: { value: string; placeholder: string; onCommit: (v: string) => void; testId: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft.trim());
  };
  return (
    <input
      className="cp-input"
      data-testid={testId}
      value={draft.startsWith('data:') ? `${shortUrl(draft)}` : draft}
      readOnly={draft.startsWith('data:')}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

function MediaEditor({ ctx, entity }: { ctx: PanelProps['ctx']; entity: EntitySpec }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const [slideDraft, setSlideDraft] = useState('');
  const refKind = mediaKindOfRef(entity.ref);
  const media: MediaSpec = entity.media ?? { kind: refKind ?? 'image' };
  const kind = media.kind;
  const update = (patch: Partial<MediaSpec>) => ctx.store.getState().updateEntity(entity.id, { media: { ...media, ...patch } });
  const setState = (patch: Record<string, unknown>) => ctx.store.getState().updateEntity(entity.id, { state: { ...(entity.state ?? {}), ...patch } });
  const fail = (e: unknown) => ctx.bus.emit('ui.toast', { text: e instanceof Error ? e.message : 'Upload fehlgeschlagen', kind: 'error' });
  const urls = media.urls ?? [];

  /** Stellt die Tafel auf das Seitenverhältnis des Bildes (ohne schwarze Balken); null entfernt die Vorgabe (16:9). */
  const fitBoard = async (url: string | undefined) => {
    try {
      if (!url) return;
      const { w, h } = await imageSize(url);
      const aspect = aspectForImage(w, h);
      if (aspect !== null) setState({ aspect });
    } catch (e) {
      fail(e);
    }
  };
  const resetFormat = () => {
    const { aspect: _a, ...rest } = (entity.state ?? {}) as Record<string, unknown>;
    void _a;
    ctx.store.getState().updateEntity(entity.id, { state: rest });
  };

  const upload = async (files: FileList | null, many: boolean) => {
    if (!files || files.length === 0) return;
    try {
      const list = Array.from(files);
      const results: string[] = [];
      for (const file of list) results.push(await fileToDataUrl(file));
      if (many) update({ urls: [...urls, ...results] });
      else {
        update({ url: results[0] });
        void fitBoard(results[0]); // Tafel gleich ans neue Bild anpassen
      }
    } catch (e) {
      fail(e);
    }
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= urls.length) return;
    const next = [...urls];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update({ urls: next });
  };

  return (
    <div className="cp-panel cp-panel-scroll cp-media-panel" data-testid="media-panel">
      <h3 className="cp-heading">Medien</h3>
      <label className="cp-label">Art</label>
      <select className="cp-select" data-testid="media-kind" value={kind} onChange={(e) => update({ kind: e.target.value as MediaKind })}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>

      {kind === 'image' && (
        <>
          <label className="cp-label">Bild-Adresse</label>
          <UrlField testId="media-url" value={media.url ?? ''} placeholder="https://… oder Bild hochladen" onCommit={(v) => update({ url: v })} />
          <div className="cp-row cp-media-row">
            <button className="cp-button" data-testid="media-upload" onClick={() => fileRef.current?.click()}>
              Bild hochladen
            </button>
            {media.url && (
              <button className="cp-button cp-button-danger" onClick={() => update({ url: '' })}>
                Entfernen
              </button>
            )}
          </div>
          {media.url && (
            <div className="cp-row cp-media-row">
              <button className="cp-button" data-testid="media-fit" title="Die Tafel bekommt das Seitenverhältnis des Bildes" onClick={() => void fitBoard(media.url)}>
                Tafel ans Bild anpassen
              </button>
              {entity.state?.aspect !== undefined && (
                <button className="cp-button" data-testid="media-fit-reset" title="Zurück zum Standardformat (16:9)" onClick={resetFormat}>
                  Standardformat
                </button>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden data-testid="media-file" onChange={(e) => void upload(e.target.files, false).then(() => (e.target.value = ''))} />
        </>
      )}

      {kind === 'slides' && (
        <>
          <label className="cp-label">Folien ({urls.length})</label>
          <ol className="cp-media-slides" data-testid="media-slides">
            {urls.map((u, i) => (
              <li key={`${i}-${u.slice(-24)}`} className={i === (media.slide ?? 0) ? 'cp-media-current' : ''}>
                <span className="cp-media-slide-label" title={u.startsWith('data:') ? 'Hochgeladenes Bild' : u}>
                  {i + 1}. {shortUrl(u, 22)}
                </span>
                <button className="cp-button cp-media-mini" title="Nach oben" onClick={() => move(i, i - 1)}>
                  ↑
                </button>
                <button className="cp-button cp-media-mini" title="Nach unten" onClick={() => move(i, i + 1)}>
                  ↓
                </button>
                <button
                  className="cp-button cp-button-danger cp-media-mini"
                  title="Entfernen"
                  onClick={() => {
                    const next = urls.filter((_, j) => j !== i);
                    update({ urls: next, slide: next.length ? wrapSlide(media.slide ?? 0, 0, next.length) : 0 });
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          {urls.length > 0 && (
            <div className="cp-row cp-media-row">
              <button className="cp-button" data-testid="media-fit" title="Die Tafel bekommt das Seitenverhältnis der ersten Folie" onClick={() => void fitBoard(urls[0])}>
                Tafel an erste Folie anpassen
              </button>
              {entity.state?.aspect !== undefined && (
                <button className="cp-button" data-testid="media-fit-reset" title="Zurück zum Standardformat (16:9)" onClick={resetFormat}>
                  Standardformat
                </button>
              )}
            </div>
          )}
          <div className="cp-row cp-media-row">
            <input
              className="cp-input"
              data-testid="media-slide-url"
              placeholder="Bild-Adresse hinzufügen"
              value={slideDraft}
              onChange={(e) => setSlideDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && slideDraft.trim()) {
                  update({ urls: [...urls, slideDraft.trim()] });
                  setSlideDraft('');
                }
              }}
            />
            <button
              className="cp-button"
              data-testid="media-slide-add"
              disabled={!slideDraft.trim()}
              onClick={() => {
                update({ urls: [...urls, slideDraft.trim()] });
                setSlideDraft('');
              }}
            >
              +
            </button>
          </div>
          <div className="cp-row cp-media-row">
            <button className="cp-button" data-testid="media-upload-many" onClick={() => multiRef.current?.click()}>
              Bilder hochladen
            </button>
          </div>
          <input ref={multiRef} type="file" accept="image/*" multiple hidden data-testid="media-files" onChange={(e) => void upload(e.target.files, true).then(() => (e.target.value = ''))} />
        </>
      )}

      {kind === 'web' && (
        <>
          <label className="cp-label">Webseiten-Adresse</label>
          <UrlField testId="media-url" value={media.url ?? ''} placeholder="https://…" onCommit={(v) => update({ url: v })} />
          <p className="cp-muted cp-media-hint" title={EMBED_HINT}>
            {EMBED_HINT}. Dann hilft der Link „In neuem Tab öffnen" an der Tafel. Nur http- und https-Adressen.
          </p>
        </>
      )}

      {kind === 'video' && (
        <>
          <label className="cp-label">Video-Adresse (mp4/webm, YouTube, Vimeo)</label>
          <UrlField testId="media-url" value={media.url ?? ''} placeholder="https://…/video.mp4" onCommit={(v) => update({ url: v })} />
          <label className="cp-media-check">
            <input type="checkbox" checked={entity.state?.muted === false} onChange={(e) => setState({ muted: e.target.checked ? false : true })} /> Ton nach dem ersten Klick einschalten
          </label>
          <p className="cp-muted cp-media-hint">Das Video startet stumm; Klick auf die Tafel startet/pausiert.</p>
        </>
      )}

      {kind === 'text' && (
        <>
          <label className="cp-label">Text</label>
          <textarea className="cp-textarea" data-testid="media-text" rows={5} value={media.text ?? ''} placeholder="Text für das Schild …" onChange={(e) => update({ text: e.target.value })} />
          <p className="cp-muted cp-media-hint">Hintergrundfarbe: Farbe des Objekts im Inspector.</p>
        </>
      )}

      {refKind && (
        <label className="cp-media-check">
          <input type="checkbox" checked={entity.state?.stand !== false} onChange={(e) => setState({ stand: e.target.checked })} /> Standfüße
        </label>
      )}
    </div>
  );
}

export function MediaPanel({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const entity = useStore(ctx.store, (s) => (s.selection ? s.entities[s.selection] : undefined));
  if (mode !== 'build' || !entity) return null;
  if (!mediaKindOfRef(entity.ref) && !entity.media) return null;
  return <MediaEditor key={entity.id} ctx={ctx} entity={entity} />;
}
