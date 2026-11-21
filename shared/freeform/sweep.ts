/**
 * Sweep: Wand/Platte (Rechteck-Querschnitt Dicke × Höhe) entlang eines Grundriss-Pfades.
 * Höhe verläuft linear von `height` zu `heightEnd` (bei geschlossenem Pfad konstant = height), die Dicke liegt symmetrisch
 * zur Pfadmitte. UVs: u = Länge entlang des Pfades in Metern, v = Höhe in Metern (Seiten) bzw. Position quer (oben/unten).
 */
import { FREEFORM_LIMITS, type MeshData, type SweepParams, type Vec2 } from './types';
import { MeshBuilder } from './meshBuilder';
import { buildPolyline, segmentFrames, type PathPolyline } from './path';

const MAX_MITER = 3;
/** Eckpunkte je Spalte: 8 Vertices (links/rechts unten+oben, Oberseite l/r, Unterseite l/r). */
const VERTS_PER_COL = 8;

interface Col {
  x: number;
  z: number;
  /** Versatz zur linken Seite je Meter halbe Dicke (Gehrung, länger als 1 an Ecken). */
  mx: number;
  mz: number;
  /** Schattierungsnormale (links, Länge 1). */
  nx: number;
  nz: number;
  L: number;
}

export function buildSweep(params: SweepParams): MeshData {
  const closed = !!params.closedPath;
  const thick = params.thickness;
  const y0 = params.y0 ?? 0;
  const h0 = params.height;
  const h1 = closed ? h0 : (params.heightEnd ?? h0);
  const wave = params.wave && params.wave.amplitude !== 0 && params.wave.length > 0 ? params.wave : undefined;

  // Verdichtung so wählen, dass maxVertices nicht überschritten wird.
  let segments = Math.max(1, Math.floor(params.segments ?? 12));
  let maxStep = wave ? Math.max(wave.length / 8, 0.005) : 0;
  let poly: PathPolyline = buildPolyline(params.path, { closed, segments, maxStep });
  for (let attempt = 0; attempt < 24; attempt++) {
    const est = (poly.pts.length + poly.corner.filter(Boolean).length + 1) * VERTS_PER_COL + 8;
    if (est <= FREEFORM_LIMITS.maxVertices) break;
    segments = Math.max(1, Math.floor(segments / 2));
    maxStep = maxStep ? maxStep * 2 : poly.total / 2000;
    poly = buildPolyline(params.path, { closed, segments, maxStep });
  }

  const out = new MeshBuilder();
  const n = poly.pts.length;
  if (n < 2 || poly.total < 1e-9) return out.toMeshData();
  const total = poly.total;

  // Welle: Versatz senkrecht zum Pfad (bei geschlossenem Pfad nahtlos periodisch).
  let pts: Vec2[] = poly.pts;
  if (wave) {
    let lambda = wave.length;
    if (closed) lambda = total / Math.max(1, Math.round(total / lambda));
    pts = poly.pts.map((p, i) => {
      const off = wave.amplitude * Math.sin((2 * Math.PI * poly.cum[i]) / lambda);
      return [p[0] + poly.normals[i][0] * off, p[1] + poly.normals[i][1] * off] as Vec2;
    });
  }

  const { dir, nrm } = segmentFrames(pts, closed);
  const nSeg = dir.length;
  const m = closed ? n : n - 1; // Index der letzten Spalte
  const half = thick / 2;

  const makeCol = (v: number, k: number, role: 'start' | 'end' | 'both'): Col => {
    const prev = closed ? (v - 1 + n) % n : v - 1;
    const next = v; // Segment v beginnt an Punkt v
    const hasPrev = closed || v > 0;
    const hasNext = closed || v < n - 1;
    const pn = hasPrev ? nrm[prev] : undefined;
    const nn = hasNext ? nrm[next] : undefined;
    let mx: number, mz: number;
    if (pn && nn) {
      const sx = pn[0] + nn[0];
      const sz = pn[1] + nn[1];
      const sl = Math.hypot(sx, sz);
      if (sl < 1e-6) {
        mx = nn[0];
        mz = nn[1];
      } else {
        const ux = sx / sl;
        const uz = sz / sl;
        const scale = Math.min(MAX_MITER, 1 / Math.max(1e-6, ux * nn[0] + uz * nn[1]));
        mx = ux * scale;
        mz = uz * scale;
      }
    } else {
      const s = (pn ?? nn) as Vec2;
      mx = s[0];
      mz = s[1];
    }
    let sh: Vec2;
    if (pn && nn) {
      if (poly.corner[v]) sh = role === 'end' ? pn : nn;
      else {
        const sx = pn[0] + nn[0];
        const sz = pn[1] + nn[1];
        const sl = Math.hypot(sx, sz) || 1;
        sh = [sx / sl, sz / sl];
      }
    } else sh = (pn ?? nn) as Vec2;
    return { x: pts[v][0], z: pts[v][1], mx, mz, nx: sh[0], nz: sh[1], L: closed && k === n ? total : poly.cum[v] };
  };

  // Spalten: Start-/Endspalte je Index (an Ecken getrennt, sonst gemeinsam).
  const colStart: Col[] = [];
  const colEnd: Col[] = [];
  for (let k = 0; k <= m; k++) {
    const v = k % n;
    if (k === 0) colStart[k] = makeCol(v, k, 'start');
    else if (k === m) colEnd[k] = makeCol(v, k, 'end');
    else if (poly.corner[v]) {
      colStart[k] = makeCol(v, k, 'start');
      colEnd[k] = makeCol(v, k, 'end');
    } else colStart[k] = colEnd[k] = makeCol(v, k, 'both');
  }

  const slope = (h1 - h0) / total;
  const ids = new Map<Col, number[]>();
  const verts = (c: Col): number[] => {
    const hit = ids.get(c);
    if (hit) return hit;
    const H = h0 + (h1 - h0) * (c.L / total);
    const yb = y0;
    const yt = y0 + H;
    const lx = c.x + c.mx * half;
    const lz = c.z + c.mz * half;
    const rx = c.x - c.mx * half;
    const rz = c.z - c.mz * half;
    // Tangente (Pfadrichtung) aus der Normalen; Oberseite folgt dem Höhenverlauf.
    const tx = c.nz;
    const tz = -c.nx;
    const up: [number, number, number] = [-slope * tx, 1, -slope * tz];
    const res = [
      out.vertex([lx, yb, lz], [c.nx, 0, c.nz], [c.L, 0]),
      out.vertex([lx, yt, lz], [c.nx, 0, c.nz], [c.L, H]),
      out.vertex([rx, yb, rz], [-c.nx, 0, -c.nz], [c.L, 0]),
      out.vertex([rx, yt, rz], [-c.nx, 0, -c.nz], [c.L, H]),
      out.vertex([lx, yt, lz], up, [c.L, thick]),
      out.vertex([rx, yt, rz], up, [c.L, 0]),
      out.vertex([lx, yb, lz], [0, -1, 0], [c.L, thick]),
      out.vertex([rx, yb, rz], [0, -1, 0], [c.L, 0]),
    ];
    ids.set(c, res);
    return res;
  };

  for (let j = 0; j < nSeg; j++) {
    const a = verts(colStart[j]);
    const b = verts(colEnd[j + 1]);
    out.quad(a[0], b[0], b[1], a[1]); // links
    out.quad(a[2], b[2], b[3], a[3]); // rechts
    out.quad(a[4], b[4], b[5], a[5]); // oben
    out.quad(a[6], b[6], b[7], a[7]); // unten
  }

  // Stirnflächen an offenen Enden.
  if (!closed) {
    const cap = (c: Col, d: Vec2, sign: 1 | -1): void => {
      const H = h0 + (h1 - h0) * (c.L / total);
      const nrmv: [number, number, number] = [d[0] * sign, 0, d[1] * sign];
      const lx = c.x + c.mx * half;
      const lz = c.z + c.mz * half;
      const rx = c.x - c.mx * half;
      const rz = c.z - c.mz * half;
      const a = out.vertex([lx, y0, lz], nrmv, [thick, 0]);
      const b = out.vertex([rx, y0, rz], nrmv, [0, 0]);
      const cc = out.vertex([rx, y0 + H, rz], nrmv, [0, H]);
      const d2 = out.vertex([lx, y0 + H, lz], nrmv, [thick, H]);
      out.quad(a, b, cc, d2);
    };
    cap(colStart[0], dir[0], -1);
    cap(colEnd[m], dir[nSeg - 1], 1);
  }

  return out.toMeshData();
}
