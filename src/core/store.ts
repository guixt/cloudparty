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
  /** Zuletzt gewähltes Objekt (primär); Inspector und Gizmo beziehen sich darauf. */
  selection: string | null;
  /** Alle gewählten Objekte (Mehrfachauswahl); enthält `selection`, wenn gesetzt. */
  selectedIds: string[];
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
  /** Wählt mehrere Objekte (nicht vorhandene IDs werden ignoriert); das letzte wird primär. */
  selectMany(ids: string[]): void;
  /** Fügt ein Objekt zur Auswahl hinzu oder nimmt es heraus (Umschalt/Strg-Klick). */
  toggleSelect(id: string): void;
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
    selectedIds: [],
    mode: 'play',
    canBuild: true,
    revision: 0,

    loadWorld(world) {
      set({ ...splitWorld(world), selection: null, selectedIds: [], revision: 0 });
      bus.emit('selection.changed', { id: null });
      bus.emit('selection.multi.changed', { ids: [] });
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
        selection: state.selection === id ? (state.selectedIds.filter((other) => other !== id).at(-1) ?? null) : state.selection,
        selectedIds: state.selectedIds.filter((other) => other !== id),
        revision: transient ? state.revision : state.revision + 1,
      });
      if (state.selectedIds.includes(id)) {
        const now = get();
        if (state.selection !== now.selection) bus.emit('selection.changed', { id: now.selection });
        bus.emit('selection.multi.changed', { ids: now.selectedIds });
      }
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
      get().selectMany(id ? [id] : []);
    },

    selectMany(ids) {
      const state = get();
      const next = [...new Set(ids)].filter((id) => state.entities[id]);
      const primary = next.at(-1) ?? null;
      const sameIds = next.length === state.selectedIds.length && next.every((id, i) => id === state.selectedIds[i]);
      if (sameIds && primary === state.selection) return;
      set({ selection: primary, selectedIds: next });
      if (primary !== state.selection) bus.emit('selection.changed', { id: primary });
      if (!sameIds) bus.emit('selection.multi.changed', { ids: next });
    },

    toggleSelect(id) {
      const { selectedIds } = get();
      get().selectMany(selectedIds.includes(id) ? selectedIds.filter((other) => other !== id) : [...selectedIds, id]);
    },

    setMode(mode) {
      if (get().mode === mode) return;
      if (mode === 'build' && !get().canBuild) {
        bus.emit('ui.toast', { text: 'Du hast auf dieser Insel kein Baurecht.', kind: 'error' });
        return;
      }
      const hadSelection = get().selectedIds.length > 0 || get().selection !== null;
      set({ mode, ...(mode === 'play' ? { selection: null, selectedIds: [] } : {}) });
      if (mode === 'play' && hadSelection) {
        bus.emit('selection.changed', { id: null });
        bus.emit('selection.multi.changed', { ids: [] });
      }
      bus.emit('mode.changed', { mode });
    },

    setCanBuild(canBuild) {
      set({ canBuild });
      if (!canBuild && get().mode === 'build') get().setMode('play');
    },
  }));
}
