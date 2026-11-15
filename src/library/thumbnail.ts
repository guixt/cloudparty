/**
 * Vorschaubilder: eine kleine, eigenständige 2D-Darstellung (Flächen von Würfeln, Zylindern, Kegeln, Kugeln aus der
 * Transform der Objekte). Läuft ohne WebGL, stört weder die Hauptszene noch deren Render-Schleife und funktioniert
 * auch unter SwiftShader. Zusammengesetzte Prefabs (Bank, Baum …) werden durch grobe Ersatzformen angedeutet.
 */
import type { EntitySpec, Quat, Vec3 } from '../../shared/types';

export const THUMB_W = 256;
export const THUMB_H = 192;

type Kind = 'box' | 'cylinder' | 'cone' | 'sphere';
interface Solid {
  kind: Kind;
  /** Mitte in Weltkoordinaten. */
  center: Vec3;
  size: Vec3;
  rot: Quat;
  color: string;
  glow: boolean;
}
export interface Poly {
  pts: Vec3[];
  normal: Vec3;
  color: [number, number, number];
  glow: boolean;
}

function hexToRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rotateVec(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

interface Proxy {
  kind: Kind;
  c: Vec3;
  s: Vec3;
  color?: string;
  glow?: boolean;
}
/** Ersatzformen in lokalen Koordinaten (Ursprung am Boden) für zusammengesetzte Prefabs. */
function proxies(entity: EntitySpec): Proxy[] {
  const color = entity.material?.color;
  switch (entity.ref.replace('EntitySpec.', '')) {
    case 'bench': {
      const len = Math.max(1, Math.round(Number(entity.state?.seats ?? 3))) * 0.62 + 0.3;
      return [
        { kind: 'box', c: [0, 0.46, 0], s: [len, 0.08, 0.5], color },
        { kind: 'box', c: [0, 0.8, 0.23], s: [len, 0.36, 0.06], color },
        { kind: 'box', c: [-(len / 2 - 0.12), 0.22, 0], s: [0.07, 0.44, 0.46], color: '#3b3f48' },
        { kind: 'box', c: [len / 2 - 0.12, 0.22, 0], s: [0.07, 0.44, 0.46], color: '#3b3f48' },
      ];
    }
    case 'chair':
      return [
        { kind: 'box', c: [0, 0.46, 0], s: [0.5, 0.06, 0.5], color },
        { kind: 'box', c: [0, 0.75, 0.22], s: [0.5, 0.5, 0.05], color },
        { kind: 'box', c: [0, 0.22, 0], s: [0.44, 0.44, 0.44], color: '#6b4a2b' },
      ];
    case 'table':
      return [
        { kind: 'box', c: [0, 0.75, 0], s: [1.6, 0.07, 0.9], color },
        { kind: 'box', c: [-0.72, 0.36, 0], s: [0.08, 0.72, 0.8], color: '#6b4a2b' },
        { kind: 'box', c: [0.72, 0.36, 0], s: [0.08, 0.72, 0.8], color: '#6b4a2b' },
      ];
    case 'lantern':
      return [
        { kind: 'cylinder', c: [0, 0.1, 0], s: [0.4, 0.2, 0.4], color: '#3b3f48' },
        { kind: 'cylinder', c: [0, 1.05, 0], s: [0.08, 1.9, 0.08], color: '#3b3f48' },
        { kind: 'box', c: [0, 2.13, 0], s: [0.34, 0.42, 0.34], color: color ?? '#ffd27a', glow: true },
        { kind: 'cone', c: [0, 2.5, 0], s: [0.5, 0.2, 0.5], color: '#3b3f48' },
      ];
    case 'tree':
      return [
        { kind: 'cylinder', c: [0, 1.2, 0], s: [0.4, 2.4, 0.4], color: '#6b4a2b' },
        { kind: 'sphere', c: [0, 3.5, 0], s: [3, 2.8, 3], color: color ?? '#4fa83a' },
      ];
    case 'rock':
      return [{ kind: 'sphere', c: [0, 0.3, 0], s: [1, 0.7, 1], color: color ?? '#8d8f93' }];
    case 'sign':
      return [
        { kind: 'box', c: [0, 0.75, 0], s: [0.1, 1.5, 0.1], color: '#6b4a2b' },
        { kind: 'box', c: [0, 1.5, 0], s: [1.4, 0.8, 0.06], color: color ?? '#f0e2b0' },
      ];
    case 'light':
      return [{ kind: 'sphere', c: [0, 0, 0], s: [0.3, 0.3, 0.3], color: color ?? '#fff1c4', glow: true }];
    case 'avatar-spawn':
      return [{ kind: 'cylinder', c: [0, 0.02, 0], s: [1.3, 0.04, 1.3], color: color ?? '#4da3ff' }];
    default:
      return [{ kind: 'box', c: [0, 0.5, 0], s: [1, 1, 1], color }];
  }
}

const PRIMITIVES = new Set(['box', 'cylinder', 'cone', 'sphere', 'plane', 'torus']);

/** Alle Körper eines Bausteins in Weltkoordinaten des Bausteins. */
export function solidsOf(entities: EntitySpec[]): Solid[] {
  const out: Solid[] = [];
  for (const e of entities) {
    const short = e.ref.replace('EntitySpec.', '');
    const { pos, rot, scale } = e.transform;
    const glow = !!e.material?.emissive && e.material.emissive !== '#000000';
    if (PRIMITIVES.has(short)) {
      const kind: Kind = short === 'plane' ? 'box' : short === 'torus' ? 'cylinder' : (short as Kind);
      const size: Vec3 = short === 'plane' ? [scale[0], 0.05 * scale[1], scale[2]] : short === 'torus' ? [scale[0], 0.3 * scale[1], scale[2]] : [scale[0], scale[1], scale[2]];
      out.push({ kind, center: pos, size, rot, color: e.material?.color ?? '#cccccc', glow });
      continue;
    }
    for (const p of proxies(e)) {
      const local: Vec3 = [p.c[0] * scale[0], p.c[1] * scale[1], p.c[2] * scale[2]];
      const r = rotateVec(rot, local);
      out.push({
        kind: p.kind,
        center: [pos[0] + r[0], pos[1] + r[1], pos[2] + r[2]],
        size: [p.s[0] * scale[0], p.s[1] * scale[1], p.s[2] * scale[2]],
        rot,
        color: p.color ?? e.material?.color ?? '#cccccc',
        glow: p.glow ?? glow,
      });
    }
  }
  return out;
}

/** Zerlegt Körper in Flächen (Weltkoordinaten, Normale nach außen). */
export function polygonsOf(solids: Solid[]): Poly[] {
  const polys: Poly[] = [];
  for (const s of solids) {
    const base = hexToRgb(s.color, [200, 200, 200]);
    const to = (p: Vec3): Vec3 => {
      const r = rotateVec(s.rot, p);
      return [s.center[0] + r[0], s.center[1] + r[1], s.center[2] + r[2]];
    };
    const [hx, hy, hz] = [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2];
    const add = (local: Vec3[]) => {
      const pts = local.map(to);
      let normal = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      const centroid: Vec3 = [0, 0, 0];
      for (const p of pts) for (let i = 0; i < 3; i++) centroid[i] += p[i] / pts.length;
      if (dot(normal, sub(centroid, s.center)) < 0) normal = [-normal[0], -normal[1], -normal[2]];
      polys.push({ pts, normal, color: base, glow: s.glow });
    };
    if (s.kind === 'box') {
      const c: Vec3[] = [];
      for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) c.push([x, y, z]);
      // Index = x*4 + y*2 + z
      for (const f of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) add(f.map((i) => c[i]));
    } else if (s.kind === 'cylinder' || s.kind === 'cone') {
      const n = 14;
      const ring = (y: number, k: number): Vec3 => [Math.cos(k) * hx * (y > 0 && s.kind === 'cone' ? 0 : 1), y, Math.sin(k) * hz * (y > 0 && s.kind === 'cone' ? 0 : 1)];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const b = ((i + 1) / n) * Math.PI * 2;
        add(s.kind === 'cone' ? [ring(-hy, a), ring(-hy, b), ring(hy, b)] : [ring(-hy, a), ring(-hy, b), ring(hy, b), ring(hy, a)]);
      }
      if (s.kind === 'cylinder') add(Array.from({ length: n }, (_, i) => ring(hy, (i / n) * Math.PI * 2)));
    } else {
      const lat = 6;
      const lon = 12;
      const pt = (i: number, j: number): Vec3 => {
        const th = (i / lat) * Math.PI;
        const ph = (j / lon) * Math.PI * 2;
        return [Math.sin(th) * Math.cos(ph) * hx, Math.cos(th) * hy, Math.sin(th) * Math.sin(ph) * hz];
      };
      for (let i = 0; i < lat; i++)
        for (let j = 0; j < lon; j++) {
          const quad = i === 0 ? [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1)] : i === lat - 1 ? [pt(i, j), pt(i + 1, j), pt(i, j + 1)] : [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
          add(quad);
        }
    }
  }
  return polys;
}

