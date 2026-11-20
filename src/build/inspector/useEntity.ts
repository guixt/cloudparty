import { useStore } from 'zustand';
import type { EntitySpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';

export function useEntity(ctx: GameContext, id: string) {
  const entity = useStore(ctx.store, (s) => s.entities[id]);
  const patch = (p: Partial<EntitySpec>) => ctx.store.getState().updateEntity(id, p, { source: 'local' });
  return { entity, patch };
}
