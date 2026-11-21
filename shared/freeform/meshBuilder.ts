/** Kleiner Netz-Sammler für Freiform-Geometrie: Dreiecke werden passend zur Vertex-Normalen ausgerichtet. */
import type { MeshData, Vec2, Vec3 } from './types';

export class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /** Fügt einen Vertex hinzu; die Normale wird normiert (Nullvektor wird zu +Y). */
  vertex(p: Vec3, n: Vec3, uv: Vec2): number {
    const len = Math.hypot(n[0], n[1], n[2]);
    this.positions.push(p[0], p[1], p[2]);
    if (len > 1e-12) this.normals.push(n[0] / len, n[1] / len, n[2] / len);
    else this.normals.push(0, 1, 0);
    this.uvs.push(uv[0], uv[1]);
    return this.vertexCount - 1;
  }

  /** Dreieck; Umlaufsinn so gewählt, dass die geometrische Normale zu den Vertex-Normalen zeigt. Entartete Dreiecke entfallen. */
  tri(a: number, b: number, c: number): void {
    const P = this.positions;
    const N = this.normals;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-24) return;
    const sx = N[a * 3] + N[b * 3] + N[c * 3];
    const sy = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1];
    const sz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (cx * sx + cy * sy + cz * sz < 0) this.indices.push(a, c, b);
    else this.indices.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  toMeshData(): MeshData {
    return { positions: this.positions, normals: this.normals, uvs: this.uvs, indices: this.indices };
  }
}
