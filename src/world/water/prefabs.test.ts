import { describe, expect, it } from 'vitest';
import { PREFAB_REFS } from '../../../shared/types';
import { entitySchema } from '../../../shared/worldspec';
import { registerPrefab, createEntityFromPrefab, getPrefab } from '../entities/prefabs';
import { FALL_PREFAB, FALL_REF, WATER_PREFAB, WATER_REF } from './index';

describe('Wasser-Prefabs', () => {
  it('Refs sind im Vertrag', () => {
    expect(PREFAB_REFS).toContain(WATER_REF);
    expect(PREFAB_REFS).toContain(FALL_REF);
  });

  it('Anmeldung liefert die Bausteine mit deutschen Namen', () => {
    registerPrefab(WATER_PREFAB);
    registerPrefab(FALL_PREFAB);
    expect(getPrefab(WATER_REF)).toMatchObject({ label: 'Wasser', category: 'Natur', icon: '💧' });
    expect(getPrefab(FALL_REF)).toMatchObject({ label: 'Wasserfall', category: 'Natur', icon: '🌊' });
  });

  it('Vorgaben sind gültig (entitySchema) und sinnvoll', () => {
    registerPrefab(WATER_PREFAB);
    registerPrefab(FALL_PREFAB);
    const water = createEntityFromPrefab(WATER_REF, [3, 0, 4]);
    expect(entitySchema.safeParse(water).success).toBe(true);
    expect(water.transform.scale).toEqual([8, 1, 8]);
    expect(water.transform.pos).toEqual([3, 0, 4]);
    expect(water.physics?.mode).toBe('trigger');
    expect(water.state).toMatchObject({ shape: 'round', waves: 0.4 });
    expect(water.material?.color).toBe('#2c9fd9');
    const fall = createEntityFromPrefab(FALL_REF, [0, 0, 0]);
    expect(entitySchema.safeParse(fall).success).toBe(true);
    expect(fall.physics?.mode).toBe('none');
    expect(fall.state).toMatchObject({ width: 2, height: 12 });
    expect(fall.material?.color).toBe('#a8def5');
  });

  it('nur die Form löst einen Neuaufbau aus', () => {
    expect(WATER_PREFAB.stateKeys).toEqual(['shape']);
  });
});
