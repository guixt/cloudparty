import { useEffect, useState } from 'react';
import type { IslandSummary } from '../../../../shared/protocol';
import type { StoredWorldInfo } from '../../../core/context';
import { ApiError } from '../api';
import { useShell, type Props } from '../types';

export function IslandsTab({ shell }: Props) {
  const serverConfigured = !!shell.api;
  const serverOnline = useShell(shell, (s) => s.serverOnline);
  const localRevision = useShell(shell, (s) => s.localRevision);
  const current = useShell(shell, (s) => s.islandId);
  const [remote, setRemote] = useState<IslandSummary[] | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [local, setLocal] = useState<StoredWorldInfo[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (shell.api && serverOnline) {
      shell.api
        .listIslands()
        .then((list) => alive && (setRemote(list), setRemoteError(null)))
        .catch((e) => alive && setRemoteError(e instanceof ApiError ? e.message : 'Die Liste konnte nicht geladen werden.'));
    }
    return () => {
      alive = false;
    };
  }, [shell, serverOnline]);
  useEffect(() => {
    let alive = true;
    shell.ctx.persistence
      .list()
      .then((list) => alive && setLocal([...list].sort((a, b) => b.updatedAt - a.updatedAt)))
      .catch(() => alive && setLocal([]));
    return () => {
      alive = false;
    };
  }, [shell, localRevision]);

  return (
    <>
      <h3 className="cp-heading">Inseln auf dem Server</h3>
      {!serverConfigured && <p className="cp-muted">Du spielst offline. Server-Inseln sind nicht verfügbar.</p>}
      {serverConfigured && !serverOnline && <p className="cp-muted">Der Server ist gerade nicht erreichbar.</p>}
      {remoteError && <p className="cps-error">{remoteError}</p>}
      {serverOnline && remote && remote.length === 0 && <p className="cp-muted">Noch keine Inseln.</p>}
      <ul className="cps-list" data-testid="server-islands">
        {remote?.map((island) => (
          <li key={island.id} className="cps-item">
            <div className="cps-item-main">
              <strong>{island.name}</strong>
              <span className="cp-muted cps-small">
                von {island.ownerName} · {island.online} online
              </span>
            </div>
            <button className="cp-button cp-button-primary" data-testid={`visit-${island.id}`} onClick={() => void shell.visit(island.id)}>
              {island.id === current ? 'Hier' : 'Besuchen'}
            </button>
          </li>
        ))}
      </ul>
      <h3 className="cp-heading cps-gap">Lokal gespeichert</h3>
      {local.length === 0 && <p className="cp-muted">Keine lokalen Inseln gespeichert.</p>}
      <ul className="cps-list" data-testid="local-islands">
        {local.map((island) => (
          <li key={island.id} className="cps-item">
            <div className="cps-item-main">
              <strong>{island.name}</strong>
              <span className="cp-muted cps-small">{new Date(island.updatedAt).toLocaleString('de-DE')}</span>
            </div>
            <div className="cp-row">
              <button className="cp-button cp-button-primary" data-testid={`open-${island.id}`} onClick={() => void shell.visit(island.id)}>
                Öffnen
              </button>
              {confirm === island.id ? (
                <button
                  className="cp-button cp-button-danger"
                  data-testid={`delete-confirm-${island.id}`}
                  onClick={() => {
                    setConfirm(null);
                    void shell.deleteLocal(island.id);
                  }}
                >
                  Wirklich löschen?
                </button>
              ) : (
                <button className="cp-button cp-button-danger" data-testid={`delete-${island.id}`} onClick={() => setConfirm(island.id)}>
                  Löschen
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
