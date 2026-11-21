/** Partikel-Ebenen für Regen, Schnee und Glühwürmchen; folgen der aktiven Kamera. */
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import '@babylonjs/core/Shaders/particles.vertex';
import '@babylonjs/core/Shaders/particles.fragment';
import type { Scene } from '@babylonjs/core/scene';
import type { WeatherKind } from '../../../../shared/types';
import { fireflyShare, weatherOptions } from './options';

export interface LayerInput {
  /** Kameraposition. */
  camera: Vector3;
  /** Überblendung 0..1. */
  fade: number;
  /** Helligkeit unbeleuchteter Partikel 0.25..1. */
  brightness: number;
  /** 0 (Tag) .. 1 (Nacht). */
  night: number;
  /** Wind 0.3..1. */
  wind: number;
}

export interface WeatherLayer {
  kind: WeatherKind;
  update(input: LayerInput): void;
  /** Hört auf zu erzeugen (vorhandene Partikel laufen aus). */
  stop(): void;
  /** Anzahl lebender Partikel. */
  active(): number;
  dispose(): void;
}

function makeTexture(scene: Scene, name: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): DynamicTexture {
  const texture = new DynamicTexture(name, { width: w, height: h }, scene, true);
  texture.hasAlpha = true;
  const c = texture.getContext() as CanvasRenderingContext2D;
  c.clearRect(0, 0, w, h);
  draw(c);
  texture.update(true);
  return texture;
}

const radial = (size: number, stops: [number, string][]) => (c: CanvasRenderingContext2D) => {
  const half = size / 2;
  const g = c.createRadialGradient(half, half, 0, half, half, half);
  for (const [at, color] of stops) g.addColorStop(at, color);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
};

