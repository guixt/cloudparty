import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { Props } from '../types';
import { ExportBlender } from './ExportBlender';
import { WorldGrass } from './WorldGrass';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function ThisTab({ shell }: Props) {
  const name = useStore(shell.ctx.store, (s) => s.world.metadata.name);
  const { islandId, detail, userId, serverOnline } = useStore(shell.ui, (s) => s);
  const [link, setLink] = useState(() => shell.currentLink());
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newBuilder, setNewBuilder] = useState('');

  useEffect(() => {
    void shell.refreshDetail();
  }, [shell, islandId]);
  useEffect(() => {
    const timer = window.setInterval(() => setLink(shell.currentLink()), 1000);
    return () => window.clearInterval(timer);
  }, [shell]);

  const isOwner = !!detail && !!userId && detail.owner === userId;
  const allBuild = !!detail?.builders.includes('*');
  const people = detail?.builders.filter((b) => b !== '*') ?? [];
  const ownerLabel = detail ? detail.ownerName : 'Lokal (nur in diesem Browser)';

  const copy = async () => {
    const ok = await copyText(shell.currentLink());
    setCopied(ok);
    shell.ctx.bus.emit('ui.toast', ok ? { text: 'Link kopiert.' } : { text: 'Kopieren nicht möglich.', kind: 'error' });
    window.setTimeout(() => setCopied(false), 2000);
  };
  const addBuilder = () => {
    const id = newBuilder.trim();
    if (!id || !detail || people.includes(id)) return;
    setNewBuilder('');
    void shell.updateBuilders([...detail.builders, id]);
  };

  return (
    <>
      <dl className="cps-facts">
        <dt>Name</dt>
        <dd data-testid="this-name">{name}</dd>
        <dt>Besitzer</dt>
        <dd data-testid="this-owner">{ownerLabel}</dd>
        <dt>Adresse</dt>
        <dd className="cps-id">{islandId}</dd>
      </dl>
      <WorldGrass shell={shell} />
      <ExportBlender shell={shell} />
      <label className="cp-label" htmlFor="cps-link">
        Link zu diesem Ort
      </label>
      <div className="cp-row">
        <input id="cps-link" className="cp-input" data-testid="this-link" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="cp-button cp-button-primary" data-testid="copy-link" onClick={() => void copy()}>
          {copied ? 'Kopiert!' : 'Link kopieren'}
        </button>
      </div>

      {isOwner && detail && (
        <>
          <h3 className="cp-heading cps-gap">Baurechte</h3>
          <label className="cps-check">
            <input
              type="checkbox"
              data-testid="all-build"
              checked={allBuild}
              onChange={(e) => void shell.updateBuilders(e.target.checked ? [...detail.builders, '*'] : detail.builders.filter((b) => b !== '*'))}
            />
            Alle dürfen bauen
          </label>
          <ul className="cps-list">
            {people.map((id) => (
              <li key={id} className="cps-item">
                <span className="cps-id">{id}</span>
                <button className="cp-button" onClick={() => void shell.updateBuilders(detail.builders.filter((b) => b !== id))}>
                  Entfernen
                </button>
              </li>
            ))}
            {people.length === 0 && <li className="cp-muted">Keine einzelnen Mitbauenden.</li>}
          </ul>
          <div className="cp-row">
            <input
              className="cp-input"
              data-testid="builder-input"
              placeholder="Benutzer-ID hinzufügen"
              value={newBuilder}
              onChange={(e) => setNewBuilder(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addBuilder()}
            />
            <button className="cp-button" data-testid="builder-add" onClick={addBuilder} disabled={!newBuilder.trim()}>
              Hinzufügen
            </button>
          </div>
          <p className="cp-muted cps-small">Deine eigene Benutzer-ID zum Weitergeben: {userId}</p>
        </>
      )}

      {!detail && serverOnline && (
        <div className="cps-gap">
          <button className="cp-button cp-button-primary" data-testid="publish" onClick={() => void shell.publishCurrent()}>
            Insel auf Server veröffentlichen
          </button>
        </div>
      )}

      {(isOwner || !detail) && (
        <div className="cps-gap">
          {confirmDelete ? (
            <div className="cp-row">
              <span>Wirklich löschen? Das kann nicht rückgängig gemacht werden.</span>
              <button className="cp-button cp-button-danger" data-testid="delete-island-confirm" onClick={() => void shell.deleteCurrent()}>
                Ja, löschen
              </button>
              <button className="cp-button" onClick={() => setConfirmDelete(false)}>
                Abbrechen
              </button>
            </div>
          ) : (
            <button className="cp-button cp-button-danger" data-testid="delete-island" onClick={() => setConfirmDelete(true)}>
              Insel löschen
            </button>
          )}
        </div>
      )}
    </>
  );
}
