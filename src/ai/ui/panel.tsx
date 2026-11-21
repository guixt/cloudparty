import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useStore } from 'zustand';
import { bringToFront, useWindowZ } from '../../core/windowStack';
import type { AssistantApi } from '../api';
import { MAX_USER_IMAGES, imageFilesOf, isImageFile, prepareChatImage } from './images';
import { Markdown } from './markdown';
import { SUGGESTIONS, usageLine, type AiController, type AiStore, type Message } from './state';

function MessageView({ m, ctl }: { m: Message; ctl: AiController }) {
  switch (m.kind) {
    case 'user':
      return (
        <div className="ai-msg ai-user" data-testid="ai-msg-user">
          {m.images && m.images.length > 0 && (
            <div className="ai-user-images">
              {m.images.map((src, i) => (
                <img key={i} src={src} alt={`Angehängtes Bild ${i + 1}`} className="ai-user-image" />
              ))}
            </div>
          )}
          {m.text}
        </div>
      );
    case 'assistant':
      return <div className="ai-msg ai-assistant" data-testid="ai-msg-assistant">
          <Markdown text={m.text} />
        </div>;
    case 'tool':
      return (
        <div className={`ai-tool ${m.ok ? 'ai-tool-ok' : 'ai-tool-fail'}`} data-testid="ai-tool">
          <span aria-hidden>{m.ok ? '✓' : '✗'}</span> {m.summary}
        </div>
      );
    case 'error':
      return <div className="ai-error-line" data-testid="ai-error">{m.message}</div>;
    case 'confirm':
      return (
        <div className="ai-confirm" data-testid="ai-confirm">
          <div className="ai-confirm-q">{m.question}</div>
          {m.detail && <pre className="ai-confirm-detail">{m.detail}</pre>}
          {m.status === 'pending' ? (
            <div className="cp-row">
              <button type="button" className="cp-button cp-button-primary" data-testid="ai-confirm-yes" onClick={() => ctl.answer(m.id, true)}>
                Ausführen
              </button>
              <button type="button" className="cp-button" data-testid="ai-confirm-no" onClick={() => ctl.answer(m.id, false)}>
                Abbrechen
              </button>
            </div>
          ) : (
            <div className="cp-muted">{m.status === 'yes' ? 'Ausgeführt' : 'Abgebrochen'}</div>
          )}
        </div>
      );
  }
}

export interface PanelProps {
  api: AssistantApi | null;
  store: AiStore;
  controller: AiController;
  canBuild: boolean;
  onOpenSettings: () => void;
}

