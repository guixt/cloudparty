/**
 * STUB des Fundaments – Paket 11 (Konten, Inseln & Menü) ersetzt diese Datei.
 * Liefert vorerst: Inselname oben links und einen Knopf Spielen/Bauen.
 */
import { useStore } from 'zustand';
import type { GameModule } from '../../core/context';
import type { PanelProps } from '../../core/ui';

function Title({ ctx }: PanelProps) {
  const name = useStore(ctx.store, (s) => s.world.metadata.name);
  return <div className="cp-panel cp-title">{name}</div>;
}

function ModeButton({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  return (
    <button className="cp-button" data-testid="mode-toggle" onClick={() => ctx.store.getState().setMode(mode === 'play' ? 'build' : 'play')}>
      {mode === 'play' ? 'Bauen' : 'Spielen'}
    </button>
  );
}

const shell: GameModule = {
  id: 'shell',
  init(ctx) {
    ctx.ui.register({ id: 'shell.title', slot: 'top-left', component: Title, order: 0 });
    ctx.ui.register({ id: 'shell.mode', slot: 'toolbar', component: ModeButton, order: 0 });
  },
};
export default shell;
