/**
 * Gemeinsamer Kern für Teich-Bausteine und das Meer unter der Insel:
 * - `WaterSurface`: eine Wasserfläche (Mesh) mit echter Spiegelung (WaterMaterial mit Renderzielen) oder einer
 *   Ersatzdarstellung (StandardMaterial mit Fresnel-Himmelsglanz und bewegter Normalenkarte),
 * - `WaterManager` (eine pro Szene): wählt die nächsten Wasserflächen für echte Spiegelungen (höchstens `maxActive`),
 *   pflegt die Renderlisten, reagiert auf Qualitätsänderungen und gibt alles beim Abbau frei.
 *
 * Spiegelung: Renderziel (RTT) mit gespiegelter Kamera (WaterMaterial). Renderliste = Himmel, Wolken, Insel (nur beim Meer),
 * Bausteine, Avatare; ohne Wasserflächen, Becken und Marker. Brechung zeigt nur den dunklen Beckenboden (`cpWaterBed`),
 * Löschfarbe des Renderziels ist die Tiefenfarbe.
 */
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector2, type Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import { WaterMaterial } from '@babylonjs/materials/water/waterMaterial';
import type { GameContext } from '../../core/context';
import {
  bedColor,
  daylightFromHorizon,
  generateBumpData,
  mixRgb,
  reflectionOptions,
  selectNearest,
  tintByDaylight,
  uvRepeat,
  waveSettings,
  type Candidate,
  type ReflectionOptions,
  type Rgb,
  type WaterSize,
} from './helpers';

const lin = (c: Rgb): Color3 => new Color3(Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2));

let bumpCache: Uint8ClampedArray | null = null;
const BUMP_SIZE = 256;
/** Neue Normalenkarte (eigene Textur pro Fläche, damit das Freigeben einzelner Flächen die anderen nicht berührt). */
function createBumpTexture(scene: Scene, name: string): DynamicTexture {
  bumpCache ??= generateBumpData(BUMP_SIZE, 7);
  const tex = new DynamicTexture(name, { width: BUMP_SIZE, height: BUMP_SIZE }, scene, true);
  try {
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    // Eigener Puffer: ImageData kopiert die Bytes nicht aus einem geteilten Cache heraus.
    ctx.putImageData(new ImageData(new Uint8ClampedArray(bumpCache), BUMP_SIZE, BUMP_SIZE), 0, 0);
    tex.update(true);
  } catch {
    /* ohne 2D-Kontext bleibt die Karte leer: Wasser sieht glatt aus */
  }
  tex.wrapU = 1;
  tex.wrapV = 1;
  return tex;
}

export interface WaterStyle {
  /** sRGB 0..1. */
  color: Rgb;
  waves: number;
  depth: number;
  flow: number;
}

export interface SurfaceOptions {
  name: string;
  mesh: Mesh;
  kind: 'pond' | 'sea';
  /** Ausdehnung in Metern (liest die aktuelle Skalierung). */
  size(): WaterSize;
  /** Kantenlänge einer Wellen-Kachel in Metern. */
  tile: number;
  style: WaterStyle;
}

export class WaterSurface {
  readonly mesh: Mesh;
  readonly kind: 'pond' | 'sea';
  private bump: DynamicTexture;
  private fallback: StandardMaterial;
  private sky = new Color3(0.5, 0.7, 0.9);
  private body = new Color3(0.1, 0.3, 0.5);
  private fresnelF = 0.5;
  private real: WaterMaterial | null = null;
  private style: WaterStyle;
  private baseUv: Float32Array | null = null;
  private lastUv: [number, number] = [-1, -1];
  private time = 0;
  private disposed = false;

