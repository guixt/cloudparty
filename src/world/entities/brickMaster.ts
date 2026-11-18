/**
 * Gemeinsame Geometrie für Klemmbausteine: je Gestalt (Art, Größe, Noppen) und Aussehen (Material) EIN Master-Mesh mit
 * Körper und Noppen in einem Stück; jeder Stein ist nur noch eine Hardware-Instanz davon. Das senkt Knoten-, Material-
 * und Zeichenaufrufzahl bei großen Bauten (Burgen) um ein Vielfaches.
 */
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Scene } from '@babylonjs/core/scene';
import { STUD_DIAMETER, STUD_HEIGHT, brickSize, studSpots, type BrickState } from '../../../shared/bricks';
import { createArch, createCurvedSlope, createDome, createInvertedSlope, createQuarter, createSlope } from './brickShapes';

const masters = new WeakMap<Scene, Map<string, Mesh>>();

/** Körper-Mesh einer Art (ohne Noppen), Ursprung Mitte der Grundfläche an der Unterkante. */
function bodyMesh(scene: Scene, st: BrickState): Mesh {
  const [bw, bh, bd] = brickSize(st);
  let mesh: Mesh;
  switch (st.kind) {
    case 'schraeg':
      return createSlope(scene, bw, bd, bh);
    case 'bogen':
      return createCurvedSlope(scene, bw, bd, bh);
    case 'schraeg_um':
      return createInvertedSlope(scene, bw, bd, bh);
    case 'bogenlauf':
      return createArch(scene, bw, bd, bh);
    case 'viertel':
      return createQuarter(scene, st.w, bh);
    case 'kuppel':
      return createDome(scene, st.w, bh);
    case 'rund':
    case 'rundplatte':
      mesh = CreateCylinder('body', { diameter: bw, height: bh, tessellation: 32 }, scene);
      mesh.position.y = bh / 2;
      return mesh;
    default:
      mesh = CreateBox('body', { width: bw, height: bh, depth: bd }, scene);
      mesh.position.y = bh / 2;
      return mesh;
  }
}

/**
 * Sorgt dafür, dass ein Mesh Texturkoordinaten hat (ebene Abbildung nach der dominanten Normalenachse). Die selbst gebauten
 * Formen (Schräge, Bogen, Viertel …) haben keine; Meshes mit unterschiedlichen Vertex-Daten lassen sich nicht verschmelzen.
 */
export function ensureUvs(mesh: Mesh): void {
  if (mesh.getVerticesData(VertexBuffer.UVKind)) return;
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
  const nor = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!pos) return;
  const uvs = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const nx = Math.abs(nor?.[i * 3] ?? 0);
    const ny = Math.abs(nor?.[i * 3 + 1] ?? 1);
    const nz = Math.abs(nor?.[i * 3 + 2] ?? 0);
    const [u, v] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
    uvs[i * 2] = u * 2;
    uvs[i * 2 + 1] = v * 2;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

/** Körper plus Noppen als ein einziges Mesh. */
function buildMergedBrick(scene: Scene, st: BrickState): Mesh {
  const [, bh] = brickSize(st);
  const parts: Mesh[] = [bodyMesh(scene, st)];
  for (const [x, z] of studSpots(st)) {
    const stud = CreateCylinder('stud', { diameter: STUD_DIAMETER, height: STUD_HEIGHT, tessellation: 12 }, scene);
    stud.position.set(x, bh + STUD_HEIGHT / 2, z);
    parts.push(stud);
  }
  let merged: Mesh | null = null;
  try {
    for (const part of parts) {
      ensureUvs(part);
      part.computeWorldMatrix(true);
    }
    merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    if (!merged) throw new Error('Klemmbaustein konnte nicht zusammengesetzt werden');
    return merged;
  } catch (error) {
    // Keine Reste in der Szene zurücklassen (sonst entstehen sichtbare, nicht wählbare „Geisterteile“).
    for (const part of parts) if (!part.isDisposed()) part.dispose();
    throw error;
  }
}

/**
 * Liefert (und erzeugt bei Bedarf) den Master für Gestalt und Aussehen. `makeMaterial` wird nur beim ersten Mal aufgerufen.
 * Der Master selbst ist unsichtbar und nicht anwählbar; sichtbar sind nur seine Instanzen.
 */
export function getBrickMaster(scene: Scene, st: BrickState, appearance: string, makeMaterial: () => PBRMaterial): Mesh {
  let map = masters.get(scene);
  if (!map) {
    map = new Map();
    masters.set(scene, map);
    scene.onDisposeObservable.addOnce(() => masters.delete(scene));
  }
  const key = `${st.kind}|${st.w}|${st.d}|${st.studs ? 1 : 0}|${appearance}`;
  const found = map.get(key);
  if (found && !found.isDisposed()) {
    // Das Material gehört dem Master; ist es verloren gegangen (z. B. entsorgt), neu erzeugen.
    if (!found.material || !scene.materials.includes(found.material)) found.material = makeMaterial();
    return found;
  }
  const master = buildMergedBrick(scene, st);
  master.name = `brick.master.${key.slice(0, 40)}`;
  master.material = makeMaterial();
  master.isVisible = false;
  master.isPickable = false;
  master.receiveShadows = true;
  map.set(key, master);
  return master;
}

/** Anzahl der Master (für Tests und Diagnose). */
export function brickMasterCount(scene: Scene): number {
  return masters.get(scene)?.size ?? 0;
}
