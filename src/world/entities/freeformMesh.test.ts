import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it, vi } from 'vitest';
import { FREEFORM_REF } from '../../../shared/freeform';
import type { EntitySpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { disposeNode } from './index';
import { getPrefab } from './prefabs';

const entity = (state: unknown, extra: Partial<EntitySpec> = {}): EntitySpec => ({
  id: 'ff1', ref: FREEFORM_REF, name: 'Bogen', state: state as Record<string, unknown>,
  transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, ...extra,
});
const sweep = (h = 2.4) => ({ kind: 'sweep', path: [{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], height: h, thickness: 0.2 });

function setup() {
  const scene = new Scene(new NullEngine());
  const ctx = { scene } as unknown as GameContext;
  const build = (e: EntitySpec) => {
    const root = new TransformNode(`entity.${e.id}`, scene);
    getPrefab(FREEFORM_REF)!.build(ctx, e, root);
    return root;
  };
  return { scene, build };
}

describe('Freiform-Prefab', () => {
  it('ist registriert und baut ein Netz mit Material', () => {
    const def = getPrefab(FREEFORM_REF)!;
    expect(def.label).toBe('Freiform');
    expect(def.groundOffset).toBe(0);
    const { build } = setup();
    const root = build(entity(sweep(), { material: { color: '#ff0000', uvScale: 2 } }));
    const meshes = root.getChildMeshes(false);
    expect(meshes).toHaveLength(1);
    expect(meshes[0].getTotalVertices()).toBeGreaterThan(0);
    expect(meshes[0].material).toBeTruthy();
    expect(meshes[0].material!.backFaceCulling).toBe(false);
  });

  it('Standard-State des Prefabs ist baubar', () => {
    const { build } = setup();
    const root = build(entity(getPrefab(FREEFORM_REF)!.defaults.state));
    expect(root.getChildMeshes(false)[0].getTotalVertices()).toBeGreaterThan(0);
  });

  it('kaputter State ergibt Platzhalter ohne Wurf', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { build } = setup();
    for (const bad of [undefined, null, 5, { kind: 'quark' }]) {
      const root = build(entity(bad));
      const meshes = root.getChildMeshes(false);
      expect(meshes).toHaveLength(1);
      expect(meshes[0].getTotalVertices()).toBeGreaterThan(0);
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('wiederholter Neubau leckt keine Meshes oder Materialien', () => {
    const { scene, build } = setup();
    let root = build(entity(sweep(1)));
    const meshes = scene.meshes.length;
    const mats = scene.materials.length;
    for (let i = 0; i < 20; i++) {
      disposeNode(root);
      root = build(entity(sweep(1 + i * 0.1)));
      expect(scene.meshes.length).toBe(meshes);
      expect(scene.materials.length).toBe(mats);
    }
  });
});