  constructor(private readonly manager: WaterManager, private readonly opts: SurfaceOptions) {
    this.mesh = opts.mesh;
    this.kind = opts.kind;
    this.style = opts.style;
    const scene = manager.scene;
    this.mesh.metadata = { ...(this.mesh.metadata ?? {}), cpWater: true };
    this.mesh.isPickable = this.kind === 'pond';
    this.bump = createBumpTexture(scene, `${opts.name}.bump`);
    const fb = new StandardMaterial(`${opts.name}.fallback`, scene);
    fb.specularColor = new Color3(0.9, 0.9, 0.9);
    fb.specularPower = 180;
    fb.bumpTexture = this.bump;
    fb.bumpTexture.level = 0.9;
    fb.backFaceCulling = false;
    this.fallback = fb;
    this.mesh.material = fb;
    const uv = this.mesh.getVerticesData(VertexBuffer.UVKind);
    if (uv) this.baseUv = new Float32Array(uv);
    manager.add(this);
    this.applyColors(manager.daylight);
    this.updateUv(true);
  }

  isReal(): boolean {
    return this.real !== null;
  }
  get id(): string {
    return this.mesh.uniqueId.toString();
  }
  candidate(): Candidate {
    const p = this.mesh.getAbsolutePosition();
    return { id: this.id, x: p.x, y: p.y, z: p.z };
  }

  setStyle(style: WaterStyle): void {
    this.style = style;
    this.applyColors(this.manager.daylight);
    this.applyWaves();
  }

  /** Schaltet zwischen echter Spiegelung (Renderziele) und Ersatzdarstellung um. */
  setReal(on: boolean, opts: ReflectionOptions): void {
    if (this.disposed) return;
    if (!on && this.real) {
      const old = this.real;
      this.mesh.material = this.fallback;
      old.bumpTexture = null as never; // die eigene Normalenkarte bleibt der Fläche erhalten
      old.dispose(false);
      this.real = null;
    }
    if (on && !this.real && opts.reflect) {
      try {
        const scene = this.manager.scene;
        const mat = new WaterMaterial(`${this.opts.name}.water`, scene, new Vector2(opts.size, opts.size));
        mat.bumpTexture = this.bump;
        mat.backFaceCulling = false;
        mat.waveLength = 1;
        mat.waveCount = 24;
        mat.bumpSuperimpose = true;
        mat.fresnelSeparate = true;
        mat.bumpAffectsReflection = false;
        mat.specularColor = new Color3(0.85, 0.85, 0.85);
        mat.specularPower = 140;
        mat.maxSimultaneousLights = 4;
        const refl = mat.reflectionTexture;
        const refr = mat.refractionTexture;
        if (refl) refl.renderList = this.kind === 'sea' ? this.manager.seaList : this.manager.pondList;
        if (refr) {
          refr.renderList = opts.refract && this.kind === 'pond' ? this.manager.bedList : [];
          // Ohne Brechung: einmal mit Tiefenfarbe löschen, danach nicht mehr rendern.
          refr.refreshRate = opts.refract && this.kind === 'pond' ? 1 : 0;
        }
        this.real = mat;
        this.mesh.material = mat;
        this.applyWaves();
        this.applyColors(this.manager.daylight);
      } catch (error) {
        console.warn('[wasser] Spiegelung nicht möglich, nutze Ersatzdarstellung', error);
        this.real = null;
        this.mesh.material = this.fallback;
      }
    }
  }

  private applyWaves(): void {
    const w = waveSettings(this.style.waves, this.style.flow, this.kind === 'sea');
    const m = this.real;
    if (!m) return;
    m.windForce = w.windForce;
    m.waveHeight = w.waveHeight;
    m.bumpHeight = w.bumpHeight;
    m.waveSpeed = w.waveSpeed;
    m.windDirection = new Vector2(w.windDirection[0], w.windDirection[1]);
    m.colorBlendFactor = w.colorBlend;
    m.colorBlendFactor2 = w.reflectionTint;
  }

