/**
 * Paket 25 – Natur: Gras, Bäume im Wind und Tageszyklus (environment.dayCycle).
 * Hooks und Regeln: siehe ../features.ts. Fehler schalten nur den jeweiligen Teil still ab.
 */
import type { EnvironmentSpec } from '../../../../shared/types';
import type { QualityFeatures } from '../../quality';
import type { EnvironmentFeature, EnvironmentHandle } from '../features';
import type { Island } from '../island';
import { DEFAULT_ISLAND } from '../../../../shared/types';
import { createCycleState, cycleEnvironment, timeOfDay, type CycleState } from '../nature/dayCycle';
import { blocksGrass, footprintRects } from '../nature/footprints';
import { createGrass, type Grass } from '../nature/grass';
import { createTreeSway, type TreeSway } from '../nature/treeSway';
import { setWind, windAt } from '../nature/wind';
import type { Rect } from '../nature/blades';
import { parseLightDirection } from '../presets';

const CYCLE_INTERVAL = 0.1;
const FOOTPRINT_DEBOUNCE = 0.6;

/** Zeitquelle des Tageszyklus (ms). Test-Haken: `window.__cpClock = () => ms` ersetzt `Date.now()`. */
export function cycleNow(): number {
  const hook = (globalThis as { __cpClock?: () => number }).__cpClock;
  return typeof hook === 'function' ? hook() : Date.now();
}

function guard<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    console.warn(`[nature] ${label}`, error);
    return undefined;
  }
}

export function createNatureFeature(handle: EnvironmentHandle): EnvironmentFeature {
  const { ctx } = handle;
  let grass: Grass | null = guard('Gras', () => createGrass(handle)) ?? null;
  let trees: TreeSway | null = guard('Bäume', () => createTreeSway(handle)) ?? null;
  let islandSpec: { radius: number; seed: number } | null = null;
  let density = ctx.quality.features().grassDensity;
  let footprintTimer = -1;

  // Tageszyklus
  let base: EnvironmentSpec | null = null;
  let state: CycleState | null = null;
  let lastDir = '';
  let applying = false;
  let running = false;
  let acc = CYCLE_INTERVAL;

  const storeEnv = () => ctx.store.getState().world.environment;

  const computeFootprints = (): Rect[] => {
    const rects: Rect[] = [];
    const entities = ctx.store.getState().entities;
    for (const [id, node] of ctx.entityNodes) {
      if (!blocksGrass(entities[id]) || node.isDisposed()) continue;
      rects.push(...footprintRects(node));
    }
    return rects;
  };
  const scheduleFootprints = () => {
    if (footprintTimer < 0) footprintTimer = FOOTPRINT_DEBOUNCE;
  };
  const offs = [
    ctx.bus.on('entity.added', scheduleFootprints),
    ctx.bus.on('entity.changed', scheduleFootprints),
    ctx.bus.on('entity.removed', scheduleFootprints),
    ctx.bus.on('entity.node.created', scheduleFootprints),
    ctx.bus.on('entity.node.disposed', scheduleFootprints),
    ctx.bus.on('world.loaded', scheduleFootprints),
  ];

  const stopCycle = (restore: boolean) => {
    if (!running) return;
    running = false;
    state = null;
    if (restore) {
      applying = true;
      try {
        handle.applyVirtual(storeEnv());
      } finally {
        applying = false;
      }
    }
  };

  const tickCycle = () => {
    if (!base || !state) return;
    const cfg = base.dayCycle;
    if (!cfg?.enabled) return;
    const t = timeOfDay(cycleNow(), cfg.minutesPerDay, state.t0);
    const { env, look } = cycleEnvironment(base, state, t);
    applying = true;
    try {
      handle.applyVirtual(env, look);
    } finally {
      applying = false;
    }
  };

  return {
    id: 'nature',
    apply(env) {
      if (applying) return;
      base = storeEnv() ?? env;
      if (base.dayCycle?.enabled) {
        const dir = parseLightDirection(base.light?.direction);
        const key = `${Math.round(dir.azimuth)}/${Math.round(dir.elevation)}`;
        if (!state || key !== lastDir) {
          state = createCycleState(base);
          lastDir = key;
        }
        running = true;
        acc = CYCLE_INTERVAL;
      } else {
        stopCycle(false);
      }
    },
    islandChanged(island: Island | null) {
      const spec = ctx.store.getState().world.island;
      islandSpec = island ? { radius: spec?.radius ?? DEFAULT_ISLAND.radius, seed: spec?.seed ?? DEFAULT_ISLAND.seed } : null;
      guard('Gras', () => grass?.configure(islandSpec, density));
      scheduleFootprints();
    },
    update(dt, time) {
      const wind = windAt(time);
      setWind(wind);
      guard('Gras', () => grass?.update(dt, time, wind));
      guard('Bäume', () => trees?.update(time, wind));
      if (footprintTimer >= 0) {
        footprintTimer -= dt;
        if (footprintTimer < 0) {
          footprintTimer = -1;
          guard('Fußabdrücke', () => grass?.setExclusions(computeFootprints()));
        }
      }
      if (running) {
        acc += dt;
        if (acc >= CYCLE_INTERVAL && !applying) {
          acc = 0;
          guard('Tageszyklus', tickCycle);
        }
      }
    },
    onQuality(features: QualityFeatures) {
      density = features.grassDensity;
      guard('Gras', () => {
        grass?.configure(islandSpec, density);
        scheduleFootprints();
      });
    },
    dispose() {
      for (const off of offs) off();
      guard('Tageszyklus', () => stopCycle(true));
      guard('Bäume', () => trees?.dispose());
      guard('Gras', () => grass?.dispose());
      trees = null;
      grass = null;
    },
  };
}
