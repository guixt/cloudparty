/**
 * Prefab-Register: Grundformen, Möbel, Natur, Licht. Andere Pakete (Medien)
 * ergänzen es per `registerPrefab`.
 */
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { IDENTITY_TRANSFORM, newEntityId, type EntitySpec, type MaterialSpec, type Vec3 } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { createFixedMaterial, createMainMaterial, lightColor, updateMainMaterials } from './materials';
import { buildModel } from './model';
import { markBuildOnly, place, post, slab } from './parts';

export type PrefabCategory = 'Grundformen' | 'Möbel' | 'Natur' | 'Licht' | 'Technik' | 'Medien';

export interface PrefabDef {
  /** z. B. "EntitySpec.bench". */
  ref: string;
  /** Deutscher Anzeigename. */
  label: string;
  category: PrefabCategory;
  /** Vorgaben für neue Entities (Material, Scale, Physik, State). */
  defaults: Partial<EntitySpec>;
  /** Baut die Darstellung unter `root` (Ursprung: Mitte bei Grundformen, Boden bei Zusammengesetztem). */
  build(ctx: GameContext, entity: EntitySpec, root: TransformNode): void | Promise<void>;
  /**
   * Abstand von der Auflagefläche bis zum Ursprung in lokalen Einheiten
   * (mal Skalierung y): 0.5 für 1-m-Grundformen, 0 für Zusammengesetztes.
   */
  groundOffset?: number;
  /** `state`-Schlüssel, die die Gestalt ändern (nur dann Neuaufbau); undefined = alle. */
  stateKeys?: readonly string[];
  /** Optionales Beispiel-Symbol (Emoji) für die Palette. */
  icon?: string;
}

const registry = new Map<string, PrefabDef>();
const listeners = new Set<(ref: string) => void>();

