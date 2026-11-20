import { useStore } from 'zustand';
import type { Props } from '../types';

export function WorldGrass({ shell }: Props) {
  const store = shell.ctx.store;
  const grass = useStore(store, (s) => s.world.environment.grass !== false);
  const canBuild = useStore(store, (s) => s.canBuild);
  return (
    <label className="cp-row" title={canBuild ? 'Gras auf dieser Insel ein- oder ausblenden (gilt für alle Besucher)' : 'Nur mit Baurecht änderbar'}>
      <input type="checkbox" data-testid="world-grass" checked={grass} disabled={!canBuild} onChange={(e) => store.getState().setEnvironment({ ...store.getState().world.environment, grass: e.target.checked }, { source: 'local' })} />
      <span>Gras auf dieser Insel anzeigen</span>
    </label>
  );
}
