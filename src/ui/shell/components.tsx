import { useStore } from 'zustand';
import { Help } from './Help';
import { Menu } from './Menu';
import { Welcome } from './Welcome';
import { useShell, type Props } from './types';

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

export function ShellOverlay({ shell }: Props) {
  const { welcomeOpen, menuOpen, helpOpen } = useStore(shell.ui, (s) => s);
  if (welcomeOpen) return <Welcome shell={shell} />;
  if (helpOpen) return <Help shell={shell} />;
  if (menuOpen) return <Menu shell={shell} />;
  return null;
}
