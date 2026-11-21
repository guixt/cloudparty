/** Boolesche Schnitte für Freiformen: zieht Box-, Zylinder- und Kugel-Cutter per JavaScript-CSG vom Netz ab. */
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { CSG } from '@babylonjs/core/Meshes/csg';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { FREEFORM_LIMITS, type CutOp } from '../../../shared/freeform/types';

const finite3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

function validCut(c: CutOp): boolean {
  return (
    !!c &&
    (c.shape === 'box' || c.shape === 'cylinder' || c.shape === 'sphere') &&
    finite3(c.pos) &&
    finite3(c.size) &&
    c.size.every((s) => s > 0) &&
    (c.rotY === undefined || Number.isFinite(c.rotY))
  );
}

/** Temporärer Cutter, als Kind des Netzes (lokale Koordinaten des Netzes). */
function makeCutter(cut: CutOp, parent: Mesh, scene: Scene): Mesh {
  const [sx, sy, sz] = cut.size;
  let m: Mesh;
  if (cut.shape === 'box') m = CreateBox('cutter', { width: sx, height: sy, depth: sz }, scene);
  else if (cut.shape === 'cylinder')
    m = CreateCylinder('cutter', { diameterTop: 1, diameterBottom: 1, height: sy, tessellation: 24 }, scene);
  else m = CreateSphere('cutter', { diameter: 1, segments: 16 }, scene);
  if (cut.shape === 'cylinder') m.scaling.set(sx, 1, sz);
  else if (cut.shape === 'sphere') m.scaling.set(sx, sy, sz);
  m.parent = parent;
  m.position.set(cut.pos[0], cut.pos[1], cut.pos[2]);
  m.rotation.y = ((cut.rotY ?? 0) * Math.PI) / 180;
  m.computeWorldMatrix(true);
  return m;
}

/** Planare Ersatz-UVs nach dominanter Normalenachse (wie `ensureUvs` im Baustein-Master). */
function ensureUvs(mesh: Mesh): void {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!pos) return;
  const count = pos.length / 3;
  const uv = mesh.getVerticesData(VertexBuffer.UVKind);
  if (uv && uv.length === count * 2) return;
  const nor = mesh.getVerticesData(VertexBuffer.NormalKind);
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const nx = Math.abs(nor?.[i * 3] ?? 0);
    const ny = Math.abs(nor?.[i * 3 + 1] ?? 1);
    const nz = Math.abs(nor?.[i * 3 + 2] ?? 0);
    const [u, v] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

/** Vorzeichen des eingeschlossenen Volumens; Babylon-Netze (links-händig, Uhrzeigersinn außen) liefern negative Werte. */
function signedVolume(mesh: Mesh): number {
  const p = mesh.getVerticesData(VertexBuffer.PositionKind);
  const ix = mesh.getIndices();
  if (!p || !ix) return 0;
  let v = 0;
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const a = ix[t] * 3;
    const b = ix[t + 1] * 3;
    const c = ix[t + 2] * 3;
    v +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v;
}

/** Vertauscht die Dreiecks-Umlaufrichtung (Normalen bleiben unberührt). */
function flipWinding(mesh: Mesh): void {
  const ix = mesh.getIndices();
  if (!ix) return;
  const out = Array.from(ix);
  for (let t = 0; t + 2 < out.length; t += 3) [out[t + 1], out[t + 2]] = [out[t + 2], out[t + 1]];
  mesh.setIndices(out);
}

/** Zieht die Schnitte vom Netz ab und liefert das Ergebnisnetz (bei Fehlern das unveränderte Netz). */
export function applyCuts(mesh: Mesh, cuts: readonly CutOp[], scene: Scene): Mesh {
  if (!Array.isArray(cuts) || cuts.length === 0) return mesh;
  let list = cuts;
  if (list.length > FREEFORM_LIMITS.maxCuts) {
    console.warn(
      '[freeform] Schnitt fehlgeschlagen',
      `zu viele Schnitte (${list.length}), nur ${FREEFORM_LIMITS.maxCuts} werden angewandt`,
    );
    list = list.slice(0, FREEFORM_LIMITS.maxCuts);
  }
  let current = mesh;
  for (const cut of list) {
    if (!validCut(cut)) {
      console.warn('[freeform] Schnitt fehlgeschlagen', 'ungültiger Schnitt', cut);
      continue;
    }
    if (current.getTotalVertices() > FREEFORM_LIMITS.maxVertices) {
      console.warn('[freeform] Schnitt fehlgeschlagen', 'Netz zu groß, übersprungen');
      break;
    }
    let cutter: Mesh | null = null;
    // CSG erwartet die Babylon-Umlaufrichtung; verkehrt gewickelte Netze werden dafür kurz gedreht.
    const input = current;
    const flipped = signedVolume(input) > 0;
    try {
      if (flipped) flipWinding(current);
      current.computeWorldMatrix(true);
      cutter = makeCutter(cut, current, scene);
      const result = CSG.FromMesh(current)
        .subtract(CSG.FromMesh(cutter))
        .toMesh(current.name, current.material, scene, false);
      if (!result.getTotalVertices() || !(result.getTotalIndices() > 0)) {
        result.dispose();
        console.warn('[freeform] Schnitt fehlgeschlagen', 'leeres Ergebnis');
        continue;
      }
      // Transform und Eltern wie beim Eingabenetz.
      result.parent = current.parent;
      result.position.copyFrom(current.position);
      result.scaling.copyFrom(current.scaling);
      if (current.rotationQuaternion) result.rotationQuaternion = current.rotationQuaternion.clone();
      else {
        result.rotationQuaternion = null;
        result.rotation.copyFrom(current.rotation);
      }
      result.id = current.id;
      result.isPickable = current.isPickable;
      result.isVisible = current.isVisible;
      result.metadata = current.metadata;
      if (flipped) flipWinding(result);
      ensureUvs(result);
      cutter.dispose();
      cutter = null;
      current.dispose();
      current = result;
    } catch (error) {
      console.warn('[freeform] Schnitt fehlgeschlagen', error);
    } finally {
      if (flipped && !input.isDisposed()) flipWinding(input);
      if (cutter && !cutter.isDisposed()) cutter.dispose();
    }
  }
  return current;
}
