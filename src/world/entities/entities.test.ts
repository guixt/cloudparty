import { describe, expect, it } from 'vitest';
import { PREFAB_REFS, type EntitySpec } from '../../../shared/types';
import { classifyChange } from './diff';
import { normaliseScale, pluginExtensionFor } from './model';
import { PREFABS, createEntityFromPrefab, getPrefab, registerPrefab } from './prefabs';

const base = (): EntitySpec => ({
  id: 'a',
  ref: 'EntitySpec.bench',
  transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
  state: { seats: 3 },
  material: { color: '#ffffff' },
});

describe('Prefab-Register', () => {
  it('kennt alle Nicht-Medien-Refs', () => {
    for (const ref of PREFAB_REFS.filter((r) => !r.startsWith('EntitySpec.media-'))) {
      const def = getPrefab(ref);
      expect(def, ref).toBeTruthy();
      expect(def!.label.length).toBeGreaterThan(0);
    }
    expect(PREFABS.length).toBeGreaterThanOrEqual(16);
  });

  it('Standardwerte', () => {
    expect(getPrefab('EntitySpec.bench')!.defaults.state).toEqual({ seats: 3 });
    expect(getPrefab('EntitySpec.chair')!.defaults.state).toEqual({ seats: 1 });
    expect(getPrefab('EntitySpec.lantern')!.defaults.state?.on).toBe(true);
  });

  it('createEntityFromPrefab setzt Boden-Höhe und Defaults', () => {
    const box = createEntityFromPrefab('EntitySpec.box', [2, 0, 3]);
    expect(box.transform.pos).toEqual([2, 0.5, 3]);
    expect(box.material?.color).toBeTruthy();
    const bench = createEntityFromPrefab('EntitySpec.bench', [1, 0, 1]);
    expect(bench.transform.pos).toEqual([1, 0, 1]);
    expect(bench.state?.seats).toBe(3);
    const plane = createEntityFromPrefab('EntitySpec.plane', [0, 0, 0]);
    expect(plane.transform.pos[1]).toBeCloseTo(0.025);
    expect(plane.transform.scale).toEqual([3, 1, 3]);
    expect(createEntityFromPrefab('EntitySpec.box', [0, 0, 0]).id).not.toBe(box.id);
  });

  it('Defaults werden kopiert, nicht geteilt', () => {
    const a = createEntityFromPrefab('EntitySpec.bench', [0, 0, 0]);
    a.state!.seats = 9;
    expect(getPrefab('EntitySpec.bench')!.defaults.state).toEqual({ seats: 3 });
  });

  it('unbekannte Refs erzeugen trotzdem eine Entity; registerPrefab ergänzt', () => {
    expect(createEntityFromPrefab('EntitySpec.media-image', [0, 0, 0]).ref).toBe('EntitySpec.media-image');
    registerPrefab({ ref: 'EntitySpec.test-x', label: 'X', category: 'Medien', defaults: {}, build() {} });
    expect(getPrefab('EntitySpec.test-x')).toBeTruthy();
    expect(PREFABS.some((p) => p.ref === 'EntitySpec.test-x')).toBe(true);
  });
});

describe('classifyChange', () => {
  it('nur Transform', () => {
    const a = base();
    const b = { ...a, transform: { ...a.transform, pos: [1, 0, 0] as [number, number, number] } };
    expect(classifyChange(a, b)).toEqual({ rebuild: false, transform: true, material: false });
  });
  it('nur Material', () => {
    const a = base();
    expect(classifyChange(a, { ...a, material: { color: '#ff0000' } })).toEqual({ rebuild: false, transform: false, material: true });
  });
  it('ref, modelUrl, State → Neuaufbau', () => {
    const a = base();
    expect(classifyChange(a, { ...a, ref: 'EntitySpec.chair' }).rebuild).toBe(true);
    expect(classifyChange(a, { ...a, modelUrl: 'x.glb' }).rebuild).toBe(true);
    expect(classifyChange(a, { ...a, state: { seats: 4 } }).rebuild).toBe(true);
  });
  it('relevante State-Schlüssel', () => {
    const a = base();
    const b = { ...a, state: { seats: 3, counter: 5 } };
    expect(classifyChange(a, b, ['seats']).rebuild).toBe(false);
    expect(classifyChange(a, b).rebuild).toBe(true);
  });
  it('physics/particles/script/media ändern nichts', () => {
    const a = base();
    const b: EntitySpec = {
      ...a,
      physics: { mode: 'dynamic' },
      particles: { preset: 'fire', enabled: true },
      script: { source: 'x', enabled: true },
      media: { kind: 'text', text: 'hi' },
    };
    expect(classifyChange(a, b)).toEqual({ rebuild: false, transform: false, material: false });
  });
});

describe('Modell-Hilfen', () => {
  it('normaliseScale', () => {
    expect(normaliseScale(2)).toBe(1);
    expect(normaliseScale(0.01)).toBeCloseTo(100);
    expect(normaliseScale(200)).toBeCloseTo(0.05);
    expect(normaliseScale(0)).toBe(1);
  });
  it('pluginExtensionFor', () => {
    expect(pluginExtensionFor('https://x/y.gltf?v=1')).toBe('.gltf');
    expect(pluginExtensionFor('https://x/y.glb')).toBe('.glb');
    expect(pluginExtensionFor('data:model/gltf-binary;base64,AAAA')).toBe('.glb');
    expect(pluginExtensionFor('data:application/octet-stream;base64,Z2xURgIAAAA=')).toBe('.glb');
    expect(pluginExtensionFor('data:application/json;base64,eyJhc3NldCI6e319')).toBe('.gltf');
  });
});
