import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentSpec } from '../../../../shared/types';
import type { EnvironmentHandle } from '../features';

const created: { disposed: boolean; style: unknown; setStyle: ReturnType<typeof vi.fn> }[] = [];
vi.mock('../../../world/water/core', () => ({
  getWaterManager: () => ({}),
  WaterSurface: class {
    disposed = false;
    style: unknown;
    setStyle = vi.fn((s: unknown) => {
      this.style = s;
    });
    constructor(_m: unknown, opts: { style: unknown }) {
      this.style = opts.style;
      created.push(this);
    }
    dispose() {
      this.disposed = true;
    }
  },
}));

import { createSeaFeature } from './sea';

const env = (sea?: EnvironmentSpec['sea']): EnvironmentSpec => ({ sky: { preset: 'clear' }, light: { intensity: 3, temperatureK: 6000, direction: 'x' }, audio: { volume: 0.4 }, sea });

describe('Meer-Effekt', () => {
  let engine: NullEngine;
  let scene: Scene;
  let setSeaVisible: ReturnType<typeof vi.fn>;
  let skyMaterial: { disableDepthWrite: boolean };
  let handle: EnvironmentHandle;

  beforeEach(() => {
    created.length = 0;
    engine = new NullEngine();
    scene = new Scene(engine);
    setSeaVisible = vi.fn();
    skyMaterial = { disableDepthWrite: false };
    handle = {
      ctx: {} as never,
      scene,
      clouds: { setSeaVisible } as never,
      sky: { mesh: { material: skyMaterial } } as never,
      post: { excludeFromGlow: vi.fn() } as never,
      seaY: -70,
    } as unknown as EnvironmentHandle;
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('Modus water: Wolkenmeer aus, Wasser auf seaY', () => {
    const f = createSeaFeature(handle);
    f.apply?.(env({ mode: 'water', color: '#102030', waves: 0.8 }));
    expect(setSeaVisible).toHaveBeenLastCalledWith(false);
    const sea = scene.getMeshByName('env.sea');
    expect(sea).toBeTruthy();
    expect(sea!.position.y).toBe(-70);
    expect(created).toHaveLength(1);
    expect(created[0].style).toMatchObject({ waves: 0.8 });
    expect(skyMaterial.disableDepthWrite).toBe(true);
  });

  it('wiederholtes apply legt keine zweite Fläche an, sondern ändert den Stil', () => {
    const f = createSeaFeature(handle);
    f.apply?.(env({ mode: 'water' }));
    f.apply?.(env({ mode: 'water', waves: 0.1 }));
    expect(created).toHaveLength(1);
    expect(created[0].setStyle).toHaveBeenCalledTimes(1);
    expect(scene.meshes.filter((m) => m.name === 'env.sea')).toHaveLength(1);
  });

  it('zurück auf Wolken: Wasser weg, Wolkenmeer wieder da', () => {
    const f = createSeaFeature(handle);
    f.apply?.(env({ mode: 'water' }));
    f.apply?.(env({ mode: 'clouds' }));
    expect(setSeaVisible).toHaveBeenLastCalledWith(true);
    expect(created[0].disposed).toBe(true);
    expect(scene.getMeshByName('env.sea')).toBeNull();
    expect(skyMaterial.disableDepthWrite).toBe(false);
    f.apply?.(env(undefined));
    expect(created).toHaveLength(1);
  });

  it('dispose räumt auf und wirft nie', () => {
    const f = createSeaFeature(handle);
    f.apply?.(env({ mode: 'water' }));
    expect(() => f.dispose?.()).not.toThrow();
    expect(created[0].disposed).toBe(true);
    expect(setSeaVisible).toHaveBeenLastCalledWith(true);
    expect(() => f.dispose?.()).not.toThrow();
  });
});
