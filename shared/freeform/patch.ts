/**
 * Kontrollpunkt-Fläche: tensorproduktische B-Spline-Fläche (geklemmte, gleichförmige Knoten; bei Grad = n−1 ergibt das
 * eine Bézier-Fläche, bei Grad 1 ein bilineares Gitter durch die Punkte). Reine Rechnung ohne Babylon.
 *
 * Konventionen:
 * - `grid[zeile][spalte]`: Spalte = u-Richtung, Zeile = v-Richtung.
 * - Vorderseite: Wächst das Gitter in x nach rechts und in z nach hinten, zeigt die Vorderseite nach +y (Babylon, links-händig:
 *   Dreieck im Uhrzeigersinn von der Vorderseite gesehen; Dreiecks-Normale = (b−a)×(c−a)). Die Rückseite (Dicke) zeigt nach −y.
 * - UVs sind in Metern (Bogenlängen-Näherung entlang der Gitterlinien), damit Texturen nicht verzerren.
 * - Dicke > 0: Rückseite um `thickness` entgegen der Vorderseiten-Normalen versetzt, plus Randstreifen (geschlossener Körper).
 */
import { FREEFORM_LIMITS, type MeshData, type PatchParams, type Vec3 } from './types';

const DEFAULT_SUBDIV = 24;

/** Gewichte aller n Kontrollpunkte für Parameter t in [0,1] (Cox–de-Boor, geklemmte Knoten). */
function basisWeights(n: number, degree: number, t: number): number[] {
  const p = degree;
  const knots: number[] = [];
  const inner = n - p; // Anzahl Knotenintervalle
  for (let i = 0; i < n + p + 1; i++) {
    if (i <= p) knots.push(0);
    else if (i >= n) knots.push(1);
    else knots.push((i - p) / inner);
  }
  let span = p;
  while (span < n - 1 && t >= knots[span + 1]) span++;
  const N = new Array<number>(p + 1).fill(0);
  const left = new Array<number>(p + 1).fill(0);
  const right = new Array<number>(p + 1).fill(0);
  N[0] = 1;
  for (let j = 1; j <= p; j++) {
    left[j] = t - knots[span + 1 - j];
    right[j] = knots[span + j] - t;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const d = right[r + 1] + left[j - r];
      const tmp = d === 0 ? 0 : N[r] / d;
      N[r] = saved + right[r + 1] * tmp;
      saved = left[j - r] * tmp;
    }
    N[j] = saved;
  }
  const w = new Array<number>(n).fill(0);
  for (let j = 0; j <= p; j++) w[span - p + j] = N[j];
  return w;
}

function validate(params: PatchParams): void {
  const grid = params.grid;
  if (!Array.isArray(grid) || grid.length < 2) throw new Error('Kontrollpunkt-Fläche: mindestens 2×2 Punkte nötig.');
  const cols = Array.isArray(grid[0]) ? grid[0].length : 0;
  if (cols < 2) throw new Error('Kontrollpunkt-Fläche: mindestens 2×2 Punkte nötig.');
  if (grid.length > FREEFORM_LIMITS.maxGrid || cols > FREEFORM_LIMITS.maxGrid) {
    throw new Error(`Kontrollpunkt-Fläche: höchstens ${FREEFORM_LIMITS.maxGrid} Punkte je Richtung.`);
  }
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== cols) throw new Error('Kontrollpunkt-Fläche: alle Zeilen müssen gleich lang sein.');
    for (const p of row) {
      if (!Array.isArray(p) || p.length < 3 || !p.slice(0, 3).every((c) => typeof c === 'number' && Number.isFinite(c))) {
        throw new Error('Kontrollpunkt-Fläche: Punkte müssen endliche Zahlen [x, y, z] sein.');
      }
    }
  }
  const t = params.thickness;
  if (t !== undefined && (typeof t !== 'number' || !Number.isFinite(t) || t < 0)) {
    throw new Error('Kontrollpunkt-Fläche: Dicke muss eine endliche Zahl ≥ 0 sein.');
  }
}

