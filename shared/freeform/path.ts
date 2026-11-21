/**
 * Grundriss-Pfade: aus `PathPoint[]` (mit Bogen-Pfeilhöhe `bulge`) wird eine dichte Polylinie samt Tangenten, Normalen
 * und kumulativer Länge. Koordinaten [x, z]; „links“ in Laufrichtung = (-dz, dx), also bei Richtung +x die Seite +z.
 */
import type { PathPoint, Vec2 } from './types';

export interface PathOptions {
  closed?: boolean;
  /** Teile je Bogen (Standard 12). */
  segments?: number;
  /** Größter Abstand zweier Punkte in Metern (verdichtet gerade Stücke und Bögen, z. B. für Wellen). */
  maxStep?: number;
}

export interface PathPolyline {
  pts: Vec2[];
  /** true an ursprünglichen Punkten mit deutlichem Knick (Tangentenwinkel > 30°). */
  corner: boolean[];
  closed: boolean;
  /** Kumulierte Länge je Punkt (cum[0] = 0). */
  cum: number[];
  /** Gesamtlänge (bei geschlossenem Pfad inklusive des Schlusssegments). */
  total: number;
  /** Geglättete Tangente je Punkt (Länge 1). */
  tangents: Vec2[];
  /** Linke Normale je Punkt (Länge 1). */
  normals: Vec2[];
}

export interface ArcInfo {
  /** Radius; Infinity bei gerader Strecke. */
  radius: number;
  center: Vec2;
  /** Überstrichener Winkel im Bogenmaß (>= 0). */
  angle: number;
  /** Bogenlänge. */
  length: number;
}

const CORNER_RAD = (30 * Math.PI) / 180;

/** Radius aus Sehne c und Pfeilhöhe s: r = (c²/4 + s²) / (2s). */
export function arcRadius(chord: number, sagitta: number): number {
  const s = Math.abs(sagitta);
  if (s < 1e-9) return Infinity;
  return (chord * chord / 4 + s * s) / (2 * s);
}

/** Bogen von a nach b mit Pfeilhöhe `bulge` (positiv = links). */
export function arcBetween(a: Vec2, b: Vec2, bulge: number): ArcInfo {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const c = Math.hypot(dx, dz);
  if (c < 1e-12 || Math.abs(bulge) < 1e-9) return { radius: Infinity, center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], angle: 0, length: c };
  const r = arcRadius(c, bulge);
  const sgn = Math.sign(bulge);
  const nx = -dz / c;
  const nz = dx / c;
  const off = Math.abs(bulge) - r; // Mitte liegt auf der Gegenseite der Wölbung
  const center: Vec2 = [(a[0] + b[0]) / 2 + sgn * nx * off, (a[1] + b[1]) / 2 + sgn * nz * off];
  const angle = 4 * Math.atan((2 * Math.abs(bulge)) / c);
  return { radius: r, center, angle, length: r * angle };
}

function rot(d: Vec2, th: number): Vec2 {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
}

function norm2(x: number, z: number): Vec2 {
  const l = Math.hypot(x, z);
  return l > 1e-12 ? [x / l, z / l] : [1, 0];
}

/** Richtungen und linke Normalen je Segment (Segment j: pts[j] → pts[(j+1) % n]; offen n-1, geschlossen n Segmente). */
export function segmentFrames(pts: Vec2[], closed: boolean): { dir: Vec2[]; nrm: Vec2[] } {
  const n = pts.length;
  const count = closed ? n : n - 1;
  const dir: Vec2[] = [];
  const nrm: Vec2[] = [];
  for (let j = 0; j < count; j++) {
    const a = pts[j];
    const b = pts[(j + 1) % n];
    const d = norm2(b[0] - a[0], b[1] - a[1]);
    dir.push(d);
    nrm.push([-d[1], d[0]]);
  }
  return { dir, nrm };
}

