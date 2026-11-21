/**
 * Platscher: kleiner Spritzer (Partikel) und ein Wellenring, wenn der lokale Avatar ins Wasser tritt.
 * Erkennung zusätzlich zum Physik-Trigger (der nur bei physics.mode = 'trigger' meldet) über die Avatar-Position.
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import '@babylonjs/core/Shaders/particles.vertex';
import '@babylonjs/core/Shaders/particles.fragment';
import type { GameContext } from '../../core/context';
import { ponds } from './pond';
import { insideWater, scaledCount, waterSize, WATER_SURFACE_Y } from './helpers';
import { createRingTexture, sharedSoft } from './textures';

interface Ring {
  mesh: Mesh;
  age: number;
}

export function createSplasher(ctx: GameContext): { dispose(): void; splash(at: Vector3): void } {
  const { scene, bus } = ctx;
  const emitter = new Vector3();
  let system: ParticleSystem | null = null;
  try {
    system = new ParticleSystem('water.splash', 240, scene);
    system.particleTexture = sharedSoft(scene);
    system.emitter = emitter;
    system.emitRate = 0;
    system.minEmitBox = new Vector3(-0.25, 0, -0.25);
    system.maxEmitBox = new Vector3(0.25, 0.05, 0.25);
    system.direction1 = new Vector3(-1.2, 3.2, -1.2);
    system.direction2 = new Vector3(1.2, 5, 1.2);
    system.minLifeTime = 0.35;
    system.maxLifeTime = 0.8;
    system.minSize = 0.06;
    system.maxSize = 0.17;
    system.minEmitPower = 0.8;
    system.maxEmitPower = 1.6;
    system.gravity = new Vector3(0, -11, 0);
    system.color1 = new Color4(0.85, 0.95, 1, 0.9);
    system.color2 = new Color4(0.6, 0.85, 1, 0.8);
    system.colorDead = new Color4(0.7, 0.9, 1, 0);
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    system.updateSpeed = 0.02;
    system.disposeOnStop = false;
    system.start();
  } catch (error) {
    console.warn('[wasser] Partikel nicht verfügbar', error);
    system = null;
  }

  let ringTex: DynamicTexture | null = null;
  let ringMat: StandardMaterial | null = null;
  const rings: Ring[] = [];
  const ensureRingMaterial = (): StandardMaterial => {
    if (!ringMat) {
      ringTex = createRingTexture(scene);
      ringMat = new StandardMaterial('water.ringMat', scene);
      ringMat.diffuseTexture = ringTex;
      ringMat.useAlphaFromDiffuseTexture = true;
      ringMat.emissiveColor = new Color3(0.5, 0.55, 0.6);
      ringMat.diffuseColor = new Color3(0.9, 0.95, 1);
      ringMat.specularColor = Color3.Black();
      ringMat.backFaceCulling = false;
      ringMat.zOffset = -3;
    }
    return ringMat;
  };

  const splash = (at: Vector3): void => {
    const scale = ctx.quality.features().particleScale;
    if (system && scale > 0) {
      emitter.copyFrom(at);
      system.manualEmitCount += scaledCount(34, scale);
    }
    if (rings.length < 6) {
      const mesh = CreateDisc('water.ring', { radius: 0.5, tessellation: 32 }, scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.copyFrom(at);
      mesh.position.y += 0.012;
      mesh.isPickable = false;
      mesh.metadata = { cpWater: true };
      // eigenes Material je Ring, damit die Durchsichtigkeit einzeln ausblenden kann
      const m = ensureRingMaterial().clone('water.ringMat.i');
      mesh.material = m;
      mesh.scaling.setAll(0.4);
      rings.push({ mesh, age: 0 });
    }
    bus.emit('sound.play', { name: 'pop' });
  };

  // Eintritt erkennen
  const inside = new Map<string, boolean>();
  const lastSplash = new Map<string, number>();
  const tryTrigger = (id: string, now: number, at: Vector3): void => {
    if (now - (lastSplash.get(id) ?? -9) < 0.5) return;
    lastSplash.set(id, now);
    splash(at);
  };
  let clock = 0;
  const frame = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, ctx.engine.getDeltaTime() / 1000);
    clock += dt;
    const feet = ctx.localAvatar.presence.position;
    for (const [id, pond] of ponds) {
      const node = ctx.entityNodes.get(id);
      if (!node) continue;
      const base = node.getAbsolutePosition();
      const rot = node.rotationQuaternion;
      const yaw = rot ? Math.atan2(2 * (rot.w * rot.y + rot.x * rot.z), 1 - 2 * (rot.y * rot.y + rot.x * rot.x)) : node.rotation.y;
      const size = waterSize([node.scaling.x, node.scaling.y, node.scaling.z]);
      const surfaceY = base.y + WATER_SURFACE_Y * node.scaling.y;
      const now = insideWater([feet[0], feet[2]], [base.x, base.z], yaw, size, pond.shape) && feet[1] < surfaceY + 0.55 && feet[1] > surfaceY - 1.2;
      const was = inside.get(id) ?? false;
      inside.set(id, now);
      if (now && !was) tryTrigger(id, clock, new Vector3(feet[0], surfaceY, feet[2]));
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      const t = r.age / 1.1;
      if (t >= 1) {
        const mat = r.mesh.material;
        r.mesh.dispose(false, false);
        mat?.dispose(false, false);
        rings.splice(i, 1);
        continue;
      }
      r.mesh.scaling.setAll(0.4 + 2.6 * t);
      if (r.mesh.material) r.mesh.material.alpha = 0.8 * (1 - t);
    }
  });
  // Auch Physik-Trigger (z. B. Remote-Aufbau ohne Positionsabgleich) berücksichtigen; doppelte Platscher unterdrückt `lastSplash`.
  const off = bus.on('trigger.enter', ({ entityId, avatar }) => {
    const pond = ponds.get(entityId);
    if (!pond || avatar.id !== ctx.localAvatar.identity.id) return;
    const feet = ctx.localAvatar.presence.position;
    tryTrigger(entityId, clock, new Vector3(feet[0], (ctx.entityNodes.get(entityId)?.getAbsolutePosition().y ?? 0) + WATER_SURFACE_Y, feet[2]));
  });

  return {
    splash,
    dispose() {
      off();
      scene.onBeforeRenderObservable.remove(frame);
      for (const r of rings) {
        const mat = r.mesh.material;
        r.mesh.dispose(false, false);
        mat?.dispose(false, false);
      }
      rings.length = 0;
      system?.dispose(false);
      ringMat?.dispose(true, true);
      ringTex?.dispose();
    },
  };
}