  private applyColors(daylight: number): void {
    const { color, depth } = this.style;
    const tinted = tintByDaylight(color, daylight);
    const deep = tintByDaylight(bedColor(color, depth), daylight);
    const m = this.real;
    if (m) {
      m.waterColor = lin(tinted);
      m.diffuseColor = Color3.White();
      const refr = m.refractionTexture;
      if (refr) refr.clearColor = new Color4(Math.pow(deep[0], 2.2), Math.pow(deep[1], 2.2), Math.pow(deep[2], 2.2), 1);
    }
    // Ersatzdarstellung: Grundfarbe = Tiefenfarbe, Himmelsglanz (Fresnel) am Rand in Horizontfarbe
    const fb = this.fallback;
    fb.diffuseColor = lin(mixRgb(tinted, deep, 0.5));
    const fog = this.manager.scene.fogColor;
    this.sky = new Color3(fog.r, fog.g, fog.b).scale(0.5 + 0.5 * daylight);
    this.body = lin(mixRgb(tinted, deep, 0.35)).scale(0.5);
    this.applyFresnel();
    fb.specularColor = new Color3(0.9, 0.9, 0.9).scale(0.1 + 0.5 * daylight);
  }

  /** Himmelsglanz der Ersatzdarstellung: Schlick-Näherung nach dem Blickwinkel auf die Fläche (flacher = mehr Himmel). */
  private applyFresnel(): void {
    const f = this.fresnelF;
    this.fallback.emissiveColor = this.body.scale(1 - f).add(this.sky.scale(f * 0.55));
  }

  private updateUv(force = false): void {
    if (!this.baseUv) return;
    const [ru, rv] = uvRepeat(this.opts.size(), this.opts.tile);
    if (!force && Math.abs(ru - this.lastUv[0]) < 1e-4 && Math.abs(rv - this.lastUv[1]) < 1e-4) return;
    this.lastUv = [ru, rv];
    const out = new Float32Array(this.baseUv.length);
    for (let i = 0; i < out.length; i += 2) {
      out[i] = this.baseUv[i] * ru;
      out[i + 1] = this.baseUv[i + 1] * rv;
    }
    this.mesh.updateVerticesData(VertexBuffer.UVKind, out);
  }

  update(dt: number, daylight: number, daylightChanged: boolean, cam: Vector3 | null): void {
    if (this.disposed) return;
    this.updateUv();
    if (cam && !this.real) {
      const p = this.mesh.getAbsolutePosition();
      const dist = Math.max(0.001, Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z));
      const sinEl = Math.min(1, Math.abs(cam.y - p.y) / dist);
      const f = Math.min(0.9, 0.08 + 0.92 * Math.pow(1 - sinEl, 3));
      if (Math.abs(f - this.fresnelF) > 0.01) {
        this.fresnelF = f;
        this.applyFresnel();
      }
    }
    this.time += dt;
    const drift = 0.4 + 1.6 * this.style.flow;
    this.bump.uOffset = this.time * 0.012 * drift;
    this.bump.vOffset = this.time * 0.009 * drift;
    if (daylightChanged) this.applyColors(daylight);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.manager.remove(this);
    if (this.real) {
      this.real.bumpTexture = null as never;
      this.real.dispose(false);
      this.real = null;
    }
    this.fallback.dispose(false, false);
    this.bump.dispose();
  }
}

const SKIP_NAMES = /gizmo|grid|selection|ghost|handle|marker|outline/i;

export class WaterManager {
  readonly scene: Scene;
  /** Gemeinsame Renderlisten (werden an Ort und Stelle aktualisiert, die Renderziele halten die Referenz). */
  readonly pondList: AbstractMesh[] = [];
  readonly seaList: AbstractMesh[] = [];
  readonly bedList: AbstractMesh[] = [];
  daylight = 1;
  options: ReflectionOptions;
  private surfaces = new Set<WaterSurface>();
  private dirty = true;
  private elapsed = 99;
  private offs: (() => void)[] = [];
  private frame: Observer<Scene> | null = null;
  private lastTime = 0;