const YAW = (-38 * Math.PI) / 180;
const PITCH = (28 * Math.PI) / 180;
const LIGHT = norm([-0.45, 0.85, 0.35]);

function toCamera(v: Vec3): { x: number; y: number; depth: number } {
  const c = Math.cos(YAW);
  const s = Math.sin(YAW);
  const x1 = v[0] * c + v[2] * s;
  const z1 = -v[0] * s + v[2] * c;
  return { x: x1, y: v[1] * Math.cos(PITCH) + z1 * Math.sin(PITCH), depth: z1 * Math.cos(PITCH) - v[1] * Math.sin(PITCH) };
}

export interface DrawnPoly {
  xy: [number, number][];
  depth: number;
  fill: string;
}
/** Projiziert Flächen, entfernt Rückseiten, sortiert von hinten nach vorn. Maße in Metern (y nach oben). */
export function projectPolygons(polys: Poly[]): { drawn: DrawnPoly[]; bounds: { minX: number; maxX: number; minY: number; maxY: number } } {
  const drawn: DrawnPoly[] = [];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const toViewer: Vec3 = [0, Math.sin(PITCH), -Math.cos(PITCH)];
  for (const p of polys) {
    const cam = p.pts.map(toCamera);
    for (const c of cam) {
      bounds.minX = Math.min(bounds.minX, c.x);
      bounds.maxX = Math.max(bounds.maxX, c.x);
      bounds.minY = Math.min(bounds.minY, c.y);
      bounds.maxY = Math.max(bounds.maxY, c.y);
    }
    const nc = Math.cos(YAW);
    const ns = Math.sin(YAW);
    const n1: Vec3 = [p.normal[0] * nc + p.normal[2] * ns, p.normal[1], -p.normal[0] * ns + p.normal[2] * nc];
    if (dot(n1, toViewer) <= 1e-4) continue;
    const lit = Math.max(0, dot(p.normal, LIGHT));
    const k = p.glow ? 1.15 : 0.5 + 0.55 * lit;
    const col = p.color.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
    drawn.push({ xy: cam.map((c) => [c.x, c.y]), depth: cam.reduce((a, c) => a + c.depth, 0) / cam.length, fill: `rgb(${col[0]},${col[1]},${col[2]})` });
  }
  drawn.sort((a, b) => b.depth - a.depth);
  return { drawn, bounds };
}