/** Inhalt des Fensters: Verlauf, Vorschläge, Eingabe. */
export function AssistantPanel({ api, store, controller, canBuild, onOpenSettings }: PanelProps) {
  const view = useStore(store, (s) => s);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachError, setAttachError] = useState('');
  const [busyImages, setBusyImages] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.messages, view.usage]);

  const addFiles = async (files: File[]) => {
    const usable = files.filter(isImageFile);
    if (usable.length === 0) {
      if (files.length > 0) setAttachError('Das ist keine unterstützte Bilddatei (PNG, JPEG, WebP, GIF).');
      return;
    }
    setAttachError('');
    setBusyImages((n) => n + usable.length);
    const results: string[] = [];
    for (const file of usable) {
      try {
        results.push(await prepareChatImage(file));
      } catch (e) {
        setAttachError(e instanceof Error ? e.message : 'Das Bild konnte nicht gelesen werden.');
      } finally {
        setBusyImages((n) => n - 1);
      }
    }
    setAttachments((list) => {
      const next = [...list, ...results].slice(0, MAX_USER_IMAGES);
      if (list.length + results.length > MAX_USER_IMAGES) setAttachError(`Höchstens ${MAX_USER_IMAGES} Bilder pro Nachricht.`);
      return next;
    });
  };

  const submit = (prompt: string, mode?: 'plan') => {
    if (!prompt.trim() && attachments.length === 0) return;
    const images = attachments;
    setText('');
    setAttachments([]);
    setAttachError('');
    void controller.send(prompt, images, mode ? { mode } : undefined);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(text);
    } else if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  };

  if (!api) {
    return (
      <div className="ai-body">
        <div className="ai-unavailable" data-testid="ai-unavailable">
          Die KI ist in diesem Build noch nicht verfügbar.
        </div>
      </div>
    );
  }
  const empty = view.messages.length === 0;
  return (
    <div className="ai-body">
      {!canBuild && (
        <div className="ai-hint" data-testid="ai-no-build">
          Du hast hier kein Baurecht – ich kann nur Fragen beantworten und nichts verändern.
        </div>
      )}
      <div className="ai-list" ref={listRef} data-testid="ai-list" aria-live="polite">
        {empty && (
          <div className="ai-empty">
            <p className="cp-muted">Sag mir, was ich bauen oder ändern soll – oder stell eine Frage zu dieser Insel.</p>
            <div className="ai-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="ai-chip" data-testid="ai-suggestion" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {view.messages.map((m) => (
          <MessageView key={m.id} m={m} ctl={controller} />
        ))}
        {view.running && !view.messages.some((m) => m.kind === 'confirm' && m.status === 'pending') && (
          <div className="ai-working cp-muted">Arbeite …</div>
        )}
        {view.usage && !view.running && (
          <div className="ai-usage cp-muted" data-testid="ai-usage">
            {usageLine(view.usage)}
          </div>
        )}
      </div>
      <div className="ai-actions">
        {view.changed && !view.running && (
          <button type="button" className="cp-button" data-testid="ai-undo" onClick={() => controller.undo()}>
            Rückgängig
          </button>
        )}
        <button type="button" className="cp-button" data-testid="ai-reset" disabled={empty && !view.running} onClick={() => controller.reset()}>
          Neues Gespräch
        </button>
        {!api.getSettings().hasKey && (
          <button type="button" className="cp-button" data-testid="ai-open-settings" onClick={onOpenSettings}>
            Key eintragen
          </button>
        )}
      </div>
      {view.queue.length > 0 && (
        <div className="ai-queue" data-testid="ai-queue">
          <div className="ai-queue-head">
            <span className="cp-heading">Warteschlange ({view.queue.length})</span>
            <button type="button" className="cp-button ai-icon-btn" data-testid="ai-queue-clear" onClick={() => controller.clearQueue()}>
              Leeren
            </button>
          </div>
          {view.paused && !view.running && (
            <div className="ai-queue-paused" data-testid="ai-queue-paused">
              Angehalten.{' '}
              <button type="button" className="cp-button cp-button-primary ai-icon-btn" data-testid="ai-queue-resume" onClick={() => void controller.resume()}>
                Fortsetzen
              </button>
            </div>
          )}
          <ol className="ai-queue-list">
            {view.queue.map((q) => (
              <li key={q.id} className="ai-queue-item" data-testid="ai-queue-item">
                <span className="ai-queue-text" title={q.label ?? q.text}>
                  {q.label ?? q.text}
                </span>
                <button type="button" className="cp-button ai-icon-btn" aria-label="Aus der Warteschlange entfernen" data-testid="ai-queue-remove" onClick={() => controller.removeQueued(q.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {(attachments.length > 0 || busyImages > 0 || attachError) && (
        <div className="ai-attachments" data-testid="ai-attachments">
          {attachments.map((src, i) => (
            <span key={i} className="ai-attachment">
              <img src={src} alt={`Anhang ${i + 1}`} />
              <button type="button" className="ai-attachment-remove" aria-label="Bild entfernen" data-testid="ai-attachment-remove" onClick={() => setAttachments((l) => l.filter((_, j) => j !== i))}>
                ✕
              </button>
            </span>
          ))}
          {busyImages > 0 && <span className="cp-muted ai-attachment-busy">Bild wird vorbereitet …</span>}
          {attachError && <span className="ai-error-text" data-testid="ai-attach-error">{attachError}</span>}
        </div>
      )}
      <div
        className={`ai-input-row${dragOver ? ' ai-drop' : ''}`}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          const files = imageFilesOf(e.dataTransfer);
          if (files.length > 0) {
            e.preventDefault();
            void addFiles(files);
          }
        }}
      >
        <textarea
          ref={inputRef}
          className="cp-textarea ai-input"
          data-testid="ai-input"
          rows={2}
          value={text}
          placeholder={view.running ? 'Nächste Nachricht (kommt in die Warteschlange)' : 'Was soll ich tun? (Enter sendet)'}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = imageFilesOf(e.clipboardData);
            if (files.length > 0) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => e.stopPropagation()}
        />
        <div className="ai-input-buttons">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            data-testid="ai-file"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void addFiles(files);
            }}
          />
          <button type="button" className="cp-button" data-testid="ai-attach" title="Bild anhängen (auch per Einfügen oder Ablegen). Das Bild geht an Anthropic." aria-label="Bild anhängen" disabled={attachments.length >= MAX_USER_IMAGES} onClick={() => fileRef.current?.click()}>
            📎
          </button>
          <button type="button" className="cp-button" data-testid="ai-plan-send" title="Plant nur (Planungsmodell, ausführliche Bauanleitungen je Knoten) und baut nichts. Ausgeführt wird danach im Plan-Fenster mit dem Ausführungsmodell." disabled={(!text.trim() && attachments.length === 0) || busyImages > 0} onClick={() => submit(text, 'plan')}>
            Planen
          </button>
          <button type="button" className="cp-button cp-button-primary" data-testid="ai-send" disabled={(!text.trim() && attachments.length === 0) || busyImages > 0} onClick={() => submit(text)}>
            {view.running || view.queue.length > 0 ? 'Einreihen' : 'Senden'}
          </button>
          {view.running && (
            <button type="button" className="cp-button cp-button-danger" data-testid="ai-stop" onClick={() => controller.stop()}>
              Stopp
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface Pos {
  x: number;
  y: number;
}

/** Schwebendes Fenster mit Titelleiste (verschiebbar). */
export function AssistantWindow({
  title,
  onClose,
  onSettings,
  badge,
  children,
}: {
  title: string;
  onClose: () => void;
  onSettings: () => void;
  /** Kleines Abzeichen neben dem Titel (z. B. Auto bei Freigabe-Modus alles erlauben). */
  badge?: string;
  children: React.ReactNode;
}) {
  const z = useWindowZ('ai');
  const [pos, setPos] = useState<Pos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = rootRef.current;
    if (!d || !el) return;
    const x = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - 80);
    const y = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - 40);
    setPos({ x, y });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div
      ref={rootRef}
      className={`cp-panel ai-window ${pos ? 'ai-moved' : 'ai-docked'}`}
      data-testid="ai-window"
      style={{ ...(pos ? { left: pos.x, top: pos.y } : {}), zIndex: z }}
      onPointerDownCapture={() => bringToFront('ai')}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div className="ai-titlebar" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <span className="ai-title">{title}</span>
        {badge && (
          <span className="ai-badge" data-testid="ai-badge" title="Freigabe-Modus: alles erlauben – die KI fragt nicht nach">
            {badge}
          </span>
        )}
        <button type="button" className="cp-button ai-icon-btn" data-testid="ai-gear" title="Einstellungen" aria-label="Einstellungen" onClick={onSettings}>
          ⚙
        </button>
        <button type="button" className="cp-button ai-icon-btn" data-testid="ai-close" title="Schließen (K)" aria-label="Schließen" onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}