export function createLayer(scene: Scene, kind: WeatherKind, particleScale: number): WeatherLayer | null {
  const opts = weatherOptions(kind, particleScale);
  if (!opts || (kind !== 'rain' && kind !== 'snow' && kind !== 'fireflies')) return null;
  const textures: DynamicTexture[] = [];
  const systems: { system: ParticleSystem; emitter: Vector3; offset: Vector3; share: number; tint: [number, number, number] }[] = [];

  const add = (name: string, capacity: number, share: number, texture: DynamicTexture, offset: Vector3, tint: [number, number, number]) => {
    const emitter = new Vector3();
    const system = new ParticleSystem(name, capacity, scene);
    system.particleTexture = texture;
    system.emitter = emitter;
    system.minLifeTime = opts.minLife;
    system.maxLifeTime = opts.maxLife;
    system.emitRate = 0;
    system.updateSpeed = 0.016;
    system.gravity = Vector3.Zero();
    systems.push({ system, emitter, offset, share, tint });
    return system;
  };

  if (kind === 'rain') {
    const tex = makeTexture(scene, 'cp.weather.rain', 16, 128, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(4, 0, 8, 128);
    });
    textures.push(tex);
    const s = add('cp.weather.rain', opts.capacity, 1, tex, new Vector3(0, 10, 0), [0.85, 0.9, 1]);
    s.createBoxEmitter(new Vector3(0.12, -1, 0.05), new Vector3(0.2, -1, -0.05), new Vector3(-13, 0, -13), new Vector3(13, 2, 13));
    s.minEmitPower = 22;
    s.maxEmitPower = 28;
    s.billboardMode = ParticleSystem.BILLBOARDMODE_Y;
    s.minSize = 1;
    s.maxSize = 1;
    s.minScaleX = 0.07;
    s.maxScaleX = 0.11;
    s.minScaleY = 0.55;
    s.maxScaleY = 0.85;
    s.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  } else if (kind === 'snow') {
    const tex = makeTexture(scene, 'cp.weather.snow', 64, 64, radial(64, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]));
    textures.push(tex);
    const s = add('cp.weather.snow', opts.capacity, 1, tex, new Vector3(0, 6, 0), [0.95, 0.97, 1]);
    s.createBoxEmitter(new Vector3(-0.25, -1, -0.25), new Vector3(0.25, -1, 0.25), new Vector3(-15, 0, -15), new Vector3(15, 3, 15));
    s.minEmitPower = 1.1;
    s.maxEmitPower = 1.9;
    s.minSize = 0.07;
    s.maxSize = 0.2;
    s.minAngularSpeed = -0.6;
    s.maxAngularSpeed = 0.6;
    s.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  } else {
    const tex = makeTexture(scene, 'cp.weather.firefly', 64, 64, radial(64, [[0, 'rgba(255,255,230,1)'], [0.2, 'rgba(255,240,140,0.85)'], [0.5, 'rgba(200,255,90,0.25)'], [1, 'rgba(200,255,90,0)']]));
    textures.push(tex);
    const far = add('cp.weather.firefly', opts.capacity, 0.75, tex, new Vector3(0, 0, 0), [1, 1, 1]);
    const near = add('cp.weather.firefly.near', Math.max(8, Math.round(opts.capacity * 0.35)), 0.25, tex, new Vector3(0, 0, 0), [1, 1, 1]);
    far.createBoxEmitter(new Vector3(-1, -0.3, -1), new Vector3(1, 0.5, 1), new Vector3(-15, -1, -15), new Vector3(15, 4, 15));
    near.createBoxEmitter(new Vector3(-1, -0.3, -1), new Vector3(1, 0.5, 1), new Vector3(-6, -0.5, -6), new Vector3(6, 2.5, 6));
    for (const s of [far, near]) {
      s.minEmitPower = 0.1;
      s.maxEmitPower = 0.45;
      s.minSize = 0.1;
      s.maxSize = 0.2;
      s.blendMode = ParticleSystem.BLENDMODE_ADD;
      s.addColorGradient(0, new Color4(1, 0.95, 0.5, 0));
      s.addColorGradient(0.15, new Color4(1, 0.95, 0.45, 1));
      s.addColorGradient(0.35, new Color4(0.8, 1, 0.4, 0.35));
      s.addColorGradient(0.55, new Color4(1, 0.95, 0.5, 1));
      s.addColorGradient(0.8, new Color4(0.8, 1, 0.4, 0.5));
      s.addColorGradient(1, new Color4(0.8, 1, 0.4, 0));
    }
  }
  for (const s of systems) s.system.start();
  const totalShare = systems.reduce((a, s) => a + s.share, 0);

  return {
    kind,
    update({ camera, fade, brightness, night, wind }) {
      for (const s of systems) {
        s.emitter.copyFrom(camera).addInPlace(s.offset);
        let rate = opts.emitRate * (s.share / totalShare) * fade;
        if (kind === 'fireflies') rate *= fireflyShare(night);
        s.system.emitRate = rate;
        if (kind === 'rain') {
          const a = 0.08 + 0.28 * wind;
          const b = s.system.particleEmitterType as unknown as { direction1: Vector3; direction2: Vector3 };
          b.direction1.x = a;
          b.direction2.x = a + 0.1;
        } else if (kind === 'snow') {
          const b = s.system.particleEmitterType as unknown as { direction1: Vector3; direction2: Vector3 };
          b.direction1.x = -0.1 + wind * 0.6;
          b.direction2.x = 0.3 + wind * 0.6;
        }
        if (kind !== 'fireflies') {
          const alpha = kind === 'rain' ? 0.9 : 0.95;
          const k = brightness;
          const [r, g, bl] = s.tint;
          s.system.color1 = new Color4(r * k, g * k, bl * k, alpha);
          s.system.color2 = new Color4(r * k * 0.9, g * k * 0.9, bl * k, alpha * 0.8);
          s.system.colorDead = new Color4(r * k, g * k, bl * k, alpha * 0.45);
        }
      }
    },
    stop() {
      for (const s of systems) s.system.stop();
    },
    active() {
      return systems.reduce((a, s) => a + s.system.getActiveCount(), 0);
    },
    dispose() {
      for (const s of systems) s.system.dispose(false);
      for (const t of textures) t.dispose();
      systems.length = 0;
      textures.length = 0;
    },
  };
}
