/**
 * Himmelskuppel mit Farbverlauf, Sonnenscheibe, Halo und Sternen (ein Shader, keine Texturen).
 */
import { Effect } from '@babylonjs/core/Materials/effect';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { toLinear, type Rgb, type SkyLook } from './presets';

const NAME = 'cpSky';

function register(): void {
  if (Effect.ShadersStore[`${NAME}VertexShader`]) return;
  Effect.ShadersStore[`${NAME}VertexShader`] = `
    precision highp float;
    attribute vec3 position;
    uniform mat4 worldViewProjection;
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }`;
  Effect.ShadersStore[`${NAME}FragmentShader`] = `
    precision highp float;
    varying vec3 vDir;
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 horizonColor;
    uniform vec3 belowColor;
    uniform vec3 sunDir;
    uniform vec3 sunDisc;
    uniform vec3 sunGlow;
    uniform float sunVisible;
    uniform float stars;
    uniform float time;
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col;
      if (h >= 0.0) {
        col = mix(horizonColor, midColor, smoothstep(0.0, 0.3, h));
        col = mix(col, topColor, smoothstep(0.2, 0.85, h));
      } else {
        col = mix(horizonColor, belowColor, smoothstep(0.0, 0.45, -h));
      }
      float sd = max(dot(d, sunDir), 0.0);
      col += sunGlow * (pow(sd, 6.0) * 0.18 + pow(sd, 40.0) * 0.3) * sunVisible;
      col = mix(col, sunDisc * 1.6, smoothstep(0.99935, 0.9997, sd) * sunVisible);
      if (stars > 0.0 && h > 0.0) {
        vec3 p = d * 110.0;
        vec3 id = floor(p);
        vec3 f = fract(p) - 0.5;
        float r = hash(id);
        if (r > 0.94) {
          vec3 off = (vec3(hash(id + 1.7), hash(id + 2.9), hash(id + 3.3)) - 0.5) * 0.5;
          float dist = length(f - off);
          float s = smoothstep(0.3, 0.0, dist) * (0.65 + 0.35 * sin(time * 2.0 + r * 80.0));
          col += vec3(0.9, 0.95, 1.0) * s * stars * (0.9 + r) * smoothstep(0.0, 0.2, h);
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }`;
}

export interface SkyDome {
  mesh: Mesh;
  apply(look: SkyLook, sunToward: Vector3, sunVisible: number): void;
  update(timeSeconds: number): void;
  dispose(): void;
}

const c3 = (c: Rgb) => new Color3(...toLinear(c));

export function createSky(scene: Scene): SkyDome {
  register();
  const mesh = CreateSphere('env.sky', { diameter: 900, segments: 24 }, scene);
  mesh.infiniteDistance = true;
  mesh.isPickable = false;
  mesh.applyFog = false;
  mesh.alwaysSelectAsActiveMesh = true;
  const material = new ShaderMaterial(
    'env.skyMat',
    scene,
    { vertex: NAME, fragment: NAME },
    {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'topColor', 'midColor', 'horizonColor', 'belowColor', 'sunDir', 'sunDisc', 'sunGlow', 'sunVisible', 'stars', 'time'],
    },
  );
  material.backFaceCulling = false;
  mesh.material = material;
  return {
    mesh,
    apply(look, sunToward, sunVisible) {
      material.setColor3('topColor', c3(look.top));
      material.setColor3('midColor', c3(look.mid));
      material.setColor3('horizonColor', c3(look.horizon));
      material.setColor3('belowColor', c3(look.below));
      material.setColor3('sunDisc', c3(look.sunDisc));
      material.setColor3('sunGlow', c3(look.sunGlow));
      material.setVector3('sunDir', sunToward);
      material.setFloat('sunVisible', sunVisible);
      material.setFloat('stars', look.stars);
    },
    update(timeSeconds) {
      material.setFloat('time', timeSeconds);
    },
    dispose() {
      mesh.dispose(false, true);
    },
  };
}
