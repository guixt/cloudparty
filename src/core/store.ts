/**
 * WorldStore: die einzige Quelle der Wahrheit für die bearbeitbare Welt.
 * VERTRAG: nur der Koordinator ändert diese Datei.
 *
 * Alle Änderungen laufen über die Aktionen; jede Aktion löst das passende
 * Bus-Ereignis aus. Module reagieren auf Bus-Ereignisse, React-Komponenten
 * nutzen `useStore(ctx.store, selector)` aus 'zustand'.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createDefaultWorld } from '../../shared/defaultWorld';
import type { EntitySpec, EnvironmentSpec, WorldSpec } from '../../shared/types';
import type { ChangeOptions, EventBus, GameMode } from './events';

export interface WorldState {
  /** Welt ohne Entities (die liegen in `entities`). */
  world: Omit<WorldSpec, 'entities'>;
  entities: Record<string, EntitySpec>;
  /** Reihenfolge der Entities (stabil für Export). */
  order: string[];
  selection: string | null;
  mode: GameMode;
  /** Darf der lokale Nutzer hier bauen? Offline immer true. */
  canBuild: boolean;
  /** Erhöht sich bei jeder dauerhaften Änderung (für Autosave/„ungespeichert"). */
  revision: number;

  loadWorld(world: WorldSpec): void;
  /** Aktuellen Stand als vollständige WorldSpec. */
  toWorldSpec(): WorldSpec;
  addEntity(entity: EntitySpec, options?: ChangeOptions): void;
  /** Flaches Zusammenführen auf oberster Ebene; `undefined` als Wert löscht das Feld. */
  updateEntity(id: string, patch: Partial<EntitySpec>, options?: ChangeOptions): void;
  removeEntity(id: string, options?: ChangeOptions): void;
  setEnvironment(environment: EnvironmentSpec, options?: ChangeOptions): void;
  setMetadata(patch: Partial<WorldSpec['metadata']>): void;
  select(id: string | null): void;
  setMode(mode: GameMode): void;
  setCanBuild(canBuild: boolean): void;
}

export type WorldStore = StoreApi<WorldState>;

function splitWorld(world: WorldSpec) {
  const { entities, ...rest } = world;
  const map: Record<string, EntitySpec> = {};
  const order: string[] = [];
  for (const entity of entities ?? []) {
    if (map[entity.id]) continue;
    map[entity.id] = entity;
    order.push(entity.id);
  }
  return { world: rest, entities: map, order };
}

export function createWorldStore(bus: EventBus): WorldStore {
  return createStore<WorldState>((set, get) => ({
    ...splitWorld(createDefaultWorld()),
    selection: null,
    mode: 'play',
    canBuild: true,
    revision: 0,

    loadWorld(world) {
      set({ ...splitWorld(world), selection: null, revision: 0 });
      bus.emit('selection.changed', { id: null });
      bus.emit('world.loaded', { world: get().toWorldSpec() });
    },

    toWorldSpec() {
      const state = get();
      return { ...state.world, entities: state.order.map((id) => state.entities[id]).filter(Boolean) };
    },

    addEntity(entity, options = {}) {
      const state = get();
      if (state.entities[entity.id]) {
        state.updateEntity(entity.id, entity, options);
        return;
      }
      const transient = options.transient ?? false;
      set({
        entities: { ...state.entities, [entity.id]: entity },
        order: [...state.order, entity.id],
        revision: transient ? state.revision : state.revision + 1,
      });
      bus.emit('entity.added', { entity, source: options.source ?? 'local', transient });
    },

    updateEntity(id, patch, options = {}) {
      const state = get();
      const prev = state.entities[id];
      if (!prev) return;
      const entity = { ...prev, ...patch, id } as EntitySpec;
      for (const key of Object.keys(entity) as (keyof EntitySpec)[]) {
        if (entity[key] === undefined) delete entity[key];
      }
      const transient = options.transient ?? false;
      set({ entities: { ...state.entities, [id]: entity }, revision: transient ? state.revision : state.revision + 1 });
      bus.emit('entity.changed', { entity, prev, source: options.source ?? 'local', transient });
    },

    removeEntity(id, options = {}) {
      const state = get();
      const entity = state.entities[id];
      if (!entity) return;
      const entities = { ...state.entities };
      delete entities[id];
      const transient = options.transient ?? false;
      set({
        entities,
        order: state.order.filter((other) => other !== id),
        selection: state.selection === id ? null : state.selection,
        revision: transient ? state.revision : state.revision + 1,
      });
      if (state.selection === id) bus.emit('selection.changed', { id: null });
      bus.emit('entity.removed', { entity, source: options.source ?? 'local', transient });
    },

    setEnvironment(environment, options = {}) {
      const state = get();
      set({ world: { ...state.world, environment }, revision: state.revision + 1 });
      bus.emit('environment.changed', { environment, source: options.source ?? 'local' });
    },

    setMetadata(patch) {
      const state = get();
      set({ world: { ...state.world, metadata: { ...state.world.metadata, ...patch } }, revision: state.revision + 1 });
    },

    select(id) {
      if (get().selection === id) return;
      set({ selection: id });
      bus.emit('selection.changed', { id });
    },

    setMode(mode) {
      if (get().mode === mode) return;
      if (mode === 'build' && !get().canBuild) {
        bus.emit('ui.toast', { text: 'Du hast auf dieser Insel kein Baurecht.', kind: 'error' });
        return;
      }
      set({ mode, selection: mode === 'play' ? null : get().selection });
      if (mode === 'play') bus.emit('selection.changed', { id: null });
      bus.emit('mode.changed', { mode });
    },

    setCanBuild(canBuild) {
      set({ canBuild });
      if (!canBuild && get().mode === 'build') get().setMode('play');
    },
  }));
}
