/**
 * MaterialSpec → PBR-Material. Hauptteile eines Prefabs ("main") werden von
 * `entity.material` eingefärbt, feste Teile behalten ihre eingebaute Farbe.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene';
import type { MaterialSpec } from '../../../shared/types';
import { fallbackEnvironment, isFallbackEnvironment } from './fallbackEnv';
import { resolveMaterial } from './materialPresets';
import { acquirePattern, defaultPatternColor, hasBump, patternKey, releasePattern } from './patterns';

export interface MaterialBase {
  color: string;
  emissive?: string;
  /** Leuchtstärke als Anteil der Farbe, wenn kein emissive gesetzt ist (0..1). */
  glow?: number;
  metallic?: number;
  roughness?: number;
  alpha?: number;
}

interface MainMeta {
  cpMain: true;
  base: MaterialBase;
  /** Signatur der aktuell gesetzten Texturen (siehe textureSignature). */
  texSig?: string;
  textureUrl?: string;
  patternKey?: string;
  bumpKey?: string;
}

function parseColor(hex: string | undefined, fallback: Color3): Color3 {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return Color3.FromHexString(hex);
}

/** Höchste Leuchtstärke, die der Glow noch sinnvoll darstellt. */
const MAX_EMISSIVE = 5;

const clampUv = (v: number | undefined) => Math.min(50, Math.max(0.1, v ?? 1));

/** Ein Wert, der entscheidet, ob die Texturen eines Hauptmaterials neu aufgebaut werden müssen. */
export function textureSignature(r: MaterialSpec, fallbackColor = '#cccccc'): string {
  const pattern = r.pattern && r.pattern !== 'none' ? r.pattern : '';
  if (r.textureUrl) return `url|${r.textureUrl}|${clampUv(r.uvScale)}`;
  if (!pattern) return '';
  const c1 = r.color ?? fallbackColor;
  return patternKey(pattern, c1, r.patternColor ?? defaultPatternColor(c1), undefined, false, clampUv(r.uvScale));
}

function clearTextures(mat: PBRMaterial, meta: MainMeta): void {
  const scene = mat.getScene();
  if (meta.patternKey) releasePattern(scene, meta.patternKey);
  if (meta.bumpKey) releasePattern(scene, meta.bumpKey);
  if (meta.textureUrl) mat.albedoTexture?.dispose();
  meta.patternKey = meta.bumpKey = meta.textureUrl = undefined;
  mat.albedoTexture = null;
  mat.bumpTexture = null;
}