/** Meldet ein Prefab an (oder ersetzt es). Entities mit dieser ref werden neu aufgebaut. */
export function registerPrefab(def: PrefabDef): void {
  registry.set(def.ref, def);
  syncList();
  for (const listener of [...listeners]) listener(def.ref);
}
export function onPrefabRegistered(listener: (ref: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getPrefab(ref: string): PrefabDef | undefined {
  return registry.get(ref);
}
/** Alle Prefabs (Lesesicht, immer aktuell). */
export const PREFABS: PrefabDef[] = [];
function syncList() {
  PREFABS.length = 0;
  PREFABS.push(...registry.values());
}
/** Neue Entity aus einem Prefab; `pos` ist der Punkt am Boden, auf dem das Objekt steht. */
export function createEntityFromPrefab(ref: string, pos: Vec3): EntitySpec {
  const def = registry.get(ref);
  const d = def?.defaults ?? {};
  const scale: Vec3 = d.transform?.scale ? [...d.transform.scale] : [1, 1, 1];
  const offset = (def?.groundOffset ?? 0) * scale[1];
  const entity: EntitySpec = {
    id: newEntityId(),
    ref,
    name: def?.label,
    ...(structuredCloneSafe(d) as Partial<EntitySpec>),
    transform: { ...IDENTITY_TRANSFORM, ...(d.transform ?? {}), pos: [pos[0], pos[1] + offset, pos[2]], rot: d.transform?.rot ? [...d.transform.rot] : [0, 0, 0, 1], scale },
  };
  return entity;
}
function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const WOOD_DARK = '#5a3d28';
const IRON = '#2f3440';

function mainMat(ctx: GameContext, entity: EntitySpec, color: string, extra: Partial<Parameters<typeof createMainMaterial>[3]> = {}) {
  return createMainMaterial(ctx.scene, 'main', entity.material, { color, ...extra });
}

function primitive(make: (ctx: GameContext) => Mesh, color: string): PrefabDef['build'] {
  return (ctx, entity, root) => {
    const mesh = make(ctx);
    place(mesh, root, mainMat(ctx, entity, color, { roughness: 0.55 }));
  };
}

// ---------------------------------------------------------------------------
// Prefabs
// ---------------------------------------------------------------------------

const solid = { mode: 'static' } as const;

const BUILTIN: PrefabDef[] = [
  {
    ref: 'EntitySpec.box',
    label: 'Würfel',
    category: 'Grundformen',
    icon: '🟧',
    groundOffset: 0.5,
    stateKeys: [],
    defaults: { material: { color: '#f2a93b' }, physics: solid },
    build: primitive((c) => CreateBox('box', { size: 1 }, c.scene), '#f2a93b'),
  },
  {
    ref: 'EntitySpec.sphere',
    label: 'Kugel',
    category: 'Grundformen',
    icon: '🔴',
    groundOffset: 0.5,
    stateKeys: [],
    defaults: { material: { color: '#e25a5a' }, physics: solid },
    build: primitive((c) => CreateSphere('sphere', { diameter: 1, segments: 32 }, c.scene), '#e25a5a'),
  },
  {
    ref: 'EntitySpec.cylinder',
    label: 'Zylinder',
    category: 'Grundformen',
    icon: '🥫',
    groundOffset: 0.5,
    stateKeys: [],
    defaults: { material: { color: '#4da3ff' }, physics: solid },
    build: primitive((c) => CreateCylinder('cylinder', { diameter: 1, height: 1, tessellation: 40 }, c.scene), '#4da3ff'),
  },
  {
    ref: 'EntitySpec.cone',
    label: 'Kegel',
    category: 'Grundformen',
    icon: '🔺',
    groundOffset: 0.5,
    stateKeys: [],
    defaults: { material: { color: '#8e6bd8' }, physics: solid },
    build: primitive((c) => CreateCylinder('cone', { diameterTop: 0, diameterBottom: 1, height: 1, tessellation: 40 }, c.scene), '#8e6bd8'),
  },
  {
    ref: 'EntitySpec.plane',
    label: 'Platte',
    category: 'Grundformen',
    icon: '▭',
    groundOffset: 0.025,
    stateKeys: [],
    defaults: { material: { color: '#5cbf6a' }, physics: solid, transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [3, 1, 3] } },
    build: primitive((c) => CreateBox('plane', { width: 1, height: 0.05, depth: 1 }, c.scene), '#5cbf6a'),
  },
  {
    ref: 'EntitySpec.torus',
    label: 'Ring',
    category: 'Grundformen',
    icon: '⭕',
    groundOffset: 0.15,
    stateKeys: [],
    defaults: { material: { color: '#f06eaa' }, physics: solid },
    build: primitive((c) => CreateTorus('torus', { diameter: 1, thickness: 0.3, tessellation: 48 }, c.scene), '#f06eaa'),
  },
  {
    ref: 'EntitySpec.avatar-spawn',
    label: 'Startpunkt',
    category: 'Technik',
    icon: '📍',
    groundOffset: 0,
    stateKeys: [],
    defaults: { material: { color: '#4da3ff' }, physics: { mode: 'none' } },
    build(ctx, entity, root) {
      const mat = createMainMaterial(ctx.scene, 'spawn', entity.material, { color: '#4da3ff', glow: 0.9, alpha: 0.85, roughness: 0.4 });
      const ring = place(CreateTorus('spawnRing', { diameter: 1.4, thickness: 0.09, tessellation: 48 }, ctx.scene), root, mat, 0, 0.05, 0);
      const disc = place(CreateCylinder('spawnDisc', { diameter: 1.3, height: 0.02, tessellation: 40 }, ctx.scene), root, mat, 0, 0.02, 0);
      const arrowMat = createMainMaterial(ctx.scene, 'spawnArrow', entity.material, { color: '#4da3ff', glow: 1, alpha: 0.9 });
      const arrow = place(CreateCylinder('spawnArrow', { diameterTop: 0, diameterBottom: 0.3, height: 0.4, tessellation: 3 }, ctx.scene), root, arrowMat, 0, 0.1, -0.2);
      arrow.rotation.x = Math.PI / 2;
      arrow.scaling.y = 1;
      disc.visibility = 0.35;
      for (const m of [ring, disc, arrow]) markBuildOnly(ctx, m);
    },
  },
  {
    ref: 'EntitySpec.bench',
    label: 'Bank',
    category: 'Möbel',
    icon: '🪑',
    groundOffset: 0,
    stateKeys: ['seats'],
    defaults: { material: { color: '#c98a4b' }, state: { seats: 3 }, physics: solid },
    build(ctx, entity, root) {
      const { scene } = ctx;
      const seats = Math.max(1, Math.round(num(entity.state?.seats, 3)));
      const length = seats * 0.62 + 0.3;
      const wood = mainMat(ctx, entity, '#c98a4b', { roughness: 0.8 });
      const iron = createFixedMaterial(scene, 'iron', IRON, { metallic: 0.6, roughness: 0.45 });
      slab(scene, root, wood, length, 0.07, 0.5, 0, 0.44, 0);
      const back = slab(scene, root, wood, length, 0.36, 0.06, 0, 0.62, 0.23);
      back.rotation.x = -0.12;
      for (const sx of [-1, 1]) {
        slab(scene, root, iron, 0.07, 0.44, 0.46, sx * (length / 2 - 0.12), 0, 0);
        slab(scene, root, iron, 0.07, 0.4, 0.07, sx * (length / 2 - 0.12), 0.48, 0.23);
      }
    },
  },
  {
    ref: 'EntitySpec.chair',
    label: 'Stuhl',
    category: 'Möbel',
    icon: '💺',
    groundOffset: 0,
    stateKeys: ['seats'],
    defaults: { material: { color: '#d9a05b' }, state: { seats: 1 }, physics: solid },
    build(ctx, entity, root) {
      const { scene } = ctx;
      const wood = mainMat(ctx, entity, '#d9a05b', { roughness: 0.8 });
      const legs = createFixedMaterial(scene, 'legs', WOOD_DARK, { roughness: 0.8 });
      slab(scene, root, wood, 0.5, 0.06, 0.5, 0, 0.44, 0);
      const back = slab(scene, root, wood, 0.5, 0.5, 0.05, 0, 0.5, 0.22);
      back.rotation.x = -0.1;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) slab(scene, root, legs, 0.06, 0.44, 0.06, sx * 0.21, 0, sz * 0.21);
    },
  },
  {
    ref: 'EntitySpec.table',
    label: 'Tisch',
    category: 'Möbel',
    icon: '🍽️',
    groundOffset: 0,
    stateKeys: [],
    defaults: { material: { color: '#b9783f' }, physics: solid },
    build(ctx, entity, root) {
      const { scene } = ctx;
      const wood = mainMat(ctx, entity, '#b9783f', { roughness: 0.75 });
      const legs = createFixedMaterial(scene, 'legs', WOOD_DARK, { roughness: 0.8 });
      slab(scene, root, wood, 1.6, 0.07, 0.9, 0, 0.72, 0);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) slab(scene, root, legs, 0.08, 0.72, 0.08, sx * 0.72, 0, sz * 0.38);
    },
  },
  {
    ref: 'EntitySpec.lantern',
    label: 'Laterne',
    category: 'Licht',
    icon: '🏮',
    groundOffset: 0,
    stateKeys: ['on', 'intensity', 'range'],
    defaults: { material: { color: '#ffd27a' }, state: { on: true, intensity: 1, range: 14 }, physics: solid },
    build(ctx, entity, root) {
      const { scene } = ctx;
      const on = entity.state?.on !== false;
      const iron = createFixedMaterial(scene, 'iron', IRON, { metallic: 0.65, roughness: 0.4 });
      post(scene, root, iron, 0.4, 0.46, 0.12, 0, 0, 0, 20);
      post(scene, root, iron, 0.07, 0.1, 1.95, 0, 0.1, 0, 12);
      post(scene, root, iron, 0.46, 0.34, 0.08, 0, 2.05, 0, 4);
      const glass = createMainMaterial(scene, 'glass', entity.material, { color: '#ffd27a', glow: on ? 0.95 : 0, alpha: on ? 0.95 : 0.7, roughness: 0.2 });
      post(scene, root, glass, 0.34, 0.3, 0.42, 0, 2.13, 0, 4).rotation.y = Math.PI / 4;
      post(scene, root, iron, 0.0, 0.5, 0.2, 0, 2.55, 0, 4).rotation.y = Math.PI / 4;
      const light = new PointLight('lanternLight', new Vector3(0, 2.2, 0), scene);
      light.parent = root;
      light.diffuse = lightColor(entity.material, '#ffd27a');
      light.specular = light.diffuse.scale(0.4);
      light.intensity = on ? num(entity.state?.intensity, 1) : 0;
      light.range = num(entity.state?.range, 14);
      light.setEnabled(on);
      light.metadata = { cpMainLight: true, fallback: '#ffd27a' };
    },
  },
  {
    ref: 'EntitySpec.light',
    label: 'Lichtquelle',
    category: 'Licht',
    icon: '💡',
    groundOffset: 1.5,
    stateKeys: ['intensity', 'range'],
    defaults: { material: { color: '#fff1c4' }, state: { intensity: 1, range: 16 }, physics: { mode: 'none' } },
    build(ctx, entity, root) {
      const { scene } = ctx;
      const light = new PointLight('pointLight', new Vector3(0, 0, 0), scene);
      light.parent = root;
      light.diffuse = lightColor(entity.material, '#fff1c4');
      light.specular = light.diffuse.scale(0.4);
      light.intensity = num(entity.state?.intensity, 1);
      light.range = num(entity.state?.range, 16);
      light.metadata = { cpMainLight: true, fallback: '#fff1c4' };
      const marker = place(
        CreateSphere('lightMarker', { diameter: 0.3, segments: 12 }, scene),
        root,
        createMainMaterial(scene, 'lightMarker', entity.material, { color: '#fff1c4', glow: 1, alpha: 0.9 }),
      );
      const ring = place(CreateTorus('lightRing', { diameter: 0.5, thickness: 0.025, tessellation: 24 }, scene), root, marker.material);
      markBuildOnly(ctx, marker);
      markBuildOnly(ctx, ring);
    },
  },
  {
    ref: 'EntitySpec.tree',
    label: 'Baum',
    category: 'Natur',
    icon: '🌳',
    groundOffset: 0,
    stateKeys: ['variant'],
    defaults: { material: { color: '#4fa83a' }, state: { variant: 0 }, physics: solid },
    build(ctx, entity, root) {
      const { scene } = ctx;
      const variant = ((Math.round(num(entity.state?.variant, 0)) % 3) + 3) % 3;
      const bark = createFixedMaterial(scene, 'bark', '#7a5230', { roughness: 0.9 });
      const leaves = mainMat(ctx, entity, '#4fa83a', { roughness: 0.85 });
      const ball = (d: number, x: number, y: number, z: number, sy = 1) => {
        const m = place(CreateSphere('leaves', { diameter: d, segments: 14 }, scene), root, leaves, x, y, z);
        m.scaling.y = sy;
        return m;
      };
      if (variant === 0) {
        post(scene, root, bark, 0.3, 0.46, 1.8, 0, 0, 0, 12);
        ball(2.4, 0, 2.7, 0);
        ball(1.6, 0.85, 2.2, 0.25);
        ball(1.5, -0.7, 3.25, -0.2);
        ball(1.3, -0.5, 2.1, 0.7);
      } else if (variant === 1) {
        post(scene, root, bark, 0.3, 0.4, 1.2, 0, 0, 0, 12);
        post(scene, root, leaves, 0, 2.5, 1.9, 0, 0.9, 0, 20);
        post(scene, root, leaves, 0, 2.0, 1.7, 0, 1.9, 0, 20);
        post(scene, root, leaves, 0, 1.4, 1.5, 0, 2.9, 0, 20);
      } else {
        post(scene, root, bark, 0.26, 0.38, 2.4, 0, 0, 0, 12);
        ball(1.5, 0, 3.8, 0, 2.0);
        ball(1.0, 0.45, 2.6, 0.2, 1.3);
      }
    },
  },
  {
    ref: 'EntitySpec.rock',
    label: 'Fels',
    category: 'Natur',
    icon: '🪨',
    groundOffset: 0,
    stateKeys: [],
    defaults: { material: { color: '#8d8f93' }, physics: solid, transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1.8, 1.8, 1.8] } },
    build(ctx, entity, root) {
      const { scene } = ctx;
      const rnd = mulberry32(hashString(entity.id));
      const mesh = CreateIcoSphere('rock', { radius: 0.5, subdivisions: 3, flat: true }, scene);
      const phases = Array.from({ length: 6 }, () => rnd() * Math.PI * 2);
      const stretch: [number, number, number] = [0.9 + rnd() * 0.5, 0.6 + rnd() * 0.3, 0.9 + rnd() * 0.5];
      const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
      const indices = mesh.getIndices();
      if (pos && indices) {
        let minY = Infinity;
        for (let i = 0; i < pos.length; i += 3) {
          const x = pos[i], y = pos[i + 1], z = pos[i + 2];
          const len = Math.hypot(x, y, z) || 1;
          const nx = x / len, ny = y / len, nz = z / len;
          const bump =
            1 +
            0.16 * Math.sin(nx * 3.1 + phases[0]) * Math.cos(nz * 2.7 + phases[1]) +
            0.1 * Math.sin(ny * 5.3 + phases[2] + nx * 2) +
            0.06 * Math.sin((nx + nz) * 7.9 + phases[3]);
          pos[i] = nx * 0.5 * bump * stretch[0];
          pos[i + 1] = Math.max(ny * 0.5 * bump * stretch[1], -0.5 * stretch[1] * 0.55);
          pos[i + 2] = nz * 0.5 * bump * stretch[2];
          minY = Math.min(minY, pos[i + 1]);
        }
        for (let i = 1; i < pos.length; i += 3) pos[i] -= minY;
        mesh.setVerticesData(VertexBuffer.PositionKind, pos, true);
        const normals: number[] = [];
        VertexData.ComputeNormals(pos, indices, normals);
        mesh.setVerticesData(VertexBuffer.NormalKind, normals, true);
        mesh.refreshBoundingInfo();
      }
      place(mesh, root, mainMat(ctx, entity, '#8d8f93', { roughness: 0.95 }));
    },
  },
  {
    ref: 'EntitySpec.sign',
    label: 'Schild',
    category: 'Technik',
    icon: '🪧',
    groundOffset: 0,
    stateKeys: ['text'],
    defaults: { material: { color: '#f0e2b0' }, state: { text: 'Willkommen!' }, physics: solid },
    build(ctx, entity, root) {
      const { scene } = ctx;
      const wood = createFixedMaterial(scene, 'postWood', WOOD_DARK, { roughness: 0.85 });
      const boardColor = entity.material?.color ?? '#f0e2b0';
      const board = mainMat(ctx, entity, '#f0e2b0', { roughness: 0.8 });
      slab(scene, root, wood, 0.12, 1.5, 0.1, 0, 0, 0.09);
      slab(scene, root, board, 1.5, 0.85, 0.08, 0, 1.0, 0);
      const text = String(entity.state?.text ?? '');
      const dark = Color3.FromHexString(/^#[0-9a-fA-F]{6}$/.test(boardColor) ? boardColor : '#f0e2b0');
      const luminance = 0.299 * dark.r + 0.587 * dark.g + 0.114 * dark.b;
      const tex = new DynamicTexture('signText', { width: 512, height: 300 }, scene, true);
      tex.hasAlpha = true;
      drawSignText(tex, text, luminance > 0.5 ? '#2a2118' : '#ffffff');
      const mat = new PBRMaterial('signTextMat', scene);
      mat.unlit = true;
      mat.albedoTexture = tex;
      mat.useAlphaFromAlbedoTexture = true;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      mat.backFaceCulling = true;
      for (const side of [-1, 1]) {
        const plane = place(CreatePlane('signFace', { width: 1.4, height: 0.78 }, scene), root, mat, 0, 1.425, side * 0.045);
        if (side === 1) plane.rotation.y = Math.PI;
      }
    },
  },
  {
    ref: 'EntitySpec.model',
    label: 'Modell (glTF)',
    category: 'Technik',
    icon: '📦',
    groundOffset: 0,
    stateKeys: [],
    defaults: { physics: solid },
    build: (ctx, entity, root) => buildModel(ctx, entity, root),
  },
];

