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
  textureUrl?: string;
}

function parseColor(hex: string | undefined, fallback: Color3): Color3 {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return Color3.FromHexString(hex);
}

/** Wendet Spec + Basiswerte auf ein PBR-Material an. */
export function applyMaterialSpec(mat: PBRMaterial, spec: MaterialSpec | undefined, base: MaterialBase): void {
  mat.albedoColor = parseColor(spec?.color, parseColor(base.color, Color3.White()));
  const emissive = spec?.emissive ?? base.emissive;
  mat.emissiveColor = emissive
    ? parseColor(emissive, Color3.Black())
    : base.glow
      ? mat.albedoColor.scale(base.glow)
      : Color3.Black();
  mat.metallic = spec?.metallic ?? base.metallic ?? 0;
  mat.roughness = spec?.roughness ?? base.roughness ?? 0.75;
  const alpha = Math.min(1, Math.max(0, spec?.alpha ?? base.alpha ?? 1));
  mat.alpha = alpha;
  mat.transparencyMode = alpha < 1 ? PBRMaterial.PBRMATERIAL_ALPHABLEND : PBRMaterial.PBRMATERIAL_OPAQUE;
  const meta = mat.metadata as MainMeta | null;
  const url = spec?.textureUrl;
  if (meta && meta.cpMain) {
    if (meta.textureUrl !== url) {
      mat.albedoTexture?.dispose();
      mat.albedoTexture = null;
      if (url) {
        const tex = new Texture(url, mat.getScene());
        tex.hasAlpha = false;
        mat.albedoTexture = tex;
        // Texturen werden mit weißer Grundfarbe nicht eingefärbt, wenn keine Farbe gesetzt ist.
        if (!spec?.color) mat.albedoColor = Color3.White();
      }
      meta.textureUrl = url;
    } else if (url && !spec?.color) {
      mat.albedoColor = Color3.White();
    }
  }
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
