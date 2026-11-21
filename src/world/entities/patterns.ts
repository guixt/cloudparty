/**
 * Prozedurale Muster (karo, streifen, rauschen, ziegel, holz, wellen) als kachelbare Canvas-Texturen,
 * pro Szene zwischengespeichert nach (Muster, Farben, Größe) und mit Zählern freigegeben.
 * Für rauschen/ziegel/wellen entsteht zusätzlich eine Normalen-Textur (feine Oberflächenstruktur).
 */
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { MaterialPattern } from '../../../shared/types';

export const PATTERN_SIZE = 256;
const BUMP_PATTERNS: readonly MaterialPattern[] = ['rauschen', 'ziegel', 'wellen'];

export function hasBump(pattern: MaterialPattern): boolean {
  return BUMP_PATTERNS.includes(pattern);
}

export function patternKey(pattern: MaterialPattern, c1: string, c2: string, size = PATTERN_SIZE, bump = false, uv = 1): string {
  return `${pattern}|${c1.toLowerCase()}|${c2.toLowerCase()}|${size}|${bump ? 'n' : 'c'}|${uv}`;
}

/** Zweite Farbe, wenn keine gesetzt ist: dunklere Variante der ersten. */
export function defaultPatternColor(c1: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(c1)) return '#444444';
  const f = (i: number) => Math.round(parseInt(c1.slice(i, i + 2), 16) * 0.45).toString(16).padStart(2, '0');
  return `#${f(1)}${f(3)}${f(5)}`;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx2D = CanvasRenderingContext2D;

