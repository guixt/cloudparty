/**
 * Paket 21 – Umgebungs-Beleuchtung und Reflexionen (Image-Based Lighting).
 *
 * Alle PBR-Materialien bekommen über `scene.environmentTexture` Spiegelungen von Himmel, Sonne und Horizont sowie
 * Umgebungslicht (Kugelfunktionen). Zwei Betriebsarten, gewählt über `features().probeSize`:
 *  - Sonde (> 0): eine `ReflectionProbe` über der Insel rendert Himmel, Wolken und Insel (keine Avatare/Objekte)
 *    nur bei Bedarf (RENDER_ONCE) in eine Würfeltextur.
 *  - prozedural (0): kleine Würfeltextur, aus den Himmelsfarben berechnet (siehe ../ibl/proceduralSky.ts).
 * Das Umgebungslicht (Kugelfunktionen/Irradiance) wird in beiden Fällen aus der prozeduralen Fassung des Himmels
 * berechnet (CPU, winzig) – das braucht keinen GPU-Rücklesevorgang und ist stabil.
 *
 * Helligkeit: Die Umgebung (index.ts) setzt `hemi.intensity` bei JEDEM `apply` neu. Deshalb merken wir uns den
 * zuletzt von dort gesetzten Wert als Basis und schreiben `Basis * Faktor` zurück (in `apply` und – falls jemand
 * anderes den Wert verändert hat, z. B. der Tageszyklus – in `update`). So bleibt die Szene nicht überbelichtet,
 * ohne dass die anderen Module etwas davon wissen.
 *
 * Abschalten: `probeSize` lässt sich nicht auf „aus“ stellen (0 = prozedural). Ganz aus: `?noibl` in der URL
 * oder `localStorage['cloudparty.noibl'] = '1'`. Fehler schalten den Effekt still ab (console.warn).
 */
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { CubeMapToSphericalPolynomialTools } from '@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe';
import { Constants } from '@babylonjs/core/Engines/constants';
import '@babylonjs/core/Engines/Extensions/engine.rawTexture';
import '@babylonjs/core/Engines/Extensions/engine.cubeTexture';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { EnvironmentSpec } from '../../../../shared/types';
import type { QualityFeatures } from '../../quality';
import { luminance, hemiFactor, modeForQuality, sameMode, shouldRefresh, signature, changeScore, type ProbeMode, type SkySample } from '../ibl/logic';
import { buildProceduralCube, encodeFaceRgba8, ENCODE_SCALE } from '../ibl/proceduralSky';
import type { EnvironmentFeature, EnvironmentHandle } from '../features';
import { parseLightDirection, resolveSkyLook, sunVector, toLinear, type Rgb } from '../presets';

/** Höhe der Sonde über der Inseloberfläche (m). */
const PROBE_HEIGHT = 6;
/** Faktor der Szene auf die Umgebungsbeleuchtung (zusätzlich zu `environmentIntensity` der Materialien). */
const SCENE_ENV_INTENSITY = 0.6;

function disabledByUser(): boolean {
  try {
    if (typeof location !== 'undefined' && /[?&]noibl\b/.test(location.search)) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem('cloudparty.noibl') === '1';
  } catch {
    return false;
  }
}

interface ShaderInternals {
  _colors3?: Record<string, { r: number; g: number; b: number }>;
  _vectors3?: Record<string, { x: number; y: number; z: number }>;
  _floats?: Record<string, number>;
}

/** Aktueller Himmel (linear). Bevorzugt die echten Shader-Werte (enthalten Tageszyklus), sonst aus der Umgebung. */
function readSky(handle: EnvironmentHandle, env: EnvironmentSpec): SkySample {
  const material = handle.sky.mesh.material as unknown as ShaderInternals | null;
  const c = material?._colors3;
  const v = material?._vectors3?.sunDir;
  const f = material?._floats;
  if (c?.topColor && c.midColor && c.horizonColor && c.belowColor && c.sunDisc && c.sunGlow && v && f) {
    const rgb = (k: string): Rgb => [c[k].r, c[k].g, c[k].b];
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return {
      top: rgb('topColor'), mid: rgb('midColor'), horizon: rgb('horizonColor'), below: rgb('belowColor'),
      sunDisc: rgb('sunDisc'), sunGlow: rgb('sunGlow'),
      sunDir: [v.x / len, v.y / len, v.z / len], sunVisible: f.sunVisible ?? 1, stars: f.stars ?? 0,
    };
  }
  const look = resolveSkyLook(env.sky);
  const dir = parseLightDirection(env.light?.direction);
  return {
    top: toLinear(look.top), mid: toLinear(look.mid), horizon: toLinear(look.horizon), below: toLinear(look.below),
    sunDisc: toLinear(look.sunDisc), sunGlow: toLinear(look.sunGlow),
    sunDir: sunVector(dir), sunVisible: dir.elevation > -6 ? 1 : 0, stars: look.stars,
  };
}