function drawSignText(tex: DynamicTexture, text: string, color: string): void {
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  const w = 512, h = 300;
  c.clearRect(0, 0, w, h);
  const lines = wrapText(c, text, w - 40);
  let size = 96;
  const fits = () => {
    c.font = `bold ${size}px sans-serif`;
    return lines.length * size * 1.12 <= h - 30 && lines.every((l) => c.measureText(l).width <= w - 40);
  };
  while (size > 18 && !fits()) size -= 4;
  c.font = `bold ${size}px sans-serif`;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const lineH = size * 1.12;
  const top = h / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => c.fillText(line, w / 2, top + i * lineH));
  tex.update();
}

function wrapText(c: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  c.font = 'bold 56px sans-serif';
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && c.measureText(next).width > maxWidth * 1.4) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out.slice(0, 6);
}

/** Aktualisiert Material und Lichtfarbe in place (ohne Neuaufbau). */
export function updateLooks(root: TransformNode, spec: MaterialSpec | undefined): void {
  updateMainMaterials(root, spec);
  for (const node of root.getDescendants(false)) {
    const meta = node.metadata as { cpMainLight?: boolean; fallback?: string } | null;
    if (meta?.cpMainLight && node instanceof PointLight) {
      node.diffuse = lightColor(spec, meta.fallback ?? '#ffffff');
      node.specular = node.diffuse.scale(0.4);
    }
  }
}

for (const def of BUILTIN) registry.set(def.ref, def);
syncList();