  constructor(private readonly ctx: GameContext, private readonly onEmpty: () => void) {
    this.scene = ctx.scene;
    this.options = reflectionOptions(ctx.quality.features());
    const scene = this.scene;
    const added = scene.onNewMeshAddedObservable.add(() => (this.dirty = true));
    const removed = scene.onMeshRemovedObservable.add((mesh) => {
      for (const list of [this.pondList, this.seaList, this.bedList]) {
        const i = list.indexOf(mesh);
        if (i >= 0) list.splice(i, 1);
      }
      this.dirty = true;
    });
    this.offs.push(() => scene.onNewMeshAddedObservable.remove(added), () => scene.onMeshRemovedObservable.remove(removed));
    this.offs.push(
      ctx.quality.onChange((_level, features) => {
        this.options = reflectionOptions(features);
        // Renderziele neu anlegen (Größe, Brechung): alles zurück auf Ersatz, Auswahl sofort neu
        for (const s of this.surfaces) s.setReal(false, this.options);
        this.elapsed = 99;
      }),
    );
    this.lastTime = performance.now();
    this.frame = scene.onBeforeRenderObservable.add(() => this.update());
  }

  add(s: WaterSurface): void {
    this.surfaces.add(s);
    this.elapsed = 99;
    this.dirty = true;
  }
  remove(s: WaterSurface): void {
    this.surfaces.delete(s);
    if (this.surfaces.size === 0) this.onEmpty();
  }

  private rebuildLists(): void {
    this.dirty = false;
    this.pondList.length = 0;
    this.seaList.length = 0;
    this.bedList.length = 0;
    for (const m of this.scene.meshes) {
      const meta = m.metadata as { cpWater?: boolean; cpWaterBed?: boolean; buildOnly?: boolean; isGround?: boolean } | null;
      if (m.isDisposed()) continue;
      if (meta?.cpWaterBed) {
        this.bedList.push(m);
        continue;
      }
      if (meta?.cpWater || meta?.buildOnly || !m.isVisible || SKIP_NAMES.test(m.name)) continue;
      if (m.getTotalVertices() === 0) continue;
      this.seaList.push(m);
      if (!meta?.isGround) this.pondList.push(m);
    }
  }

  private update(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.dirty) this.rebuildLists();
    const fog = this.scene.fogColor;
    const day = daylightFromHorizon([fog.r, fog.g, fog.b]);
    const changed = Math.abs(day - this.daylight) > 0.004;
    if (changed) this.daylight = day;
    this.elapsed += dt;
    if (this.elapsed > 0.5) {
      this.elapsed = 0;
      this.select();
    }
    const cam = this.scene.activeCamera?.globalPosition ?? null;
    for (const s of this.surfaces) s.update(dt, this.daylight, changed, cam);
  }

  private select(): void {
    const cam = this.scene.activeCamera?.globalPosition;
    const ponds: Candidate[] = [];
    for (const s of this.surfaces) if (s.kind === 'pond') ponds.push(s.candidate());
    const chosen = selectNearest(ponds, cam ? [cam.x, cam.y, cam.z] : [0, 0, 0], this.options.maxActive);
    for (const s of this.surfaces) {
      const want = this.options.reflect && (s.kind === 'sea' || chosen.has(s.id));
      s.setReal(want, this.options);
    }
  }

  /** Anzahl der Flächen mit echtem Renderziel (Diagnose, Tests). */
  activeCount(): number {
    let n = 0;
    for (const s of this.surfaces) if (s.isReal()) n++;
    return n;
  }

  registerBed(mesh: AbstractMesh): void {
    mesh.metadata = { ...(mesh.metadata ?? {}), cpWaterBed: true };
    this.dirty = true;
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    if (this.frame) this.scene.onBeforeRenderObservable.remove(this.frame);
    this.frame = null;
    for (const s of [...this.surfaces]) s.dispose();
  }
}

const managers = new WeakMap<Scene, WaterManager>();
export function getWaterManager(ctx: GameContext): WaterManager {
  let m = managers.get(ctx.scene);
  if (!m) {
    const created: WaterManager = new WaterManager(ctx, () => {
      // keine Fläche mehr: Beobachter abmelden (wird beim nächsten Bedarf neu angelegt)
      created.dispose();
      managers.delete(ctx.scene);
    });
    m = created;
    managers.set(ctx.scene, m);
  }
  return m;
}