function clampSub(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : DEFAULT_SUBDIV;
  return Math.max(1, Math.min(64, n));
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(a: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : fallback;
}

export function buildPatch(params: PatchParams): MeshData {
  validate(params);
  const grid = params.grid;
  const rows = grid.length;
  const cols = grid[0].length;
  const deg = params.degree === 1 || params.degree === 2 || params.degree === 3 ? params.degree : 3;
  const degU = Math.min(deg, cols - 1);
  const degV = Math.min(deg, rows - 1);
  let su = clampSub(params.subdivisions?.[0]);
  let sv = clampSub(params.subdivisions?.[1]);
  const thickness = params.thickness ?? 0;
  const solid = thickness > 0;
  // Vertexzahl: Vorderseite (+ Rückseite + vier Randstreifen mit je 2 Reihen).
  const count = (a: number, b: number): number => (a + 1) * (b + 1) * (solid ? 2 : 1) + (solid ? 4 * ((a + 1) + (b + 1)) : 0);
  while (count(su, sv) > FREEFORM_LIMITS.maxVertices && (su > 1 || sv > 1)) {
    if (su >= sv) su--;
    else sv--;
  }

  const nu = su + 1;
  const nv = sv + 1;
  const wu: number[][] = [];
  const wv: number[][] = [];
  for (let i = 0; i < nu; i++) wu.push(basisWeights(cols, degU, i / su));
  for (let j = 0; j < nv; j++) wv.push(basisWeights(rows, degV, j / sv));

  // Positionen der Vorderseite: Index j * nu + i (j = v/Zeile, i = u/Spalte).
  const P: Vec3[] = new Array(nu * nv);
  for (let j = 0; j < nv; j++) {
    const colPts: Vec3[] = [];
    for (let c = 0; c < cols; c++) {
      let x = 0, y = 0, z = 0;
      for (let r = 0; r < rows; r++) {
        const w = wv[j][r];
        if (w === 0) continue;
        const g = grid[r][c];
        x += w * g[0]; y += w * g[1]; z += w * g[2];
      }
      colPts.push([x, y, z]);
    }
    for (let i = 0; i < nu; i++) {
      let x = 0, y = 0, z = 0;
      for (let c = 0; c < cols; c++) {
        const w = wu[i][c];
        if (w === 0) continue;
        x += w * colPts[c][0]; y += w * colPts[c][1]; z += w * colPts[c][2];
      }
      P[j * nu + i] = [x, y, z];
    }
  }

  // Glatte Normalen aus Differenzen der Nachbarn: n = dv × du.
  const at = (i: number, j: number): Vec3 => P[j * nu + i];
  const N: Vec3[] = new Array(nu * nv);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const du = sub(at(Math.min(i + 1, nu - 1), j), at(Math.max(i - 1, 0), j));
      const dv = sub(at(i, Math.min(j + 1, nv - 1)), at(i, Math.max(j - 1, 0)));
      N[j * nu + i] = norm(cross(dv, du));
    }
  }

  // UVs in Metern (kumulierte Länge entlang der Gitterlinien).
  const U: number[] = new Array(nu * nv);
  const V: number[] = new Array(nu * nv);
  for (let j = 0; j < nv; j++) {
    U[j * nu] = 0;
    for (let i = 1; i < nu; i++) U[j * nu + i] = U[j * nu + i - 1] + len(sub(at(i, j), at(i - 1, j)));
  }
  for (let i = 0; i < nu; i++) {
    V[i] = 0;
    for (let j = 1; j < nv; j++) V[j * nu + i] = V[(j - 1) * nu + i] + len(sub(at(i, j), at(i, j - 1)));
  }

  const out: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const push = (p: Vec3, n: Vec3, u: number, v: number): number => {
    out.positions.push(p[0], p[1], p[2]);
    out.normals.push(n[0], n[1], n[2]);
    out.uvs.push(u, v);
    return out.positions.length / 3 - 1;
  };
  const tri = (a: number, b: number, c: number): void => { out.indices.push(a, b, c); };

  // Vorderseite
  for (let k = 0; k < nu * nv; k++) push(P[k], N[k], U[k], V[k]);
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  if (!solid) return out;

  // Rückseite
  const base = nu * nv;
  const B: Vec3[] = P.map((p, k) => [p[0] - N[k][0] * thickness, p[1] - N[k][1] * thickness, p[2] - N[k][2] * thickness]);
  for (let k = 0; k < nu * nv; k++) push(B[k], [-N[k][0], -N[k][1], -N[k][2]], U[k], V[k]);
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = base + j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      tri(a, b, c);
      tri(b, d, c);
    }
  }

  // Randstreifen: Indexfolge der Oberflächenpunkte je Rand; Außenrichtung = vom Flächeninneren weg.
  const col = (i: number): number[] => Array.from({ length: nv }, (_, j) => j * nu + i);
  const row = (j: number): number[] => Array.from({ length: nu }, (_, i) => j * nu + i);
  const edges: Array<{ idx: number[]; out: (k: number) => Vec3 }> = [
    { idx: col(0), out: (k) => sub(P[k], at(1, Math.floor(k / nu))) },
    { idx: col(nu - 1), out: (k) => sub(P[k], at(nu - 2, Math.floor(k / nu))) },
    { idx: row(0), out: (k) => sub(P[k], at(k % nu, 1)) },
    { idx: row(nv - 1), out: (k) => sub(P[k], at(k % nu, nv - 2)) },
  ];
  for (const e of edges) {
    const start = out.positions.length / 3;
    let acc = 0;
    e.idx.forEach((k, s) => {
      if (s > 0) acc += len(sub(P[k], P[e.idx[s - 1]]));
      const o = e.out(k);
      const d = dot(o, N[k]);
      const n = norm(sub(o, [N[k][0] * d, N[k][1] * d, N[k][2] * d]), [1, 0, 0]);
      push(P[k], n, acc, 0);
      push(B[k], n, acc, thickness);
    });
    for (let s = 0; s < e.idx.length - 1; s++) {
      const f0 = start + 2 * s, b0 = f0 + 1, f1 = f0 + 2, b1 = f0 + 3;
      // Umlaufrichtung geometrisch so wählen, dass die Dreiecks-Normale nach außen zeigt.
      const pa = out.positions.slice(f0 * 3, f0 * 3 + 3) as Vec3;
      const pb = out.positions.slice(b0 * 3, b0 * 3 + 3) as Vec3;
      const pc = out.positions.slice(f1 * 3, f1 * 3 + 3) as Vec3;
      const nOut = out.normals.slice(f0 * 3, f0 * 3 + 3) as Vec3;
      if (dot(cross(sub(pb, pa), sub(pc, pa)), nOut) >= 0) {
        tri(f0, b0, f1);
        tri(f1, b0, b1);
      } else {
        tri(f0, f1, b0);
        tri(f1, b1, b0);
      }
    }
  }
  return out;
}
