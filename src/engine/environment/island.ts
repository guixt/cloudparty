/**
 * Baut das Insel-Mesh (Vertexfarben) samt statischem Havok-Körper (Mesh-Form).
 */
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import type { Scene } from '@babylonjs/core/scene';
import type { IslandSpec } from '../../../shared/types';
import { mulberry32 } from './outline';
import { buildIslandGeometry } from './islandGeometry';

export interface Island {
  mesh: Mesh;
  dispose(): void;
}

/** Feines Rauschen (Grasbüschel/Gesteinskörnung), das die Vertexfarben moduliert. */
function createDetailTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture('env.islandDetail', { width: size, height: size }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const rnd = mulberry32(4242);
  ctx.fillStyle = 'rgb(200,200,200)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i++) {
    const v = Math.floor(150 + rnd() * 105);
    ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.5})`;
    const w = 1 + Math.floor(rnd() * 3);
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) ctx.fillRect(x + dx, y + dy, w, 1 + Math.floor(rnd() * 4));
  }
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

export function createIsland(scene: Scene, spec: IslandSpec): Island {
  const geometry = buildIslandGeometry(spec);
  const mesh = new Mesh('env.island', scene);
  const data = new VertexData();
  data.positions = geometry.positions;
  data.indices = geometry.indices;
  data.colors = geometry.colors;
  data.uvs = geometry.uvs;
  const normals: number[] = [];
  VertexData.ComputeNormals(geometry.positions, geometry.indices, normals);
  data.normals = normals;
  data.applyToMesh(mesh);

  const material = new StandardMaterial('env.islandMat', scene);
  material.diffuseColor = new Color3(1, 1, 1);
  material.specularColor = Color3.Black();
  const detail = createDetailTexture(scene);
  detail.uScale = detail.vScale = Math.max(4, spec.radius / 3.2);
  material.diffuseTexture = detail;
  mesh.material = material;
  mesh.hasVertexAlpha = false;
  mesh.receiveShadows = true;
  mesh.metadata = { isGround: true };
  mesh.isPickable = true;

  let aggregate: PhysicsAggregate | null = null;
  if (scene.getPhysicsEngine()) {
    aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0, friction: 0.8, restitution: 0.05 }, scene);
  }
  return {
    mesh,
    dispose() {
      aggregate?.dispose();
      aggregate = null;
      mesh.dispose(false, true);
      material.dispose(true, true);
    },
  };
}
