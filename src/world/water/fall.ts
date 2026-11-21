/**
 * Baustein „Wasserfall": senkrechte Wasserbahn mit laufenden Schlieren, Gischt und Nebel am Fuß.
 * Ursprung = Mitte der Oberkante (am Inselrand gesetzt, fällt nach unten); Größe: state.width (2 m) und
 * state.height (12 m), mit scale x/y als Faktor darauf. Ohne Physik.
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import '@babylonjs/core/Shaders/particles.vertex';
import '@babylonjs/core/Shaders/particles.fragment';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { EntitySpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { readFallParams, scaledCount } from './helpers';
import { createStreakTexture, sharedSoft } from './textures';

interface FallLive {
  materials: StandardMaterial[];
  systems: ParticleSystem[];
  color: Color3;
}
const falls = new Map<string, FallLive>();

/** Alpha der Bahn: weiche Seitenränder, unten ausfransend. */
function fallAlpha(x: number, y: number, width: number, height: number): number {
  const side = Math.max(0, 1 - Math.pow(Math.abs(x) / (width / 2), 3));
  const edge = Math.min(1, side * 1.6);
  const bottom = Math.min(1, (y + height / 2) / (height * 0.12) + 0.35);
  return edge * bottom;
}

const toColor = (c: [number, number, number]) => new Color3(c[0], c[1], c[2]);

function tint(live: FallLive, rgb: [number, number, number]): void {
  const c = toColor(rgb);
  live.color = c;
  for (const m of live.materials) {
    m.diffuseColor = c;
    m.emissiveColor = c.scale(0.28);
  }
  for (const s of live.systems) {
    s.color1 = new Color4(c.r * 0.5 + 0.5, c.g * 0.4 + 0.6, c.b * 0.3 + 0.7, s.color1.a);
    s.color2 = new Color4(c.r * 0.4 + 0.55, c.g * 0.4 + 0.6, c.b * 0.2 + 0.78, s.color2.a);
  }
}

