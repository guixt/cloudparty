import type { MeshData, Vec3 } from './types';

/** Achsenparalleler Quader als Netz (Platzhalter und Hilfe für Tests). Fläche außen, UVs 0–1 je Seite. */
export function boxMeshData(min: Vec3, max: Vec3): MeshData {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces: Array<{ n: Vec3; v: Vec3[] }> = [
    { n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { n: [1, 0, 0], v: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { n: [-1, 0, 0], v: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { n: [0, 1, 0], v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { n: [0, -1, 0], v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  ];
  const out: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  faces.forEach((f, i) => {
    f.v.forEach((p, k) => {
      out.positions.push(...p);
      out.normals.push(...f.n);
      out.uvs.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
    });
    const b = i * 4;
    out.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return out;
}

/** Achsenparallele Hülle eines Netzes. */
export function meshBounds(m: MeshData): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], m.positions[i + k]);
      max[k] = Math.max(max[k], m.positions[i + k]);
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}