/** Rendert das Vorschaubild; liefert `undefined`, wenn kein Canvas verfügbar ist (z. B. in Tests). */
export function renderThumbnail(entities: EntitySpec[]): string | undefined {
  if (typeof document === 'undefined' || entities.length === 0) return undefined;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const g = canvas.getContext('2d');
    if (!g) return undefined;
    const sky = g.createLinearGradient(0, 0, 0, THUMB_H);
    sky.addColorStop(0, '#9fd0f5');
    sky.addColorStop(1, '#dff0e3');
    g.fillStyle = sky;
    g.fillRect(0, 0, THUMB_W, THUMB_H);
    const solids = solidsOf(entities);
    const { drawn, bounds } = projectPolygons(polygonsOf(solids));
    if (drawn.length === 0 || !isFinite(bounds.minX)) return canvas.toDataURL('image/jpeg', 0.82);
    const pad = 16;
    const w = bounds.maxX - bounds.minX || 1;
    const h = bounds.maxY - bounds.minY || 1;
    const scale = Math.min((THUMB_W - pad * 2) / w, (THUMB_H - pad * 2) / h);
    const ox = THUMB_W / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
    const oy = THUMB_H / 2 + ((bounds.minY + bounds.maxY) / 2) * scale;
    const px = (p: [number, number]): [number, number] => [ox + p[0] * scale, oy - p[1] * scale];
    // Bodenfleck unter dem Baustein
    const ground = solids.length ? toCamera([0, 0, 0]) : { x: 0, y: 0 };
    g.fillStyle = 'rgba(70,110,70,0.35)';
    g.beginPath();
    g.ellipse(ox + ground.x * scale, oy - ground.y * scale, (w * scale) / 2.1, Math.max(8, (h * scale) / 7), 0, 0, Math.PI * 2);
    g.fill();
    g.lineJoin = 'round';
    for (const d of drawn) {
      g.beginPath();
      d.xy.forEach((p, i) => {
        const [x, y] = px(p);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.closePath();
      g.fillStyle = d.fill;
      g.fill();
      g.strokeStyle = d.fill;
      g.lineWidth = 0.8;
      g.stroke();
    }
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return undefined;
  }
}

/** Platzhalter mit Namen und Farbfläche, falls kein Vorschaubild erzeugt werden kann. */
export function placeholderThumbnail(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const g = canvas.getContext('2d');
    if (!g) return undefined;
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    g.fillStyle = `hsl(${h},45%,38%)`;
    g.fillRect(0, 0, THUMB_W, THUMB_H);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 72px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText((name.trim()[0] ?? '?').toUpperCase(), THUMB_W / 2, THUMB_H / 2);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return undefined;
  }
}
