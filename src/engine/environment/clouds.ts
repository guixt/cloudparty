/**
 * Wolkenmeer weit unter der Insel und einzelne treibende Wolken ringsum.
 * Wolken bestehen aus abgeflachten Kugeln (Instanzen), weich beleuchtet.
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { mulberry32 } from './outline';
import { mix, toLinear, type Rgb, type SkyLook } from './presets';

export interface Clouds {
  meshes: AbstractMesh[];
  /** Blendet das Wolkenmeer unter der Insel ein/aus (die treibenden Wolken ringsum bleiben). */
  setSeaVisible(visible: boolean): void;
  apply(look: SkyLook): void;
  update(dt: number): void;
  dispose(): void;
}

interface Drifter {
  node: TransformNode;
  speed: number;
}

export function createClouds(scene: Scene, seed = 1, seaY = -70): Clouds {
  const rnd = mulberry32(seed * 977 + 13);
  const material = new StandardMaterial('env.cloudMat', scene);
  material.specularColor = Color3.Black();
  material.backFaceCulling = true;

  const source = CreateSphere('env.cloud.src', { diameter: 1, segments: 10 }, scene);
  source.material = material;
  const meshes: AbstractMesh[] = [source];
  const instances: Mesh[] = [];
  const seaPuffs: AbstractMesh[] = [];
  let counter = 0;
  const puff = (parent: TransformNode, x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
    const target = counter === 0 ? source : source.createInstance(`env.cloud.${counter}`);
    counter += 1;
    target.parent = parent;
    target.position.set(x, y, z);
    target.scaling.set(sx, sy, sz);
    target.isPickable = false;
    target.receiveShadows = false;
    target.alwaysSelectAsActiveMesh = false;
    if (target !== source) instances.push(target as unknown as Mesh);
    meshes.push(target);
    if (parent === seaRoot) seaPuffs.push(target);
  };

  const seaRoot = new TransformNode('env.cloudSea', scene);
  seaRoot.position.y = seaY;
  // Wolkenmeer: viele flache Bausch-Haufen auf einem großen Ring und darunter
  for (let i = 0; i < 70; i++) {
    const angle = rnd() * Math.PI * 2;
    const dist = 20 + Math.sqrt(rnd()) * 520;
    const cx = Math.sin(angle) * dist;
    const cz = Math.cos(angle) * dist;
    const groupSize = 3 + Math.floor(rnd() * 3);
    const base = 26 + rnd() * 26;
    for (let k = 0; k < groupSize; k++) {
      const w = base * (0.6 + rnd() * 0.7);
      puff(seaRoot, cx + (rnd() - 0.5) * base * 1.4, (rnd() - 0.5) * 5, cz + (rnd() - 0.5) * base * 1.4, w, w * 0.42, w * (0.8 + rnd() * 0.3));
    }
  }

  // Einzelne Wolken ringsum
  const drifters: Drifter[] = [];
  const bound = 360;
  for (let i = 0; i < 9; i++) {
    const node = new TransformNode(`env.cloudDrift.${i}`, scene);
    const angle = rnd() * Math.PI * 2;
    const dist = 80 + rnd() * 240;
    node.position.set(Math.sin(angle) * dist, 28 + rnd() * 55, Math.cos(angle) * dist);
    const size = 7 + rnd() * 9;
    const count = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < count; k++) {
      const spread = (k - count / 2) * size * 0.55;
      const w = size * (0.8 + rnd() * 0.6) * (1 - Math.abs(k - count / 2) / (count + 1));
      puff(node, spread, (rnd() - 0.2) * size * 0.25, (rnd() - 0.5) * size * 0.5, w * 1.4, w * 0.75, w);
    }
    drifters.push({ node, speed: 0.6 + rnd() * 1.2 });
  }

  return {
    meshes,
    setSeaVisible(visible) {
      // Das Quellmesh trägt alle Instanzen (auch die treibenden Wolken): es bleibt aktiv, nur sein Bild verschwindet.
      for (const mesh of seaPuffs) {
        if (mesh === source) source.isVisible = visible;
        else mesh.setEnabled(visible);
      }
    },
    apply(look) {
      const light: Rgb = look.cloudLight;
      const shade: Rgb = look.cloudShade;
      material.diffuseColor = new Color3(...toLinear(mix(light, shade, 0.2)));
      material.emissiveColor = new Color3(...toLinear(mix(shade, light, 0.55))).scale(0.5);
    },
    update(dt) {
      seaRoot.rotation.y += dt * 0.0035;
      for (const d of drifters) {
        d.node.position.x += d.speed * dt;
        if (d.node.position.x > bound) d.node.position.x = -bound;
      }
    },
    dispose() {
      for (const inst of instances) inst.dispose();
      source.dispose();
      seaRoot.dispose();
      for (const d of drifters) d.node.dispose();
      material.dispose();
    },
  };
}
