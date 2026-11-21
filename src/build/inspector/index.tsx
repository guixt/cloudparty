import { useStore } from 'zustand';
import type { PanelProps } from '../../core/ui';
import { EntityInspector } from './EntityInspector';
import { MultiInspector } from './MultiInspector';
import { WorldSettings } from './WorldSettings';

export function Inspector({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const selection = useStore(ctx.store, (s) => s.selection);
  const count = useStore(ctx.store, (s) => s.selectedIds.length);
  if (mode !== 'build') return null;
  return (
    <div className="cp-panel cpb-panel cpb-inspector cp-panel-scroll" data-testid="inspector">
      {count > 1 ? <MultiInspector ctx={ctx} /> : selection ? <EntityInspector ctx={ctx} id={selection} key={selection} /> : <WorldSettings ctx={ctx} />}
    </div>
  );
}
