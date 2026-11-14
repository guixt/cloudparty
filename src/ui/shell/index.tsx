/**
 * Paket 11 – Shell: Startdialog, Menü, Inselverzeichnis, Ortslinks, Hilfe.
 */
import type { GameModule } from '../../core/context';
import type { PanelProps } from '../../core/ui';
import { HelpButton, IslandTitle, MenuButton, ShellOverlay } from './components';
import { createController, type ShellController } from './controller';
import './shell.css';

let controller: ShellController | null = null;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

const Title = (_: PanelProps) => <IslandTitle shell={controller!} />;
const Menu = (_: PanelProps) => <MenuButton shell={controller!} />;
const Help = (_: PanelProps) => <HelpButton shell={controller!} />;
const Overlay = (_: PanelProps) => <ShellOverlay shell={controller!} />;

let offKeys: (() => void) | null = null;
let offPanels: (() => void)[] = [];

const shell: GameModule = {
  id: 'shell',
  init(ctx) {
    controller?.dispose();
    const c = (controller = createController(ctx));
    offPanels = [
      ctx.ui.register({ id: 'shell.title', slot: 'top-left', component: Title, order: 0 }),
      ctx.ui.register({ id: 'shell.help', slot: 'toolbar', component: Help, order: 80 }),
      ctx.ui.register({ id: 'shell.menu', slot: 'toolbar', component: Menu, order: 90 }),
      ctx.ui.register({ id: 'shell.overlay', slot: 'overlay', component: Overlay, order: 0 }),
    ];
    const onKey = (e: KeyboardEvent) => {
      const state = c.ui.getState();
      if (e.key === 'Escape') {
        if (state.helpOpen) c.setHelp(false);
        else if (state.menuOpen) c.closeMenu();
        return;
      }
      if (isTyping(e.target) || state.welcomeOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'F1' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        c.setHelp(!state.helpOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    offKeys = () => window.removeEventListener('keydown', onKey);
    c.start();
  },
  dispose() {
    offKeys?.();
    for (const off of offPanels) off();
    offPanels = [];
    controller?.dispose();
    controller = null;
  },
};
export default shell;
