import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { IslandSummary } from '../../../shared/protocol';
import type { SkyPreset } from '../../../shared/types';
import type { StoredWorldInfo } from '../../core/context';
import { ApiError } from './api';
import { SKY_LABELS, type MenuTab, type ShellController } from './controller';

type Props = { shell: ShellController };
const useShell = <T,>(shell: ShellController, selector: (s: ReturnType<ShellController['ui']['getState']>) => T): T => useStore(shell.ui, selector);

// ---------- oben links ----------
export function IslandTitle({ shell }: Props) {
  const name = useStore(shell.ctx.store, (s) => s.world.metadata.name);
  const owner = useShell(shell, (s) => s.detail?.ownerName);
  return (
    <div className="cp-panel cp-title cps-title" data-testid="island-title">
      {name}
      {owner && <span className="cp-muted cps-owner"> · von {owner}</span>}
    </div>
  );
}

// ---------- Werkzeugleiste ----------
export function MenuButton({ shell }: Props) {
  const open = useShell(shell, (s) => s.menuOpen);
  return (
    <button className={`cp-button${open ? ' cp-button-active' : ''}`} data-testid="menu-button" onClick={() => (open ? shell.closeMenu() : shell.openMenu())}>
      Menü
    </button>
  );
}
export function HelpButton({ shell }: Props) {
  const open = useShell(shell, (s) => s.helpOpen);
  return (
    <button className={`cp-button${open ? ' cp-button-active' : ''}`} data-testid="help-button" onClick={() => shell.setHelp(!open)}>
      Hilfe
    </button>
  );
}

// ---------- Willkommen ----------
function Welcome({ shell }: Props) {
  const [value, setValue] = useState('');
  const submit = () => value.trim() && void shell.setName(value);
  return (
    <div className="cp-modal-backdrop" data-testid="welcome-dialog">
      <form
        className="cp-modal cps-welcome"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="cps-welcome-icon" aria-hidden>
          ☁
        </div>
        <h2 className="cps-h2">Willkommen bei Cloudparty!</h2>
        <p className="cps-intro">
          Erkunde schwebende Inseln, baue eigene Welten, programmiere Objekte und triff andere Leute. Zum Start brauchst du nur einen Namen.
        </p>
        <label className="cp-label" htmlFor="cps-name">
          Wie möchtest du heißen?
        </label>
        <input
          id="cps-name"
          className="cp-input"
          data-testid="welcome-name"
          autoFocus
          maxLength={32}
          placeholder="Dein Name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="cps-actions">
          <button type="submit" className="cp-button cp-button-primary" data-testid="welcome-start" disabled={!value.trim()}>
            Los geht's
          </button>
        </div>
        <p className="cp-muted cps-small">Hilfe zur Steuerung findest du jederzeit mit der Taste H.</p>
      </form>
    </div>
  );
}

// ---------- Menü ----------
const TABS: [MenuTab, string][] = [
  ['islands', 'Inseln'],
  ['new', 'Neue Insel'],
  ['this', 'Diese Insel'],
  ['profile', 'Profil'],
];

function Menu({ shell }: Props) {
  const tab = useShell(shell, (s) => s.menuTab);
  return (
    <div className="cp-modal-backdrop" data-testid="menu-dialog" onMouseDown={(e) => e.target === e.currentTarget && shell.closeMenu()}>
      <div className="cp-modal cps-menu">
        <div className="cps-menu-head">
          <h2 className="cps-h2">Menü</h2>
          <button className="cp-button" data-testid="menu-close" onClick={() => shell.closeMenu()}>
            Schließen
          </button>
        </div>
        <div className="cps-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              data-testid={`tab-${id}`}
              className={`cps-tab${tab === id ? ' cps-tab-active' : ''}`}
              onClick={() => shell.ui.setState({ menuTab: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cps-tabbody">
          {tab === 'islands' && <IslandsTab shell={shell} />}
          {tab === 'new' && <NewTab shell={shell} />}
          {tab === 'this' && <ThisTab shell={shell} />}
          {tab === 'profile' && <ProfileTab shell={shell} />}
        </div>
      </div>
    </div>
  );
}

function IslandsTab({ shell }: Props) {
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

function NewTab({ shell }: Props) {
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

function ThisTab({ shell }: Props) {
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

function ProfileTab({ shell }: Props) {
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

// ---------- Hilfe ----------
const HELP: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Bewegen',
    rows: [
      ['Bewegen', 'W A S D oder Pfeiltasten'],
      ['Rennen', 'Shift'],
      ['Springen', 'Leertaste'],
      ['Fliegen', 'F'],
      ['Kamera', 'Maus ziehen, Mausrad zum Zoomen'],
      ['Gesten', '1 – 4'],
      ['Chat', 'Enter'],
    ],
  },
  {
    title: 'Bauen',
    rows: [
      ['Baumodus', 'Tab'],
      ['Auswählen', 'Klick'],
      ['Verschieben / Drehen / Skalieren', '1 / 2 / 3'],
      ['Duplizieren', 'Strg + D'],
      ['Löschen', 'Entf'],
      ['Rückgängig', 'Strg + Z'],
      ['Skript bearbeiten', 'E'],
      ['Ansicht drehen', 'Mitteltaste ziehen (oder Rechtstaste, Alt + Linkstaste)'],
      ['Ansicht verschieben', 'Shift + Mitteltaste, oder W A S D / Q E'],
      ['Zoomen', 'Mausrad oder Strg + Mitteltaste'],
      ['Standardansichten', 'Ziffernblock 1 / 3 / 7 (Strg: Gegenseite), 4 6 8 2 drehen'],
      ['Auf Auswahl zentrieren', 'F oder Ziffernblock-Punkt'],
    ],
  },
  {
    title: 'Allgemein',
    rows: [
      ['Hilfe', 'H oder F1'],
      ['Ort teilen', 'Adresse kopieren oder Menü › Diese Insel'],
    ],
  },
];

function Help({ shell }: Props) {
  return (
    <div className="cp-modal-backdrop" data-testid="help-dialog" onMouseDown={(e) => e.target === e.currentTarget && shell.setHelp(false)}>
      <div className="cp-modal cps-help">
        <div className="cps-menu-head">
          <h2 className="cps-h2">Hilfe: Steuerung</h2>
          <button className="cp-button" data-testid="help-close" onClick={() => shell.setHelp(false)}>
            Schließen
          </button>
        </div>
        <div className="cps-help-grid">
          {HELP.map((group) => (
            <section key={group.title}>
              <h3 className="cp-heading">{group.title}</h3>
              <table className="cps-keys">
                <tbody>
                  {group.rows.map(([action, keys]) => (
                    <tr key={action}>
                      <td>{action}</td>
                      <td>
                        <kbd>{keys}</kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShellOverlay({ shell }: Props) {
  const { welcomeOpen, menuOpen, helpOpen } = useStore(shell.ui, (s) => s);
  if (welcomeOpen) return <Welcome shell={shell} />;
  if (helpOpen) return <Help shell={shell} />;
  if (menuOpen) return <Menu shell={shell} />;
  return null;
}
