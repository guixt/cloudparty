/**
 * Notbehelf-Umgebung für Spiegelungen, solange `scene.environmentTexture` (Reflexionssonde, Paket 21) fehlt:
 * ein winziger Himmelsverlauf als Würfeltextur, nur auf Materialien mit Reflexion gesetzt.
 * Sobald die Szene eine eigene Umgebung hat, wird der Notbehelf von dort wieder entfernt (siehe `dropFallbackWhereUnneeded`).
 */
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';

const SIZE = 16;
const cache = new WeakMap<Scene, RawCubeTexture | null>();

const SKY = [0x3f, 0x86, 0xe0], HORIZON = [0xe3, 0xec, 0xf8], GROUND = [0x2f, 0x45, 0x2a];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/** Farbe für Blickrichtung y (-1 unten .. 1 oben). */
export function skyColor(y: number): number[] {
  if (y >= 0) return mix(HORIZON, SKY, Math.min(1, Math.pow(y, 0.6)));
  return mix(HORIZON, GROUND, Math.min(1, Math.pow(-y, 0.5) * 1.4));
}

function face(kind: 'side' | 'up' | 'down'): Uint8Array {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let row = 0; row < SIZE; row++) {
    const y = kind === 'up' ? 1 : kind === 'down' ? -1 : 1 - ((row + 0.5) / SIZE) * 2;
    const c = skyColor(y);
    for (let col = 0; col < SIZE; col++) {
      const o = (row * SIZE + col) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
  }
  return data;
}

export function fallbackEnvironment(scene: Scene): BaseTexture | null {
  if (cache.has(scene)) return cache.get(scene) ?? null;
  let tex: RawCubeTexture | null = null;
  try {
    // Reihenfolge: +X, -X, +Y, -Y, +Z, -Z
    tex = new RawCubeTexture(scene, [face('side'), face('side'), face('up'), face('down'), face('side'), face('side')], SIZE, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  } catch {
    tex = null;
  }
  cache.set(scene, tex);
  return tex;
}

export function isFallbackEnvironment(scene: Scene, tex: BaseTexture | null | undefined): boolean {
  return !!tex && tex === cache.get(scene);
}

/** Entfernt den Notbehelf von allen Materialien, wenn die Szene eine eigene Umgebung hat. */
export function dropFallbackWhereUnneeded(scene: Scene): void {
  if (!scene.environmentTexture) return;
  for (const mat of scene.materials) {
    const pbr = mat as PBRMaterial;
    if (isFallbackEnvironment(scene, pbr.reflectionTexture)) pbr.reflectionTexture = null;
  }
}