/** Geglättete Tangenten und linke Normalen je Punkt aus den Segmentrichtungen. */
export function vertexFrames(pts: Vec2[], closed: boolean): { tangents: Vec2[]; normals: Vec2[] } {
  const n = pts.length;
  const { dir } = segmentFrames(pts, closed);
  const tangents: Vec2[] = [];
  const normals: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? dir[(i - 1 + n) % n] : i > 0 ? dir[i - 1] : undefined;
    const next = closed ? dir[i] : i < n - 1 ? dir[i] : undefined;
    let t: Vec2;
    if (prev && next) {
      t = Math.hypot(prev[0] + next[0], prev[1] + next[1]) < 1e-9 ? next : norm2(prev[0] + next[0], prev[1] + next[1]);
    } else t = prev ?? next ?? [1, 0];
    tangents.push(t);
    normals.push([-t[1], t[0]]);
  }
  return { tangents, normals };
}

/** Wandelt den Pfad in eine dichte Polylinie um. Aufeinanderfolgende Duplikate werden entfernt. */
export function buildPolyline(points: PathPoint[], opts: PathOptions = {}): PathPolyline {
  const closed = !!opts.closed;
  const segments = Math.max(1, Math.floor(opts.segments ?? 12));
  const maxStep = opts.maxStep && opts.maxStep > 0 ? opts.maxStep : 0;

  // Duplikate entfernen (der frühere Punkt behält seinen bulge).
  const src: PathPoint[] = [];
  for (const q of points) {
    const last = src[src.length - 1];
    if (last && Math.hypot(q.p[0] - last.p[0], q.p[1] - last.p[1]) < 1e-9) continue;
    src.push(q);
  }
  while (closed && src.length > 1 && Math.hypot(src[0].p[0] - src[src.length - 1].p[0], src[0].p[1] - src[src.length - 1].p[1]) < 1e-9) src.pop();

  const n = src.length;
  const pts: Vec2[] = [];
  const segCount = n < 2 ? 0 : closed ? n : n - 1;
  const startTan: Vec2[] = [];
  const endTan: Vec2[] = [];
  const origIndex: number[] = [];

  for (let j = 0; j < segCount; j++) {
    const a = src[j].p;
    const b = src[(j + 1) % n].p;
    const bulge = Number.isFinite(src[j].bulge) ? (src[j].bulge as number) : 0;
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = norm2(b[0] - a[0], b[1] - a[1]);
    origIndex.push(pts.length);
    pts.push([a[0], a[1]]);
    const arc = arcBetween(a, b, bulge);
    if (arc.radius === Infinity) {
      startTan.push(d);
      endTan.push(d);
      const parts = maxStep ? Math.max(1, Math.ceil(chord / maxStep)) : 1;
      for (let i = 1; i < parts; i++) {
        const t = i / parts;
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    } else {
      const sgn = Math.sign(bulge);
      startTan.push(rot(d, (sgn * arc.angle) / 2));
      endTan.push(rot(d, (-sgn * arc.angle) / 2));
      const parts = Math.max(segments, maxStep ? Math.ceil(arc.length / maxStep) : 0);
      const a0 = Math.atan2(a[1] - arc.center[1], a[0] - arc.center[0]);
      for (let i = 1; i < parts; i++) {
        const ang = a0 - sgn * arc.angle * (i / parts);
        pts.push([arc.center[0] + arc.radius * Math.cos(ang), arc.center[1] + arc.radius * Math.sin(ang)]);
      }
    }
  }
  if (n >= 1 && !closed) {
    origIndex.push(pts.length);
    pts.push([src[n - 1].p[0], src[n - 1].p[1]]);
  }

  const corner: boolean[] = pts.map(() => false);
  for (let v = 0; v < n && segCount > 0; v++) {
    const inT = closed ? endTan[(v - 1 + n) % n] : v > 0 ? endTan[v - 1] : undefined;
    const outT = closed ? startTan[v] : v < n - 1 ? startTan[v] : undefined;
    if (!inT || !outT) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, inT[0] * outT[0] + inT[1] * outT[1])));
    if (ang > CORNER_RAD) corner[origIndex[v]] = true;
  }

  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let total = cum[cum.length - 1] ?? 0;
  if (closed && pts.length > 1) total += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);

  const frames = pts.length >= 2 ? vertexFrames(pts, closed) : { tangents: pts.map((): Vec2 => [1, 0]), normals: pts.map((): Vec2 => [0, 1]) };
  return { pts, corner, closed, cum, total, tangents: frames.tangents, normals: frames.normals };
}