/** Wendet Spec (inkl. Voreinstellung) + Basiswerte auf ein PBR-Material an. */
export function applyMaterialSpec(mat: PBRMaterial, spec: MaterialSpec | undefined, base: MaterialBase): void {
  const r = resolveMaterial(spec);
  const meta = mat.metadata as MainMeta | null;
  const isMain = !!meta?.cpMain;
  const color = parseColor(r.color, parseColor(base.color, Color3.White()));
  mat.albedoColor = color;
  // Leuchten: emissive (oder Anteil der Farbe) mal emissiveIntensity.
  const emissive = r.emissive ?? base.emissive;
  const gain = Math.min(MAX_EMISSIVE, Math.max(0, r.emissiveIntensity ?? 1));
  const emissiveBase = emissive ? parseColor(emissive, Color3.Black()) : base.glow ? color.scale(base.glow) : Color3.Black();
  mat.emissiveColor = emissiveBase.scale(gain);
  let metallic = r.metallic ?? base.metallic ?? 0;
  let roughness = r.roughness ?? base.roughness ?? 0.75;
  const reflect = r.reflect;
  // Echtzeit-Spiegel (oder Rückfall ohne Spiegel-Textur): sehr glatt und spiegelnd.
  if (r.mirror) {
    metallic = Math.max(metallic, 0.9);
    roughness = Math.min(roughness, 0.05);
  }
  mat.metallic = metallic;
  mat.roughness = roughness;
  // Reflexionsstärke: 0.6 ist der Grundwert der Bausteine; reflect 1 verdoppelt ihn ungefähr.
  mat.environmentIntensity = reflect === undefined ? (r.mirror ? 1.2 : 0.6) : 0.15 + reflect * 1.35;
  // Klarlack
  const coat = Math.min(1, Math.max(0, r.clearcoat ?? 0));
  mat.clearCoat.isEnabled = coat > 0;
  mat.clearCoat.intensity = coat;
  mat.clearCoat.roughness = 0.04;
  // Deckkraft / Glas. Rückfall statt Sub-Surface-Brechung (braucht ein Renderziel pro Glas und ist unter
  // Software-GL unzuverlässig): Alpha + kräftige Spiegelung/Fresnel über den Brechungsindex.
  const glass = Math.min(1, Math.max(0, r.glass ?? 0));
  let alpha = Math.min(1, Math.max(0, r.alpha ?? base.alpha ?? 1));
  if (glass > 0) alpha = Math.min(alpha, 1 - glass * 0.85);
  mat.alpha = alpha;
  mat.transparencyMode = alpha < 1 ? PBRMaterial.PBRMATERIAL_ALPHABLEND : PBRMaterial.PBRMATERIAL_OPAQUE;
  mat.indexOfRefraction = glass > 0 ? Math.min(2.5, Math.max(1, r.ior ?? 1.5)) : 1.5;
  mat.useRadianceOverAlpha = glass > 0;
  mat.useSpecularOverAlpha = glass > 0;
  mat.backFaceCulling = glass === 0;
  mat.twoSidedLighting = glass > 0;
  // Ohne Umgebung der Szene (Reflexionssonde) bekommen spiegelnde Materialien einen einfachen Himmelsverlauf.
  const scene = mat.getScene();
  const wantsEnv = metallic > 0.3 || (reflect ?? 0) > 0 || glass > 0;
  if (wantsEnv && !scene.environmentTexture && !mat.reflectionTexture) mat.reflectionTexture = fallbackEnvironment(scene);
  else if ((!wantsEnv || scene.environmentTexture) && isFallbackEnvironment(scene, mat.reflectionTexture)) mat.reflectionTexture = null;
  if (!isMain || !meta) return;

  // Texturen: textureUrl hat Vorrang vor dem Muster.
  const sig = textureSignature(r, base.color);
  if (meta.texSig !== sig) {
    clearTextures(mat, meta);
    meta.texSig = sig;
    const uv = clampUv(r.uvScale);
    if (r.textureUrl) {
      const tex = new Texture(r.textureUrl, scene);
      tex.hasAlpha = false;
      tex.uScale = tex.vScale = uv;
      mat.albedoTexture = tex;
      meta.textureUrl = r.textureUrl;
    } else if (r.pattern && r.pattern !== 'none') {
      const c1 = r.color ?? base.color;
      const c2 = r.patternColor ?? defaultPatternColor(c1);
      const got = acquirePattern(scene, r.pattern, c1, c2, false, uv);
      if (got) {
        mat.albedoTexture = got.tex;
        meta.patternKey = got.key;
        if (hasBump(r.pattern)) {
          const bump = acquirePattern(scene, r.pattern, c1, c2, true, uv);
          if (bump) {
            mat.bumpTexture = bump.tex;
            mat.invertNormalMapX = mat.invertNormalMapY = false;
            meta.bumpKey = bump.key;
          }
        }
      }
    }
  }
  // Texturen werden mit weißer Grundfarbe nicht eingefärbt (Muster tragen ihre Farbe selbst).
  if (mat.albedoTexture && (meta.patternKey || !r.color)) mat.albedoColor = Color3.White();
}

/** Material für den Hauptteil eines Prefabs (folgt entity.material, auch später in place). */
export function createMainMaterial(scene: Scene, name: string, spec: MaterialSpec | undefined, base: MaterialBase): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.metadata = { cpMain: true, base } satisfies MainMeta;
  mat.environmentIntensity = 0.6;
  applyMaterialSpec(mat, spec, base);
  return mat;
}

/** Festes Material (Eigenfarbe des Prefabs, ignoriert entity.material). */
export function createFixedMaterial(scene: Scene, name: string, color: string, opts: Partial<MaterialBase> = {}): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = Color3.FromHexString(color);
  mat.metallic = opts.metallic ?? 0;
  mat.roughness = opts.roughness ?? 0.75;
  mat.environmentIntensity = 0.6;
  if (opts.emissive) mat.emissiveColor = Color3.FromHexString(opts.emissive);
  if (opts.alpha !== undefined && opts.alpha < 1) {
    mat.alpha = opts.alpha;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  return mat;
}

/** Aktualisiert alle Hauptmaterialien unterhalb von `root` in place. */
export function updateMainMaterials(root: Node, spec: MaterialSpec | undefined): void {
  const seen = new Set<PBRMaterial>();
  for (const mesh of root.getChildMeshes(false) as AbstractMesh[]) {
    const mat = mesh.material;
    if (!(mat instanceof PBRMaterial) || seen.has(mat)) continue;
    const meta = mat.metadata as MainMeta | null;
    if (!meta?.cpMain) continue;
    seen.add(mat);
    applyMaterialSpec(mat, spec, meta.base);
  }
}

/** Farbe für Lichter: Leuchtfarbe, sonst Farbe, sonst Vorgabe. */
export function lightColor(spec: MaterialSpec | undefined, fallback: string): Color3 {
  return parseColor(spec?.emissive ?? spec?.color, Color3.FromHexString(fallback));
}
