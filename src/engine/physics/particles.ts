/**
 * Partikelemitter-Komponente: Feuer, Funken, Rauch, Konfetti.
 * Texturen entstehen prozedural per DynamicTexture.
 */
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import '@babylonjs/core/Shaders/particles.vertex';
import '@babylonjs/core/Shaders/particles.fragment';
import type { Scene } from '@babylonjs/core/scene';
import type { ParticlePreset, ParticleSpec } from '../../../shared/types';

export const DEFAULT_RATES: Record<ParticlePreset, number> = { fire: 40, sparks: 45, smoke: 30, confetti: 50 };
export const PARTICLE_PRESETS: ParticlePreset[] = ['fire', 'sparks', 'smoke', 'confetti'];

export function particleRate(spec: ParticleSpec): number {
  const rate = spec.rate;
  if (typeof rate === 'number' && Number.isFinite(rate)) return Math.min(2000, Math.max(0, rate));
  return DEFAULT_RATES[spec.preset] ?? 40;
}

/** Wahr, wenn ein Wechsel der Spezifikation ein neues System erfordert (nur Preset-Wechsel). */
export function needsNewSystem(prev: ParticleSpec | undefined, next: ParticleSpec | undefined): boolean {
  return !prev || !next || prev.preset !== next.preset;
}

function makeTexture(scene: Scene, name: string, size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, true);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
  texture.update(true);
  return texture;
}

function softBlob(stops: [number, string][]) {
  return (ctx: CanvasRenderingContext2D, size: number) => {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  };
}

const CONFETTI_COLORS = ['#ff4f6d', '#ffd23f', '#3fd0ff', '#6dff7a', '#c06bff', '#ff9a3c', '#ffffff', '#4d7bff'];
const CONFETTI_GRID = 4;