/** Zeichnet das Muster; Rückgabe: Höhenkarte (0..1 je Pixel) oder null. */
export function drawPattern(c: Ctx2D, pattern: MaterialPattern, c1: string, c2: string, size: number): void {
  c.fillStyle = c1;
  c.fillRect(0, 0, size, size);
  c.fillStyle = c2;
  c.strokeStyle = c2;
  switch (pattern) {
    case 'karo': {
      const n = 8, s = size / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 2) c.fillRect(x * s, y * s, s, s);
      break;
    }
    case 'streifen': {
      const n = 8, s = size / n;
      for (let i = 0; i < n; i += 2) c.fillRect(0, i * s, size, s);
      break;
    }
    case 'rauschen': {
      const r = rng(1234);
      for (let i = 0; i < 5200; i++) {
        c.globalAlpha = 0.15 + r() * 0.5;
        const w = 1 + r() * 3;
        c.fillRect(r() * size, r() * size, w, w);
      }
      c.globalAlpha = 1;
      break;
    }
    case 'ziegel': {
      c.clearRect(0, 0, size, size);
      const rows = 8, cols = 4, h = size / rows, w = size / cols, m = 5;
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? w / 2 : 0;
        for (let col = -1; col <= cols; col++) {
          c.globalAlpha = 0.75 + ((row * 7 + col * 3) % 5) * 0.06;
          c.fillStyle = c1;
          c.fillRect(col * w + off + m / 2, row * h + m / 2, w - m, h - m);
        }
      }
      c.globalAlpha = 1;
      // Fugen in zweiter Farbe: Hintergrund war c1, also Fugenfarbe unter die Steine legen
      c.globalCompositeOperation = 'destination-over';
      c.fillStyle = c2;
      c.fillRect(0, 0, size, size);
      c.globalCompositeOperation = 'source-over';
      break;
    }
    case 'holz': {
      const r = rng(77);
      c.lineWidth = 1.5;
      for (let i = 0; i < 70; i++) {
        const y = (i / 70) * size + r() * 3;
        c.globalAlpha = 0.18 + r() * 0.5;
        c.beginPath();
        c.moveTo(0, y);
        const amp = 1 + r() * 3, ph = r() * 6.28;
        for (let x = 0; x <= size; x += 16) c.lineTo(x, y + Math.sin((x / size) * 6.2832 + ph) * amp);
        c.stroke();
      }
      c.globalAlpha = 1;
      break;
    }
    case 'wellen': {
      c.lineWidth = 8;
      for (let i = 0; i < 8; i++) {
        c.globalAlpha = 0.6;
        c.beginPath();
        const y0 = (i + 0.5) * (size / 8);
        for (let x = 0; x <= size; x += 8) {
          const y = y0 + Math.sin((x / size) * Math.PI * 4) * 10;
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      c.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
}

/** Wandelt eine Graustufen-Höhenkarte in eine Normalenkarte (kachelbar). */
export function heightToNormals(src: Uint8ClampedArray, dst: Uint8ClampedArray, size: number, strength = 2): void {
  const hAt = (x: number, y: number) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      dst[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      dst[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      dst[o + 2] = (1 / len) * 0.5 * 255 + 127.5;
      dst[o + 3] = 255;
    }
  }
}

interface Entry {
  tex: DynamicTexture;
  refs: number;
}
const caches = new WeakMap<Scene, Map<string, Entry>>();

function cacheOf(scene: Scene): Map<string, Entry> {
  let m = caches.get(scene);
  if (!m) caches.set(scene, (m = new Map()));
  return m;
}

function build(scene: Scene, key: string, pattern: MaterialPattern, c1: string, c2: string, size: number, normal: boolean, uv: number): DynamicTexture | null {
  try {
    const tex = new DynamicTexture(`pattern.${key}`, { width: size, height: size }, scene, true);
    const c = tex.getContext() as unknown as Ctx2D | null;
    if (!c || typeof c.fillRect !== 'function') {
      tex.dispose();
      return null;
    }
    if (normal) {
      // Höhenkarte: helles Muster (Fugen/Wellen dunkel), dann in Normalen umrechnen.
      drawPattern(c, pattern, '#ffffff', '#000000', size);
      const img = c.getImageData(0, 0, size, size);
      const out = c.createImageData(size, size);
      heightToNormals(img.data, out.data, size, pattern === 'ziegel' ? 3 : 1.5);
      c.putImageData(out, 0, 0);
    } else {
      drawPattern(c, pattern, c1, c2, size);
    }
    tex.update(true);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = tex.vScale = uv;
    // Gemeinsam genutzt: Dispose von außen (z. B. Material.dispose mit Texturen) zählt nur einen Verweis herunter.
    const realDispose = tex.dispose.bind(tex);
    tex.dispose = () => releasePattern(scene, key);
    (tex as unknown as { cpRealDispose: () => void }).cpRealDispose = realDispose;
    return tex;
  } catch {
    return null;
  }
}

/** Liefert die (gemeinsame) Textur; jeder Aufruf muss mit `releasePattern` oder `tex.dispose()` beendet werden. */
export function acquirePattern(scene: Scene, pattern: MaterialPattern, c1: string, c2: string, normal = false, uv = 1, size = PATTERN_SIZE): { key: string; tex: DynamicTexture } | null {
  const key = patternKey(pattern, c1, c2, size, normal, uv);
  const cache = cacheOf(scene);
  const hit = cache.get(key);
  if (hit) {
    hit.refs++;
    return { key, tex: hit.tex };
  }
  const tex = build(scene, key, pattern, c1, c2, size, normal, uv);
  if (!tex) return null;
  cache.set(key, { tex, refs: 1 });
  return { key, tex };
}

export function releasePattern(scene: Scene, key: string): void {
  const cache = cacheOf(scene);
  const entry = cache.get(key);
  if (!entry) return;
  if (--entry.refs > 0) return;
  cache.delete(key);
  (entry.tex as unknown as { cpRealDispose: () => void }).cpRealDispose();
}

/** Anzahl zwischengespeicherter Texturen (Tests/Diagnose). */
export function patternCacheSize(scene: Scene): number {
  return cacheOf(scene).size;
}
