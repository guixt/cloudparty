/**
 * Paket 1 – Umgebung & Look: schwebende Insel, Himmel, Wolken, Sonne mit Schatten, Dunst,
 * Nachbearbeitung. Liest `environment` und `island` aus der WorldSpec und reagiert live.
 */
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { DEFAULT_ISLAND, type EnvironmentSpec, type IslandSpec } from '../../../shared/types';
import type { GameContext, GameModule } from '../../core/context';
import { createClouds, type Clouds } from './clouds';
import { createIsland, type Island } from './island';
import { createPostProcessing, type PostProcessing } from './post';
import { kelvinToRgb, mulRgb, parseLightDirection, resolveSkyLook, scaleRgb, sunIntensityFrom, sunVector, toLinear } from './presets';
import { createSky, type SkyDome } from './sky';

const rgb3 = (c: [number, number, number]) => new Color3(c[0], c[1], c[2]);

class EnvironmentRuntime {
  private sky: SkyDome;
  private clouds: Clouds;
  private post: PostProcessing;
  private hemi: HemisphericLight;
  private sun: DirectionalLight;
  private shadows: ShadowGenerator;
  private island: Island | null = null;
  private islandRadius = DEFAULT_ISLAND.radius;
  private islandDepth = DEFAULT_ISLAND.depth;
  private time = 0;
  private offs: (() => void)[] = [];
  private frame: ReturnType<Scene['onBeforeRenderObservable']['add']>;

  constructor(private ctx: GameContext) {
    const { scene, bus, store } = ctx;
    this.sky = createSky(scene);
    this.clouds = createClouds(scene, store.getState().world.island?.seed ?? DEFAULT_ISLAND.seed);
    this.hemi = new HemisphericLight('env.hemi', new Vector3(0, 1, 0), scene);
    this.sun = new DirectionalLight('env.sun', new Vector3(-0.5, -1, -0.4), scene);
    this.sun.autoUpdateExtends = false;
    this.sun.autoCalcShadowZBounds = false;

    this.shadows = new ShadowGenerator(2048, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadows.bias = 0.0008;
    this.shadows.normalBias = 0.03;
    this.shadows.setDarkness(0.1);
    this.shadows.transparencyShadow = true;

    this.post = createPostProcessing(scene);
    this.post.excludeFromGlow(this.sky.mesh);
    for (const mesh of this.clouds.meshes) this.post.excludeFromGlow(mesh);

    for (const mesh of ctx.shadows.casters) this.addCaster(mesh);
    this.offs.push(bus.on('render.shadowCaster.added', ({ mesh }) => this.addCaster(mesh)));
    this.offs.push(bus.on('environment.changed', ({ environment }) => this.applyEnvironment(environment)));
    this.offs.push(bus.on('world.loaded', ({ world }) => {
      this.buildIsland(world.island);
      this.applyEnvironment(world.environment);
    }));

    this.frame = scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(0.1, ctx.engine.getDeltaTime() / 1000);
      this.time += dt;
      this.sky.update(this.time);
      this.clouds.update(dt);
    });

    const world = store.getState().world;
    this.buildIsland(world.island);
    this.applyEnvironment(world.environment);
  }

  private addCaster(mesh: AbstractMesh): void {
    if (mesh.isDisposed()) return;
    this.shadows.addShadowCaster(mesh, false);
    mesh.onDisposeObservable.addOnce(() => this.shadows.removeShadowCaster(mesh, false));
  }

  private buildIsland(spec: IslandSpec | undefined): void {
    const island = { ...DEFAULT_ISLAND, ...(spec ?? {}) };
    this.island?.dispose();
    this.island = createIsland(this.ctx.scene, island);
    this.islandRadius = island.radius;
    this.islandDepth = island.depth;
    this.updateShadowFrustum();
  }

  private toSun = new Vector3(0.4, 0.7, 0.5);

  private updateShadowFrustum(): void {
    const r = this.islandRadius * 1.25;
    this.sun.orthoLeft = -r;
    this.sun.orthoRight = r;
    this.sun.orthoTop = r;
    this.sun.orthoBottom = -r;
    const dist = this.islandRadius * 2.2 + 20;
    this.sun.position = this.toSun.scale(dist);
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = dist + this.islandRadius + this.islandDepth + 20;
  }

  applyEnvironment(env: EnvironmentSpec): void {
    const { scene } = this.ctx;
    const look = resolveSkyLook(env.sky);
    const dir = parseLightDirection(env.light?.direction);
    const real = sunVector(dir);
    // Beleuchtung nie flacher als 6° (sonst entstehen endlos lange Schatten).
    const lit = sunVector({ azimuth: dir.azimuth, elevation: Math.max(6, dir.elevation) });
    this.toSun.set(lit[0], lit[1], lit[2]);
    this.sun.direction = this.toSun.scale(-1);
    this.updateShadowFrustum();

    const intensity = env.light?.intensity ?? 3;
    const tint = mulRgb(kelvinToRgb(env.light?.temperatureK ?? 6000), look.sunTint);
    const horizonFade = Math.max(0.15, Math.min(1, (dir.elevation + 4) / 14));
    this.sun.intensity = sunIntensityFrom(intensity) * look.sunFactor * horizonFade;
    this.sun.diffuse = rgb3(tint);
    this.sun.specular = rgb3(scaleRgb(tint, 0.4));

    this.hemi.diffuse = rgb3(toLinear(look.hemiSky));
    this.hemi.groundColor = rgb3(toLinear(look.hemiGround));
    this.hemi.specular = Color3.Black();
    this.hemi.intensity = look.hemiIntensity * (0.55 + 0.45 * Math.min(2, intensity / 3));

    scene.clearColor = new Color4(...toLinear(look.horizon), 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = rgb3(toLinear(look.horizon));
    scene.fogDensity = look.fogDensity;

    const sunVisible = dir.elevation > -6 ? 1 : 0;
    this.sky.apply(look, new Vector3(real[0], real[1], real[2]), sunVisible);
    this.clouds.apply(look);
    this.post.setExposure(look.exposure);
  }

  dispose(): void {
    const { scene } = this.ctx;
    for (const off of this.offs) off();
    scene.onBeforeRenderObservable.remove(this.frame);
    this.island?.dispose();
    this.clouds.dispose();
    this.sky.dispose();
    this.post.dispose();
    this.shadows.dispose();
    this.sun.dispose();
    this.hemi.dispose();
  }
}

let runtime: EnvironmentRuntime | null = null;

const environment: GameModule = {
  id: 'environment',
  init(ctx) {
    runtime = new EnvironmentRuntime(ctx);
  },
  dispose() {
    runtime?.dispose();
    runtime = null;
  },
};
export default environment;
