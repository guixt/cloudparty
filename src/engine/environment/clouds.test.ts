import '@babylonjs/core/Meshes/instancedMesh';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { createClouds } from './clouds';

describe('Wolken: setSeaVisible', () => {
  it('blendet nur das Wolkenmeer aus, die treibenden Wolken bleiben', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const clouds = createClouds(scene, 3, -70);
    const drift = scene.getTransformNodeByName('env.cloudDrift.0');
    expect(drift).toBeTruthy();
    const driftMesh = drift!.getChildMeshes()[0];
    const seaMesh = scene.getMeshByName('env.cloud.1')!;
    clouds.setSeaVisible(false);
    expect(seaMesh.isEnabled()).toBe(false);
    expect(driftMesh.isEnabled()).toBe(true);
    expect(clouds.meshes.find((m) => m.name === 'env.cloud.src')!.isVisible).toBe(false);
    clouds.setSeaVisible(true);
    expect(seaMesh.isEnabled()).toBe(true);
    expect(clouds.meshes.find((m) => m.name === 'env.cloud.src')!.isVisible).toBe(true);
    clouds.dispose();
    scene.dispose();
    engine.dispose();
  });
});