const textureCache = new WeakMap<Scene, Map<string, DynamicTexture>>();
function textureFor(scene: Scene, key: string): DynamicTexture {
  let map = textureCache.get(scene);
  if (!map) {
    map = new Map();
    textureCache.set(scene, map);
  }
  let texture = map.get(key);
  if (!texture || (texture as unknown as { _isDisposed?: boolean })._isDisposed) {
    if (key === 'soft') {
      texture = makeTexture(scene, 'cp.particle.soft', 64, softBlob([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]));
    } else if (key === 'spark') {
      texture = makeTexture(scene, 'cp.particle.spark', 32, softBlob([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]));
    } else if (key === 'puff') {
      texture = makeTexture(scene, 'cp.particle.puff', 64, softBlob([[0, 'rgba(255,255,255,0.85)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]));
    } else {
      const cell = 32;
      texture = makeTexture(scene, 'cp.particle.confetti', cell * CONFETTI_GRID, (ctx) => {
        for (let i = 0; i < CONFETTI_GRID * CONFETTI_GRID; i += 1) {
          const cx = (i % CONFETTI_GRID) * cell;
          const cy = Math.floor(i / CONFETTI_GRID) * cell;
          ctx.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
          ctx.fillRect(cx + 4, cy + 8, cell - 8, cell - 16);
        }
      });
    }
    map.set(key, texture);
  }
  return texture;
}

export interface EmitterHandle {
  system: ParticleSystem;
  /** Weltposition des Emitters (wird vom Aufrufer pro Frame gesetzt). */
  position: Vector3;
  preset: ParticlePreset;
  /** Läuft das System gerade (start() aufgerufen, stop() noch nicht)? */
  running: boolean;
}

/** Erzeugt ein Partikelsystem für das Preset. Es läuft erst nach `start()`. */
export function createEmitter(scene: Scene, entityId: string, spec: ParticleSpec): EmitterHandle {
  const rate = particleRate(spec);
  const position = new Vector3();
  const capacity = Math.min(6000, Math.max(200, Math.ceil(Math.max(rate, 1) * 4)));
  const system = new ParticleSystem(`particles.${entityId}`, capacity, scene);
  system.emitter = position;
  system.emitRate = rate;
  system.updateSpeed = 0.016;
  system.disposeOnStop = false;

  switch (spec.preset) {
    case 'fire':
      system.particleTexture = textureFor(scene, 'soft');
      system.blendMode = ParticleSystem.BLENDMODE_ADD;
      system.createBoxEmitter(new Vector3(-0.25, 1, -0.25), new Vector3(0.25, 1.4, 0.25), new Vector3(-0.22, 0, -0.22), new Vector3(0.22, 0.05, 0.22));
      system.color1 = new Color4(0.9, 0.38, 0.06, 0.4);
      system.color2 = new Color4(0.8, 0.16, 0.02, 0.35);
      system.colorDead = new Color4(0.2, 0.02, 0, 0);
      system.minSize = 0.22;
      system.maxSize = 0.45;
      system.addSizeGradient(0, 1);
      system.addSizeGradient(1, 0.15);
      system.minLifeTime = 0.5;
      system.maxLifeTime = 1.1;
      system.minEmitPower = 0.6;
      system.maxEmitPower = 1.4;
      system.gravity = new Vector3(0, 2.2, 0);
      break;
    case 'sparks':
      system.particleTexture = textureFor(scene, 'spark');
      system.blendMode = ParticleSystem.BLENDMODE_ADD;
      system.createPointEmitter(new Vector3(-0.7, 1, -0.7), new Vector3(0.7, 1.7, 0.7));
      system.color1 = new Color4(1, 0.85, 0.35, 1);
      system.color2 = new Color4(1, 0.5, 0.1, 1);
      system.colorDead = new Color4(1, 0.2, 0, 0);
      system.minSize = 0.05;
      system.maxSize = 0.14;
      system.minLifeTime = 0.5;
      system.maxLifeTime = 1.3;
      system.minEmitPower = 1.8;
      system.maxEmitPower = 3.6;
      system.gravity = new Vector3(0, -9.8, 0);
      break;
    case 'smoke':
      system.particleTexture = textureFor(scene, 'puff');
      system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      system.createBoxEmitter(new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1.2, 0.2), new Vector3(-0.2, 0, -0.2), new Vector3(0.2, 0.05, 0.2));
      system.color1 = new Color4(0.62, 0.62, 0.65, 0.4);
      system.color2 = new Color4(0.45, 0.45, 0.48, 0.35);
      system.colorDead = new Color4(0.5, 0.5, 0.52, 0);
      system.minSize = 0.5;
      system.maxSize = 0.9;
      system.addSizeGradient(0, 0.5);
      system.addSizeGradient(1, 2.4);
      system.minLifeTime = 2.2;
      system.maxLifeTime = 4;
      system.minEmitPower = 0.3;
      system.maxEmitPower = 0.8;
      system.minAngularSpeed = -0.6;
      system.maxAngularSpeed = 0.6;
      system.gravity = new Vector3(0.15, 0.9, 0);
      break;
    case 'confetti':
      system.particleTexture = textureFor(scene, 'confetti');
      system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      system.isAnimationSheetEnabled = true;
      system.spriteCellWidth = 32;
      system.spriteCellHeight = 32;
      system.startSpriteCellID = 0;
      system.endSpriteCellID = CONFETTI_GRID * CONFETTI_GRID - 1;
      system.spriteCellChangeSpeed = 0;
      system.spriteRandomStartCell = true;
      system.createPointEmitter(new Vector3(-1.4, 2.5, -1.4), new Vector3(1.4, 5, 1.4));
      system.color1 = new Color4(1, 1, 1, 1);
      system.color2 = new Color4(1, 1, 1, 1);
      system.colorDead = new Color4(1, 1, 1, 0);
      system.minSize = 0.14;
      system.maxSize = 0.24;
      system.minLifeTime = 2;
      system.maxLifeTime = 3.2;
      system.minEmitPower = 1.2;
      system.maxEmitPower = 3;
      system.minAngularSpeed = -9;
      system.maxAngularSpeed = 9;
      system.gravity = new Vector3(0, -3.2, 0);
      break;
  }
  return { system, position, preset: spec.preset, running: false };
}

export function disposeEmitter(handle: EmitterHandle) {
  handle.system.stop();
  handle.system.dispose(false);
}
