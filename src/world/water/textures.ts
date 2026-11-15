/** Kleine, zwischengespeicherte Texturen (prozedural, ohne Bilddateien) für Gischt, Ringe und Wasserfall. */
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import { generateStreakData, type WaterShape } from './helpers';

function make(scene: Scene, name: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  tex.hasAlpha = true;
  try {
    const c = tex.getContext() as CanvasRenderingContext2D;
    c.clearRect(0, 0, w, h);
    draw(c);
    tex.update(true);
  } catch {
    /* kein 2D-Kontext: Textur bleibt leer */
  }
  return tex;
}

/** Heller Saum am Rand (rund: Ring, rechteckig: Rahmen); Mitte durchsichtig. */
export function createFoamTexture(scene: Scene, shape: WaterShape): DynamicTexture {
  return make(scene, `water.foam.${shape}`, 128, 128, (c) => {
    if (shape === 'round') {
      const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.9, 'rgba(255,255,255,0)');
      g.addColorStop(0.97, 'rgba(255,255,255,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    } else {
      const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
        const g = c.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(255,255,255,0.4)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(rx, ry, rw, rh);
      };
      edge(0, 0, 10, 0, 0, 0, 10, 128);
      edge(128, 0, 118, 0, 118, 0, 10, 128);
      edge(0, 0, 0, 10, 0, 0, 128, 10);
      edge(0, 128, 0, 118, 0, 118, 128, 10);
    }
  });
}

/** Ring für die Wellen nach einem Platscher. */
export function createRingTexture(scene: Scene): DynamicTexture {
  return make(scene, 'water.ring', 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.62, 'rgba(255,255,255,0)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

export function createSoftTexture(scene: Scene): DynamicTexture {
  return make(scene, 'water.soft', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

/** Senkrechte Schlieren (kachelbar), Wasserfall. */
export function createStreakTexture(scene: Scene, seed: number): DynamicTexture {
  const w = 64;
  const h = 256;
  const tex = new DynamicTexture(`water.streak.${seed}`, { width: w, height: h }, scene, true);
  tex.hasAlpha = true;
  try {
    const c = tex.getContext() as CanvasRenderingContext2D;
    c.putImageData(new ImageData(new Uint8ClampedArray(generateStreakData(w, h, seed)), w, h), 0, 0);
    tex.update(true);
  } catch {
    /* leer */
  }
  tex.wrapU = 1;
  tex.wrapV = 1;
  return tex;
}

const shared = new WeakMap<Scene, DynamicTexture>();
/** Gemeinsame weiche Partikel-Textur pro Szene (wird nur mit der Szene freigegeben). */
export function sharedSoft(scene: Scene): DynamicTexture {
  let t = shared.get(scene);
  if (!t || (t as unknown as { _isDisposed?: boolean })._isDisposed) {
    t = createSoftTexture(scene);
    shared.set(scene, t);
  }
  return t;
}