export function createIblFeature(handle: EnvironmentHandle): EnvironmentFeature {
  const { scene } = handle;
  let disabled = disabledByUser();
  let mode: ProbeMode | null = null;
  let probe: ReflectionProbe | null = null;
  let raw: RawCubeTexture | null = null;
  let updateSeconds = 0;
  let time = 0;
  let lastRefresh = -Infinity;
  let lastSig: number[] | null = null;
  let curSig: number[] | null = null;
  let curSky: SkySample | null = null;
  let iblLum = 0.3;
  let hemiBase = -1;
  let hemiApplied = -1;

  const fail = (what: string, error: unknown): void => {
    console.warn(`[ibl] ${what} – Effekt abgeschaltet`, error);
    disabled = true;
    teardown();
    scene.environmentTexture = null;
    restoreHemi();
  };

  function disposeTextures(): void {
    try {
      probe?.dispose();
    } catch (error) {
      console.warn('[ibl] Sonde konnte nicht freigegeben werden', error);
    }
    probe = null;
    raw?.dispose();
    raw = null;
  }
  function teardown(): void {
    disposeTextures();
    mode = null;
    lastSig = null;
  }

  function restoreHemi(): void {
    if (hemiBase >= 0 && handle.hemi.intensity === hemiApplied) handle.hemi.intensity = hemiBase;
    hemiBase = -1;
    hemiApplied = -1;
  }

  /** Hemisphärenlicht = Basis (von der Umgebung gesetzt) * Faktor. Erkennt fremde Änderungen am Wert. */
  function syncHemi(rebase: boolean): void {
    const hemi = handle.hemi;
    if (disabled || !mode) return;
    if (rebase || hemiBase < 0 || Math.abs(hemi.intensity - hemiApplied) > 1e-6) hemiBase = hemi.intensity;
    const hemiLum = hemiBase * (luminance([hemi.diffuse.r, hemi.diffuse.g, hemi.diffuse.b]) + luminance([hemi.groundColor.r, hemi.groundColor.g, hemi.groundColor.b])) * 0.5;
    const factor = hemiFactor(hemiLum, iblLum, scene.environmentIntensity);
    hemiApplied = hemiBase * factor;
    hemi.intensity = hemiApplied;
  }

  function makeRaw(size: number, data: Uint8Array[]): RawCubeTexture {
    const tex = new RawCubeTexture(scene, data, size, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
    tex.name = 'env.ibl.procedural';
    tex.gammaSpace = true;
    tex.level = ENCODE_SCALE;
    return tex;
  }

  function probeMeshes(): AbstractMesh[] {
    const list: AbstractMesh[] = [handle.sky.mesh, ...handle.clouds.meshes];
    const island = handle.getIsland();
    if (island) list.push(island.mesh);
    return list.filter((m) => !m.isDisposed());
  }

  /** Setzt die Texturen passend zur Betriebsart neu auf (nach Qualitätswechsel). */
  function build(next: ProbeMode): void {
    const previousProbe = probe;
    const previousRaw = raw;
    probe = null;
    raw = null;
    mode = next;
    if (next.kind === 'probe') {
      try {
        const caps = scene.getEngine().getCaps();
        const useFloat = !!(caps.textureHalfFloatRender || caps.textureFloatRender);
        const p = new ReflectionProbe('env.ibl.probe', next.size, scene, true, useFloat, true);
        p.position.set(0, PROBE_HEIGHT, 0);
        p.renderList?.push(...probeMeshes());
        p.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
        p.cubeTexture.name = 'env.ibl.probe';
        probe = p;
        scene.environmentTexture = p.cubeTexture;
      } catch (error) {
        console.warn('[ibl] Reflexionssonde nicht verfügbar, nutze prozedurale Umgebung', error);
        mode = { kind: 'procedural', size: modeForQuality(0).size };
      }
    }
    if (mode.kind === 'procedural') {
      const sky = curSky;
      const cube = sky ? buildProceduralCube(sky, mode.size) : null;
      const data = cube ? cube.faces.map(encodeFaceRgba8) : Array.from({ length: 6 }, () => new Uint8Array(mode!.size * mode!.size * 4).fill(128));
      raw = makeRaw(mode.size, data);
      scene.environmentTexture = raw;
    }
    scene.environmentIntensity = SCENE_ENV_INTENSITY;
    // Alte Texturen erst freigeben, nachdem die neue gesetzt ist.
    try {
      previousProbe?.dispose();
    } catch (error) {
      console.warn('[ibl] alte Sonde konnte nicht freigegeben werden', error);
    }
    previousRaw?.dispose();
    lastSig = null;
    lastRefresh = -Infinity;
    if (curSky) refresh();
  }

  /** Sonde neu rendern bzw. prozedurale Textur neu füllen und Umgebungslicht neu berechnen. */
  function refresh(): void {
    if (!mode || !curSky || !curSig) return;
    lastRefresh = time;
    lastSig = curSig;
    const cube = buildProceduralCube(curSky, mode.kind === 'procedural' ? mode.size : 16);
    iblLum = cube.meanLuminance;
    if (mode.kind === 'procedural' && raw) {
      raw.update(cube.faces.map(encodeFaceRgba8), Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, false);
    } else if (probe) {
      const list = probe.renderList;
      if (list) {
        list.length = 0;
        list.push(...probeMeshes());
      }
      // Erneutes Setzen löst genau ein weiteres Rendern aus.
      probe.cubeTexture.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    }
    const info = {
      size: cube.size,
      right: cube.faces[0], left: cube.faces[1], up: cube.faces[2], down: cube.faces[3], front: cube.faces[4], back: cube.faces[5],
      format: Constants.TEXTUREFORMAT_RGB, type: Constants.TEXTURETYPE_FLOAT, gammaSpace: false,
    };
    const polynomial = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial(info);
    // Texturen sind in beiden Fällen mit `level` bzw. linear gespeichert: Polynom passend zum Texturfaktor.
    const texture = scene.environmentTexture;
    if (texture) {
      const k = mode.kind === 'procedural' ? 1 / ENCODE_SCALE : 1;
      polynomial.scaleInPlace(k);
      texture.sphericalPolynomial = polynomial;
    }
    syncHemi(false);
  }

  function safe(label: string, fn: () => void): void {
    if (disabled) return;
    try {
      fn();
    } catch (error) {
      fail(label, error);
    }
  }

  return {
    id: 'ibl',
    apply(env) {
      safe('apply', () => {
        curSky = readSky(handle, env);
        curSig = signature(curSky, handle.sun.intensity);
        // Die Umgebung hat gerade `hemi.intensity` neu gesetzt: neue Basis, Faktor wieder anwenden.
        syncHemi(true);
        if (mode && lastSig === null) refresh();
        if (!mode) return;
        const score = changeScore(lastSig, curSig);
        // Große Änderungen (anderer Himmel) sofort, damit kein Bild mit altem Himmel entsteht.
        if (score >= 0.3) refresh();
      });
    },
    islandChanged() {
      safe('islandChanged', () => {
        if (probe) lastSig = null; // Insel neu aufgebaut: Sonde neu rendern (beim nächsten update)
      });
    },
    update(dt, t) {
      if (disabled || !mode) return;
      time = t;
      safe('update', () => {
        if (hemiBase >= 0 && Math.abs(handle.hemi.intensity - hemiApplied) > 1e-6) syncHemi(false);
        if (!curSig) return;
        const since = time - lastRefresh;
        const score = changeScore(lastSig, curSig);
        // Nach `islandChanged` (lastSig = null) gilt: nach MIN_REFRESH_GAP auffrischen.
        if (shouldRefresh({ score, sinceLast: since, updateSeconds, periodic: mode!.kind === 'probe' })) refresh();
      });
    },
    onQuality(features: QualityFeatures) {
      if (disabled) return;
      updateSeconds = features.probeUpdateSeconds;
      safe('onQuality', () => {
        const next = modeForQuality(features.probeSize);
        if (!sameMode(mode, next)) build(next);
      });
    },
    dispose() {
      const had = !!mode;
      restoreHemi();
      teardown();
      if (had) scene.environmentTexture = null;
    },
  };
}