export function buildFall(ctx: GameContext, entity: EntitySpec, root: TransformNode): void {
  const { scene } = ctx;
  // Größe in lokalen Einheiten (die Wurzel skaliert mit scale)
  const { width, height, color } = readFallParams(entity, [1, 1, 1]);
  const materials: StandardMaterial[] = [];

  const makeSheet = (name: string, seed: number, z: number, speed: number, alpha: number): void => {
    // Senkrechte Bahn (v wächst nach oben); weiche Ränder über Eckpunkt-Alpha
    const plane = CreateGround(name, { width, height, subdivisionsX: 12, subdivisionsY: 6 }, scene);
    plane.rotation.x = -Math.PI / 2;
    plane.bakeCurrentTransformIntoVertices();
    const pos = plane.getVerticesData(VertexBuffer.PositionKind) ?? [];
    const colors: number[] = [];
    for (let i = 0; i < pos.length; i += 3) colors.push(1, 1, 1, fallAlpha(pos[i], pos[i + 1], width, height));
    plane.setVerticesData(VertexBuffer.ColorKind, colors);
    plane.hasVertexAlpha = true;
    plane.parent = root;
    plane.position.set(0, -height / 2, z);
    plane.isPickable = true;
    const tex = createStreakTexture(scene, seed);
    tex.uScale = Math.max(1, Math.round(width / 1.4));
    tex.vScale = Math.max(1, height / 4);
    const mat = new StandardMaterial(`${name}.mat`, scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mat.alpha = alpha;
    plane.material = mat;
    materials.push(mat);
    const obs = scene.onBeforeRenderObservable.add(() => {
      tex.vOffset += (ctx.engine.getDeltaTime() / 1000) * speed;
    });
    plane.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(obs));
  };
  makeSheet('fall.sheet', 3, 0, 1.5, 0.82);
  makeSheet('fall.sheet2', 11, 0.05, 1.05, 0.5);

  // Überlauf-Kante oben
  const lip = CreateCylinder('fall.lip', { diameter: 0.34, height: width, tessellation: 10 }, scene);
  lip.rotation.z = Math.PI / 2;
  lip.parent = root;
  lip.position.set(0, -0.05, 0.03);
  lip.isPickable = false;
  const lipMat = new StandardMaterial('fall.lipMat', scene);
  lipMat.specularColor = Color3.Black();
  lipMat.alpha = 0.75;
  lip.material = lipMat;
  materials.push(lipMat);

  // Gischt und Nebel am Fuß
  const emitter = new Mesh('fall.emitter', scene);
  emitter.parent = root;
  emitter.position.set(0, -height + 0.25, 0.1);
  emitter.isPickable = false;
  const soft = sharedSoft(scene);
  const systems: ParticleSystem[] = [];
  const rateMist = Math.min(90, 14 + width * 10);
  const rateSpray = Math.min(60, 8 + width * 6);

  const mist = new ParticleSystem('fall.mist', 220, scene);
  mist.particleTexture = soft;
  mist.emitter = emitter;
  mist.minEmitBox = new Vector3(-width / 2, -0.2, -0.4);
  mist.maxEmitBox = new Vector3(width / 2, 0.3, 0.8);
  mist.direction1 = new Vector3(-0.5, 0.6, 0.2);
  mist.direction2 = new Vector3(0.5, 1.5, 1.2);
  mist.minLifeTime = 1.4;
  mist.maxLifeTime = 2.6;
  mist.minSize = 1.6;
  mist.maxSize = 3.4;
  mist.minEmitPower = 0.3;
  mist.maxEmitPower = 0.9;
  mist.gravity = new Vector3(0, 0.15, 0);
  mist.color1 = new Color4(1, 1, 1, 0.38);
  mist.color2 = new Color4(0.9, 0.97, 1, 0.28);
  mist.colorDead = new Color4(1, 1, 1, 0);
  mist.addSizeGradient(0, 0.5);
  mist.addSizeGradient(1, 1.2);
  mist.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  systems.push(mist);

  const spray = new ParticleSystem('fall.spray', 160, scene);
  spray.particleTexture = soft;
  spray.emitter = emitter;
  spray.minEmitBox = new Vector3(-width / 2, 0, -0.1);
  spray.maxEmitBox = new Vector3(width / 2, 0.1, 0.3);
  spray.direction1 = new Vector3(-1.2, 2.2, 0.2);
  spray.direction2 = new Vector3(1.2, 4.2, 1.4);
  spray.minLifeTime = 0.5;
  spray.maxLifeTime = 1.1;
  spray.minSize = 0.07;
  spray.maxSize = 0.2;
  spray.minEmitPower = 0.8;
  spray.maxEmitPower = 1.8;
  spray.gravity = new Vector3(0, -9, 0);
  spray.color1 = new Color4(1, 1, 1, 0.8);
  spray.color2 = new Color4(0.8, 0.93, 1, 0.7);
  spray.colorDead = new Color4(1, 1, 1, 0);
  spray.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  systems.push(spray);

  const live: FallLive = { materials, systems, color: toColor(color) };
  tint(live, color);
  lipMat.diffuseColor = toColor(color).scale(0.9);
  falls.set(entity.id, live);

  const applyQuality = () => {
    const ps = ctx.quality.features().particleScale;
    mist.emitRate = scaledCount(rateMist, ps);
    spray.emitRate = scaledCount(rateSpray, ps);
    for (const s of systems) {
      if (scaledCount(10, ps) === 0) s.stop();
      else if (!s.isStarted()) s.start();
    }
  };
  applyQuality();
  for (const s of systems) s.start();
  applyQuality();
  const off = ctx.quality.onChange(applyQuality);

  emitter.onDisposeObservable.addOnce(() => {
    off();
    if (falls.get(entity.id) === live) falls.delete(entity.id);
    for (const s of systems) s.dispose(false);
  });
}

/** Farbe geändert (ohne Neuaufbau). */
export function updateFall(entity: EntitySpec): void {
  const live = falls.get(entity.id);
  if (!live) return;
  tint(live, readFallParams(entity, [1, 1, 1]).color);
}
