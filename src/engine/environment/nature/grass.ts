/** Gras: Thin Instances eines Büschels mit eigenem Shader (Wind, Farbverlauf, Nebel). */
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Effect } from '@babylonjs/core/Materials/effect';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { EnvironmentHandle } from '../features';
import { BLADE_STRIDE, bladesToBuffers, filterBlades, generateBlades, type Rect } from './blades';
import { mulberry32 } from '../outline';

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
attribute vec4 instColor;
uniform mat4 viewProjection;
uniform float time;
uniform float wind;
uniform vec3 camPos;
uniform float fogDensity;
varying vec2 vUv;
varying vec3 vTint;
varying float vFog;
void main() {
  mat4 w = mat4(world0, world1, world2, world3);
  vec4 wp = w * vec4(position, 1.0);
  float tip = uv.y * uv.y;
  float ph = wp.x * 0.55 + wp.z * 0.43;
  float s = sin(time * 1.7 + ph) * 0.6 + sin(time * 2.9 + ph * 1.7) * 0.4;
  float lean = 0.05 + 0.13 * wind;
  wp.x += (s * 0.8 + 0.35 * wind) * lean * tip;
  wp.z += s * 0.5 * lean * tip;
  wp.y -= abs(s) * 0.03 * wind * tip;
  vUv = uv;
  vTint = instColor.rgb;
  float d = length(wp.xyz - camPos);
  vFog = exp(-d * d * fogDensity * fogDensity);
  gl_Position = viewProjection * wp;
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
varying vec3 vTint;
varying float vFog;
uniform sampler2D tex;
uniform vec3 baseCol;
uniform vec3 tipCol;
uniform vec3 lightCol;
uniform vec3 fogColor;
void main() {
  float a = texture2D(tex, vUv).a;
  if (a < 0.45) discard;
  vec3 c = mix(baseCol, tipCol, smoothstep(0.0, 1.0, vUv.y)) * vTint * lightCol;
  gl_FragColor = vec4(mix(fogColor, c, vFog), 1.0);
}`;

const hex = (h: number, gain: number): [number, number, number] => [
  Math.pow((h >> 16) / 255, 2.2) * gain,
  Math.pow(((h >> 8) & 255) / 255, 2.2) * gain,
  Math.pow((h & 255) / 255, 2.2) * gain,
];
// Farben wie die Inseloberseite (islandGeometry.ts)
const BASE_COLOR = hex(0x3f7a2a, 1.1);
const TIP_COLOR = hex(0x7ab648, 1.1);

function registerShader(): void {
  Effect.ShadersStore['cpGrassVertexShader'] = VERTEX;
  Effect.ShadersStore['cpGrassFragmentShader'] = FRAGMENT;
}

/** Büschel aus mehreren Halmen als Alpha-Textur. */
function createTuftTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const texture = new DynamicTexture('env.grassTuft', { width: size, height: size }, scene, true);
  texture.hasAlpha = true;
  const c = texture.getContext() as CanvasRenderingContext2D;
  c.clearRect(0, 0, size, size);
  c.fillStyle = '#fff';
  const rnd = mulberry32(31);
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const baseX = size * (0.12 + 0.76 * ((i + 0.5 * rnd()) / blades));
    const tipX = baseX + (rnd() - 0.5) * size * 0.3;
    const height = size * (0.55 + rnd() * 0.42);
    const halfW = size * (0.035 + rnd() * 0.025);
    c.beginPath();
    c.moveTo(baseX - halfW, size);
    c.quadraticCurveTo(baseX - halfW * 0.6, size - height * 0.55, tipX, size - height);
    c.quadraticCurveTo(baseX + halfW * 0.6, size - height * 0.55, baseX + halfW, size);
    c.closePath();
    c.fill();
  }
  texture.update(true);
  return texture;
}

const H = 0.38;
/** Zwei gekreuzte Quader-Flächen, Höhe 0.38 m, Breite 0.34 m; UV-v = Höhe (0 Fuß, 1 Spitze). */
function createTuftMesh(scene: Scene): Mesh {
  const mesh = new Mesh('env.grass', scene);
  const w = 0.17;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const quad = (ax: number, az: number) => {
    const base = positions.length / 3;
    positions.push(-ax, 0, -az, ax, 0, az, ax, H, az, -ax, H, -az);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad(w, 0);
  quad(0, w);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.applyToMesh(mesh);
  return mesh;
}

export interface Grass {
  /** Setzt Insel und Dichte (0 = kein Gras); baut nur bei Änderung neu. */
  configure(island: { radius: number; seed: number } | null, density: number): void;
  /** Rechtecke (XZ), in denen kein Gras wächst. */
  setExclusions(rects: readonly Rect[]): void;
  update(dt: number, time: number, wind: number): void;
  readonly bladeCount: number;
  dispose(): void;
}

export function createGrass(handle: EnvironmentHandle): Grass {
  const { scene } = handle;
  registerShader();
  const texture = createTuftTexture(scene);
  const material = new ShaderMaterial(
    'env.grassMat',
    scene,
    { vertex: 'cpGrass', fragment: 'cpGrass' },
    {
      attributes: ['position', 'uv', 'world0', 'world1', 'world2', 'world3', 'instColor'],
      uniforms: ['viewProjection', 'time', 'wind', 'camPos', 'fogDensity', 'baseCol', 'tipCol', 'lightCol', 'fogColor'],
      samplers: ['tex'],
    },
  );
  material.backFaceCulling = false;
  material.setTexture('tex', texture);
  material.setVector3('baseCol', new Vector3(...BASE_COLOR));
  material.setVector3('tipCol', new Vector3(...TIP_COLOR));

  let mesh: Mesh | null = null;
  let island: { radius: number; seed: number } | null = null;
  let density = 0;
  let all: Float32Array = new Float32Array(0);
  let rects: readonly Rect[] = [];
  let count = 0;
  const camPos = new Vector3();
  const light = new Vector3();
  const fog = new Vector3();

  function rebuildInstances(): void {
    if (!mesh) return;
    const visible = filterBlades(all, rects);
    const { matrices, colors } = bladesToBuffers(visible);
    count = visible.length / BLADE_STRIDE;
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.thinInstanceSetBuffer('instColor', colors, 4, true);
    mesh.thinInstanceCount = count;
    mesh.setEnabled(count > 0);
  }

  function ensureMesh(): Mesh {
    if (mesh) return mesh;
    mesh = createTuftMesh(scene);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.receiveShadows = false;
    mesh.doNotSyncBoundingInfo = true;
    return mesh;
  }

  function dropMesh(): void {
    mesh?.dispose();
    mesh = null;
    count = 0;
  }

  return {
    configure(next, nextDensity) {
      const same = island && next && island.radius === next.radius && island.seed === next.seed && density === nextDensity;
      island = next ? { radius: next.radius, seed: next.seed } : null;
      density = nextDensity;
      if (same && mesh) return;
      if (!island || !(density > 0)) {
        all = new Float32Array(0);
        dropMesh();
        return;
      }
      all = generateBlades(island, density);
      dropMesh();
      ensureMesh();
      rebuildInstances();
    },
    setExclusions(next) {
      rects = next;
      rebuildInstances();
    },
    update(_dt, time, wind) {
      if (!mesh || count === 0) return;
      const camera = scene.activeCamera;
      if (camera) camPos.copyFrom(camera.globalPosition);
      material.setFloat('time', time);
      material.setFloat('wind', wind);
      material.setVector3('camPos', camPos);
      material.setFloat('fogDensity', scene.fogMode === 0 ? 0 : scene.fogDensity);
      // Beleuchtung wie auf der Inseloberseite (Himmelslicht + Sonne bei senkrechter Normale).
      const sunUp = Math.max(0, handle.getSunDirection().y);
      const hemi = handle.hemi;
      const sun = handle.sun;
      light.set(
        hemi.diffuse.r * hemi.intensity + sun.diffuse.r * sun.intensity * sunUp,
        hemi.diffuse.g * hemi.intensity + sun.diffuse.g * sun.intensity * sunUp,
        hemi.diffuse.b * hemi.intensity + sun.diffuse.b * sun.intensity * sunUp,
      );
      material.setVector3('lightCol', light);
      fog.set(scene.fogColor.r, scene.fogColor.g, scene.fogColor.b);
      material.setVector3('fogColor', fog);
    },
    get bladeCount() {
      return count;
    },
    dispose() {
      dropMesh();
      material.dispose(false, false);
      texture.dispose();
    },
  };
}
