import { useStore } from 'zustand';
import type { PanelProps } from '../core/ui';
import { groupSelected, ungroupSelected } from './placement';
import { runtime } from './runtime';
import { buildState, type Tool } from './state';

const TOOLS: { tool: Tool; label: string; hint: string }[] = [
  { tool: 'move', label: 'Verschieben', hint: 'Verschieben (1 / G)' },
  { tool: 'rotate', label: 'Drehen', hint: 'Drehen (2 / R)' },
  { tool: 'scale', label: 'Skalieren', hint: 'Skalieren (3)' },
];

export function BuildToolbar({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const tool = useStore(buildState, (s) => s.tool);
  const snap = useStore(buildState, (s) => s.snap);
  const count = useStore(ctx.store, (s) => s.selectedIds.length);
  const anyGrouped = useStore(ctx.store, (s) => s.selectedIds.some((id) => !!s.entities[id]?.group));
  const history = runtime.history;
  const canUndo = useStore(history!.state, (s) => s.canUndo);
  const canRedo = useStore(history!.state, (s) => s.canRedo);
  const build = mode === 'build';
  return (
    <>
      <button
        className={`cp-button ${build ? 'cp-button-active' : ''}`}
        data-testid="build-toggle"
        title="Zwischen Spielen und Bauen wechseln (Tab)"
        onClick={() => ctx.store.getState().setMode(build ? 'play' : 'build')}
      >
        {build ? 'Spielen' : 'Bauen'}
      </button>
      {build && (
        <>
          <span className="cpb-sep" />
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              className={`cp-button ${tool === t.tool ? 'cp-button-active' : ''}`}
              data-testid={`tool-${t.tool}`}
              title={t.hint}
              onClick={() => buildState.setState({ tool: t.tool })}
            >
              {t.label}
            </button>
          ))}
          <button
            className={`cp-button ${snap ? 'cp-button-active' : ''}`}
            data-testid="snap-toggle"
            title="Raster-Einrasten: 0,25 m, 15°, 0,25×"
            onClick={() => buildState.setState({ snap: !snap })}
          >
            Raster
          </button>
          <span className="cpb-sep" />
          <button className="cp-button" data-testid="tb-group" title="Gruppieren (Strg+G)" disabled={count < 2} onClick={() => groupSelected(ctx)}>
            Gruppieren
          </button>
          <button className="cp-button" data-testid="tb-ungroup" title="Auflösen (Strg+Umschalt+G)" disabled={!anyGrouped} onClick={() => ungroupSelected(ctx)}>
            Auflösen
          </button>
          <span className="cpb-sep" />
          <button className="cp-button" data-testid="undo" title="Rückgängig (Strg+Z)" disabled={!canUndo} onClick={() => history!.undo()}>
            Rückgängig
          </button>
          <button className="cp-button" data-testid="redo" title="Wiederholen (Strg+Y)" disabled={!canRedo} onClick={() => history!.redo()}>
            Wiederholen
          </button>
        </>
      )}
    </>
  );
}
