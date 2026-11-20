import type { MenuTab } from './controller';
import { useShell, type Props } from './types';
import { IslandsTab } from './tabs/IslandsTab';
import { NewTab } from './tabs/NewTab';
import { ThisTab } from './tabs/ThisTab';
import { ProfileTab } from './tabs/ProfileTab';

const TABS: [MenuTab, string][] = [
  ['islands', 'Inseln'],
  ['new', 'Neue Insel'],
  ['this', 'Diese Insel'],
  ['profile', 'Profil'],
];

export function Menu({ shell }: Props) {
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
