import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import type { EntitySpec } from '../../../shared/types';
import { tagEntityNode } from '../../core/context';
import { getPrefab } from '../entities/prefabs';
import { exportGlb } from './gltf';

describe('Freiform im Export', () => {
  it('Netz landet in der .glb, Knotenname = Entity-Name', async () => {
    const scene = new Scene(new NullEngine());
    const e: EntitySpec = {
      id: 'ff1', ref: 'EntitySpec.freeform', name: 'Bogenwand',
      state: { kind: 'sweep', path: [{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], height: 2.4, thickness: 0.2 },
      material: { preset: 'holz' },
      transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
    };
    const root = new TransformNode('entity.ff1', scene);
    getPrefab('EntitySpec.freeform')!.build({ scene } as never, e, root);
    tagEntityNode(root, 'ff1');
    const ctx = {
      scene,
      entityNodes: new Map([['ff1', root]]),
      store: { getState: () => ({ order: ['ff1'], entities: { ff1: e }, world: { metadata: { name: 'Test' } } }) },
    };
    const res = await exportGlb(ctx as never);
    expect(res.entities).toBe(1);
    const buf = new Uint8Array(await res.blob.arrayBuffer());
    const jsonLen = new DataView(buf.buffer, buf.byteOffset).getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(buf.slice(20, 20 + jsonLen)));
    expect(json.meshes.length).toBeGreaterThan(0);
    expect(json.nodes.some((n: { name?: string }) => n.name === 'Bogenwand')).toBe(true);
  });
});
