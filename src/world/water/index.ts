/**
 * Paket 23: Wasser. Registriert die Bausteine `EntitySpec.water` (Teich/See) und `EntitySpec.waterfall`
 * (Wasserfall) über `registerPrefab` und sorgt für Platscher-Effekte. Das Meer unter der Insel liegt in
 * `src/engine/environment/features/sea.ts` und nutzt denselben Kern (`core.ts`).
 */
import type { GameModule } from '../../core/context';
import { registerPrefab, type PrefabDef } from '../entities/prefabs';
import { buildFall, updateFall } from './fall';
import { buildPond, updatePond } from './pond';
import { createSplasher } from './splash';

export const WATER_REF = 'EntitySpec.water';
export const FALL_REF = 'EntitySpec.waterfall';

export const WATER_PREFAB: PrefabDef = {
  ref: WATER_REF,
  label: 'Wasser',
  category: 'Natur',
  icon: '💧',
  groundOffset: 0,
  // Farbe, Wellen, Tiefe und Strömung wirken live (kein Neuaufbau); nur die Form baut neu
  stateKeys: ['shape'],
  defaults: {
    name: 'Wasser',
    material: { color: '#2c9fd9' },
    state: { shape: 'round', waves: 0.4, depth: 0.5, flow: 0.3 },
    physics: { mode: 'trigger' },
    transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [8, 1, 8] },
  },
  build: (c, entity, root) => buildPond(c, entity, root),
};

export const FALL_PREFAB: PrefabDef = {
  ref: FALL_REF,
  label: 'Wasserfall',
  category: 'Natur',
  icon: '🌊',
  groundOffset: 0,
  stateKeys: ['width', 'height'],
  defaults: {
    name: 'Wasserfall',
    material: { color: '#a8def5' },
    state: { width: 2, height: 12 },
    physics: { mode: 'none' },
  },
  build: (c, entity, root) => buildFall(c, entity, root),
};

let cleanup: (() => void) | null = null;

const mod: GameModule = {
  id: 'water',
  init(ctx) {
    registerPrefab(WATER_PREFAB);
    registerPrefab(FALL_PREFAB);
    const splasher = createSplasher(ctx);
    const off = ctx.bus.on('entity.changed', ({ entity }) => {
      if (entity.ref === WATER_REF) updatePond(entity);
      else if (entity.ref === FALL_REF) updateFall(entity);
    });
    cleanup = () => {
      off();
      splasher.dispose();
    };
  },
  dispose() {
    cleanup?.();
    cleanup = null;
  },
};
export default mod;
