/**
 * Drehkörper: Profil [Radius, y] wird um die Y-Achse gedreht. Glatte Normalen, harte Kanten bei Knicks > 40°.
 * UVs: u = Winkelanteil (0–1), v = Profillänge in Metern. Deckel entstehen über Profilpunkte mit Radius 0.
 */
import { FREEFORM_LIMITS, type LatheParams, type MeshData, type Vec2 } from './types';
import { MeshBuilder } from './meshBuilder';

const CORNER_COS = Math.cos((40 * Math.PI) / 180);

interface Row {
  r: number;
  y: number;
  nr: number;
  ny: number;
  v: number;
}

export function buildLathe(params: LatheParams): MeshData {
  // Profil bereinigen (Duplikate entfernen).
  const prof: Vec2[] = [];
  for (const q of params.profile) {
    const last = prof[prof.length - 1];
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 1e-9) continue;
    prof.push([Math.max(0, q[0]), q[1]]);
  }
  const out = new MeshBuilder();
  if (prof.length < 2) return out.toMeshData();

  const sweepDeg = Math.max(0.01, Math.min(360, params.sweepDeg ?? 360));
  const startRad = ((params.startDeg ?? 0) * Math.PI) / 180;
  const sweepRad = (sweepDeg * Math.PI) / 180;
  const ellipse = params.ellipse && params.ellipse > 0 ? params.ellipse : 1;

  // Segmentnormalen (nach außen) und Längen.
  const segN: Vec2[] = [];
  const cum: number[] = [0];
  for (let i = 0; i < prof.length - 1; i++) {
    const dr = prof[i + 1][0] - prof[i][0];
    const dy = prof[i + 1][1] - prof[i][1];
    const len = Math.hypot(dr, dy);
    segN.push([dy / len, -dr / len]);
    cum.push(cum[i] + len);
  }

  // Zeilen: je Profilpunkt eine (glatt) oder zwei (Knick) Zeilen.
  const rowEnd: Row[] = []; // Zeile, die Segment i-1 abschließt
  const rowStart: Row[] = []; // Zeile, die Segment i beginnt
  let rowCount = 0;
  for (let i = 0; i < prof.length; i++) {
    const base = { r: prof[i][0], y: prof[i][1], v: cum[i] };
    const a = i > 0 ? segN[i - 1] : undefined;
    const b = i < segN.length ? segN[i] : undefined;
    if (a && b) {
      const sharp = a[0] * b[0] + a[1] * b[1] < CORNER_COS;
      if (sharp) {
        rowEnd[i] = { ...base, nr: a[0], ny: a[1] };
        rowStart[i] = { ...base, nr: b[0], ny: b[1] };
        rowCount += 2;
      } else {
        const m = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
        rowEnd[i] = rowStart[i] = { ...base, nr: (a[0] + b[0]) / m, ny: (a[1] + b[1]) / m };
        rowCount += 1;
      }
    } else {
      const s = (a ?? b) as Vec2;
      rowEnd[i] = rowStart[i] = { ...base, nr: s[0], ny: s[1] };
      rowCount += 1;
    }
  }

  // Segmentzahl so begrenzen, dass maxVertices nicht überschritten wird.
  let segs = Math.max(1, Math.floor(params.segments ?? 48));
  segs = Math.min(segs, FREEFORM_LIMITS.maxSegments);
  while (segs > 3 && rowCount * (segs + 1) > FREEFORM_LIMITS.maxVertices) segs--;

  const cache = new Map<Row, number[]>();
  const ring = (row: Row): number[] => {
    const hit = cache.get(row);
    if (hit) return hit;
    const ids: number[] = [];
    for (let c = 0; c <= segs; c++) {
      const u = c / segs;
      const ang = startRad + sweepRad * u;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      ids.push(
        out.vertex(
          [row.r * ca, row.y, row.r * ellipse * sa],
          [row.nr * ca, row.ny, (row.nr * sa) / ellipse],
          [u, row.v],
        ),
      );
    }
    cache.set(row, ids);
    return ids;
  };

  for (let i = 0; i < prof.length - 1; i++) {
    const r0 = ring(rowStart[i]);
    const r1 = ring(rowEnd[i + 1]);
    for (let c = 0; c < segs; c++) out.quad(r0[c], r0[c + 1], r1[c + 1], r1[c]);
  }
  return out.toMeshData();
}
