import { describe, expect, it } from 'vitest';
import type { EnvironmentSpec } from '../../../../shared/types';
import { SKY_PRESETS, type SkyLook } from '../presets';
import { BLADE_STRIDE, FLAT_FRACTION, MAX_BLADES, bladeCount, bladesToBuffers, filterBlades, generateBlades } from './blades';
import { blendLooks } from './blend';
import { NIGHT_CYCLE, createCycleState, cycleEnvironment, lookForElevation, sunFromTime, timeFromSun, timeOfDay } from './dayCycle';
import { blocksGrass } from './footprints';
import { windAt } from './wind';
import { createNatureFeature } from '../features/nature';

const island = { radius: 40, seed: 7 };

describe('Grashalme', () => {
  it('ist deterministisch', () => {
    expect(Array.from(generateBlades(island, 0.35))).toEqual(Array.from(generateBlades(island, 0.35)));
    expect(Array.from(generateBlades(island, 0.35))).not.toEqual(Array.from(generateBlades({ ...island, seed: 8 }, 0.35)));
  });
  it('bleibt im flachen Teil', () => {
    const b = generateBlades(island, 1);
    for (let i = 0; i < b.length; i += BLADE_STRIDE) expect(Math.hypot(b[i], b[i + 1])).toBeLessThanOrEqual(island.radius * FLAT_FRACTION + 1e-6);
  });
  it('skaliert mit der Dichte (Präfix) und hat Obergrenze', () => {
    expect(generateBlades(island, 0).length).toBe(0);
    const lo = generateBlades(island, 0.35);
    const hi = generateBlades(island, 0.7);
    expect(hi.length).toBeGreaterThan(lo.length * 1.8);
    expect(Array.from(hi.slice(0, lo.length))).toEqual(Array.from(lo));
    expect(bladeCount(500, 1)).toBe(MAX_BLADES);
  });
  it('lässt Halme unter Rechtecken weg', () => {
    const b = generateBlades(island, 0.7);
    const rect = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    const out = filterBlades(b, [rect]);
    expect(out.length).toBeLessThan(b.length);
    for (let i = 0; i < out.length; i += BLADE_STRIDE) {
      const inside = out[i] >= rect.minX && out[i] <= rect.maxX && out[i + 1] >= rect.minZ && out[i + 1] <= rect.maxZ;
      expect(inside).toBe(false);
    }
    expect(filterBlades(b, [])).toBe(b);
  });
  it('schreibt passende Puffer', () => {
    const b = generateBlades(island, 0.2);
    const { matrices, colors } = bladesToBuffers(b);
    expect(matrices.length / 16).toBe(b.length / BLADE_STRIDE);
    expect(colors.length / 4).toBe(b.length / BLADE_STRIDE);
    expect(matrices[12]).toBeCloseTo(b[0]);
  });
  it('verdrängt nur statische Körper und Startpunkte', () => {
    expect(blocksGrass({ ref: 'EntitySpec.box', physics: { mode: 'static' } })).toBe(true);
    expect(blocksGrass({ ref: 'EntitySpec.avatar-spawn' })).toBe(true);
    expect(blocksGrass({ ref: 'EntitySpec.box', physics: { mode: 'dynamic' } })).toBe(false);
    expect(blocksGrass(undefined)).toBe(false);
  });
  it('Wind bleibt in 0.3..1', () => {
    for (let t = 0; t < 200; t += 0.7) {
      const w = windAt(t);
      expect(w).toBeGreaterThanOrEqual(0.3);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});

describe('blendLooks', () => {
  const a = SKY_PRESETS.clear;
  const b = SKY_PRESETS.night;
  it('Endpunkte entsprechen den Eingaben', () => {
    expect(blendLooks(a, b, 0)).toEqual(a);
    expect(blendLooks(a, b, 1)).toEqual(b);
    expect(blendLooks(a, b, -3)).toEqual(a);
  });
  it('hat alle Felder und monotone Mittelwerte', () => {
    const keys = Object.keys(a) as (keyof SkyLook)[];
    const lo = blendLooks(a, b, 0.25);
    const hi = blendLooks(a, b, 0.75);
    expect(Object.keys(lo).sort()).toEqual([...keys].sort());
    expect(lo.stars).toBeLessThan(hi.stars);
    expect(lo.top[2]).toBeGreaterThan(hi.top[2]);
    expect(lo.sunFactor).toBeGreaterThan(hi.sunFactor);
    for (const k of keys) {
      const v = blendLooks(a, b, 0.5)[k];
      if (Array.isArray(v)) v.forEach((c) => expect(Number.isFinite(c)).toBe(true));
      else expect(Number.isFinite(v)).toBe(true);
    }
    const mid = blendLooks(a, b, 0.5).top;
    expect(mid[2]).toBeLessThan(a.top[2]);
    expect(mid[2]).toBeGreaterThan(b.top[2]);
  });
});

describe('Tageszyklus', () => {
  it('bildet Zeit auf Sonnenstand ab', () => {
    expect(sunFromTime(0.5).elevation).toBeCloseTo(70);
    expect(sunFromTime(0.25).elevation).toBeCloseTo(0);
    expect(sunFromTime(0).elevation).toBeLessThan(-60);
    expect(sunFromTime(0.25).azimuth).toBeCloseTo(90);
    expect(sunFromTime(0.75).azimuth).toBeCloseTo(270);
    expect(sunFromTime(0.5, 20).azimuth).toBeCloseTo(200);
  });
  it('Startzeit passt zur gespeicherten Richtung', () => {
    const t = timeFromSun({ azimuth: 100, elevation: 35 });
    expect(sunFromTime(t).elevation).toBeCloseTo(35, 3);
    expect(t).toBeLessThan(0.5);
    const evening = timeFromSun({ azimuth: 250, elevation: 35 });
    expect(evening).toBeGreaterThan(0.5);
    expect(sunFromTime(evening).elevation).toBeCloseTo(35, 3);
  });
  it('Zeit läuft modulo Tageslänge', () => {
    expect(timeOfDay(0, 10, 0.3)).toBeCloseTo(0.3);
    expect(timeOfDay(5 * 60000, 10, 0)).toBeCloseTo(0.5);
    expect(timeOfDay(10 * 60000, 10, 0.3)).toBeCloseTo(0.3);
  });
  it('wählt Look nach Sonnenhöhe', () => {
    const day = SKY_PRESETS.clear;
    expect(lookForElevation(60, day)).toEqual(day);
    expect(lookForElevation(-30, day)).toEqual(NIGHT_CYCLE);
    expect(lookForElevation(1, day)).toEqual(SKY_PRESETS.dusk);
    const mid = lookForElevation(10, day);
    expect(mid.stars).toBeLessThan(SKY_PRESETS.dusk.stars);
    expect(mid.stars).toBeGreaterThanOrEqual(0);
  });
  it('baut virtuelle Umgebung ohne die Quelle zu ändern', () => {
    const base: EnvironmentSpec = {
      sky: { preset: 'clear' },
      light: { intensity: 3, temperatureK: 6000, direction: { azimuth: 40, elevation: 50 } },
      dayCycle: { enabled: true, minutesPerDay: 2 },
    } as EnvironmentSpec;
    const state = createCycleState(base);
    const first = cycleEnvironment(base, state, state.t0);
    expect((first.env.light.direction as { azimuth: number }).azimuth).toBeCloseTo(40, 3);
    expect(first.elevation).toBeCloseTo(50, 3);
    expect((base.light.direction as { elevation: number }).elevation).toBe(50);
    const night = cycleEnvironment(base, state, 0);
    expect(night.look.stars).toBe(1);
  });
});

describe('Wiedereintritt', () => {
  it('ignoriert apply während applyVirtual und stellt beim Beenden wieder her', () => {
    const stored = {
      sky: { preset: 'clear' },
      light: { intensity: 3, temperatureK: 6000, direction: { azimuth: 40, elevation: 50 } },
      dayCycle: { enabled: true, minutesPerDay: 1 },
    } as EnvironmentSpec;
    const calls: { env: EnvironmentSpec; look?: SkyLook }[] = [];
    let feature: ReturnType<typeof createNatureFeature>;
    let depth = 0;
    let maxDepth = 0;
    const handle = {
      scene: { onBeforeRenderObservable: { add: () => null, remove: () => null } },
      ctx: {
        quality: { features: () => ({ grassDensity: 0 }) },
        store: { getState: () => ({ world: { environment: stored }, entities: {} }) },
        bus: { on: () => () => undefined },
        entityNodes: new Map(),
      },
      applyVirtual(env: EnvironmentSpec, look?: SkyLook) {
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);
        calls.push({ env, look });
        feature.apply?.(env);
        depth -= 1;
      },
    };
    const g = globalThis as { __cpClock?: () => number };
    g.__cpClock = () => 0;
    // grass/trees schlagen mit dem Fake-Handle still fehl (console.warn), der Zyklus muss trotzdem laufen
    feature = createNatureFeature(handle as never);
    feature.apply?.(stored);
    feature.update?.(0.2, 1);
    expect(calls.length).toBe(1);
    expect(calls[0].look).toBeDefined();
    expect(maxDepth).toBe(1);
    feature.update?.(0.2, 1.2);
    expect(calls.length).toBe(2);
    feature.dispose?.();
    expect(calls.length).toBe(3);
    expect(calls[2].env).toBe(stored);
    expect(calls[2].look).toBeUndefined();
    delete g.__cpClock;
  });
});
