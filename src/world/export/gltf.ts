/**
 * Export der Welt (oder der Auswahl) als .glb für Blender.
 * Es wird die laufende Szene exportiert, gefiltert auf Entity-Knoten (ohne Marker, Gizmos, Himmel, Gras, Avatare).
 * Materialien werden für den Export kurz angepasst (Glas → Transmission) und danach zurückgesetzt.
 */
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Node } from '@babylonjs/core/node';
import '@babylonjs/serializers/glTF/2.0/Extensions/KHR_materials_clearcoat';
import '@babylonjs/serializers/glTF/2.0/Extensions/KHR_materials_transmission';
import '@babylonjs/serializers/glTF/2.0/Extensions/KHR_materials_ior';
import '@babylonjs/serializers/glTF/2.0/Extensions/KHR_materials_emissive_strength';
import '@babylonjs/serializers/glTF/2.0/Extensions/KHR_texture_transform';
import { GLTF2Export } from '@babylonjs/serializers/glTF/2.0/glTFSerializer';
import type { EntitySpec } from '../../../shared/types';
import { entityIdOf, type GameContext } from '../../core/context';
import { isBuildOnly } from '../entities/parts';
import { exportMaterialPlan } from './materialPlan';

/** Entity-Arten ohne eigene Geometrie oder mit Effekten, die glTF nicht kennt. */
export const NOT_EXPORTED_REFS = new Set(['EntitySpec.light', 'EntitySpec.avatar-spawn', 'EntitySpec.water', 'EntitySpec.waterfall', 'EntitySpec.mirror']);

export interface ExportOptions {
  /** Nur diese Entity-ids (Auswahl); sonst alle. */
  ids?: readonly string[];
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  /** Anzahl exportierter Entities. */
  entities: number;
  /** Entities ohne Export (Licht, Wasser …) mit Grund. */
  skipped: { id: string; name: string; reason: string }[];
}

/** Welche Entities werden exportiert? (rein, testbar) */
export function selectExportEntities(all: readonly EntitySpec[], ids?: readonly string[]): { chosen: EntitySpec[]; skipped: { id: string; name: string; reason: string }[] } {
  const wanted = ids ? new Set(ids) : null;
  const chosen: EntitySpec[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];
  for (const e of all) {
    if (wanted && !wanted.has(e.id)) continue;
    if (NOT_EXPORTED_REFS.has(e.ref)) {
      skipped.push({ id: e.id, name: e.name ?? e.ref, reason: 'Effekt oder Licht ohne glTF-Entsprechung' });
      continue;
    }
    chosen.push(e);
  }
  return { chosen, skipped };
}

/** Zusatzdaten je Knoten (landen in Blender als benutzerdefinierte Eigenschaften). */
export function entityExtras(e: EntitySpec): Record<string, unknown> {
  return {
    cp_id: e.id,
    cp_ref: e.ref,
    ...(e.name ? { cp_name: e.name } : {}),
    ...(e.group ? { cp_group: e.group } : {}),
    ...(e.groupName ? { cp_group_name: e.groupName } : {}),
    ...(e.material?.preset ? { cp_preset: e.material.preset } : {}),
    ...(e.script ? { cp_has_script: true } : {}),
    ...(e.media?.kind ? { cp_media: e.media.kind } : {}),
  };
}

function safeFileName(name: string): string {
  const base = name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return base || 'cloudparty';
}

/** Schlüssel für gleichaussehende Materialien (spart in Blender hunderte Duplikate bei Klemmbausteinen). */
export function materialKey(mat: PBRMaterial, plan: { alpha: number; transmission: number; ior: number }): string {
  const c = (v: { r: number; g: number; b: number } | null | undefined) => (v ? `${v.r.toFixed(3)},${v.g.toFixed(3)},${v.b.toFixed(3)}` : '-');
  return [c(mat.albedoColor), c(mat.emissiveColor), mat.metallic ?? '-', mat.roughness ?? '-', plan.alpha, plan.transmission, plan.ior, mat.clearCoat.isEnabled ? mat.clearCoat.intensity : 0, mat.albedoTexture?.uniqueId ?? '-'].join('|');
}

interface MeshMaterial {
  mesh: AbstractMesh;
  original: AbstractMesh['material'];
}

interface MaterialSnapshot {
  mat: PBRMaterial;
  alpha: number;
  transparencyMode: number | null;
  refraction: boolean;
  refractionIntensity: number;
  ior: number;
  name: string;
}

export async function exportGlb(ctx: GameContext, options: ExportOptions = {}): Promise<ExportResult> {
  const state = ctx.store.getState();
  const all = state.order.map((id) => state.entities[id]).filter((e): e is EntitySpec => !!e);
  const { chosen, skipped } = selectExportEntities(all, options.ids);
  const byId = new Map(chosen.map((e) => [e.id, e]));
  const baseName = safeFileName(state.world.metadata.name);

  // Material-Anpassung (Option B), danach sicher zurücksetzen.
  const snapshots = new Map<PBRMaterial, MaterialSnapshot>();
  const shared = new Map<string, PBRMaterial>();
  const swapped: MeshMaterial[] = [];
  const usedNames = new Map<string, number>();
  for (const e of chosen) {
    const node = ctx.entityNodes.get(e.id);
    if (!node) continue;
    const plan = exportMaterialPlan(e.material);
    for (const mesh of node.getChildMeshes(false)) {
      const mat = mesh.material;
      if (!(mat instanceof PBRMaterial)) continue;
      // Gleichaussehende Materialien teilen sich ein Export-Material.
      const key = materialKey(mat, plan);
      const first = shared.get(key);
      if (first && first !== mat) {
        swapped.push({ mesh, original: mat });
        mesh.material = first;
        continue;
      }
      if (snapshots.has(mat)) continue;
      shared.set(key, mat);
      snapshots.set(mat, { mat, alpha: mat.alpha, transparencyMode: mat.transparencyMode, refraction: mat.subSurface.isRefractionEnabled, refractionIntensity: mat.subSurface.refractionIntensity, ior: mat.indexOfRefraction, name: mat.name });
      mat.alpha = plan.alpha;
      mat.transparencyMode = plan.alpha < 1 ? PBRMaterial.PBRMATERIAL_ALPHABLEND : PBRMaterial.PBRMATERIAL_OPAQUE;
      if (plan.transmission > 0) {
        mat.subSurface.isRefractionEnabled = true;
        mat.subSurface.refractionIntensity = plan.transmission;
        mat.indexOfRefraction = plan.ior;
      }
      const label = (e.name || e.ref.replace(/^EntitySpec\./, '')).slice(0, 40);
      const n = (usedNames.get(label) ?? 0) + 1;
      usedNames.set(label, n);
      mat.name = n === 1 ? label : `${label} ${n}`;
    }
  }

  const shouldExportNode = (node: Node): boolean => {
    const id = entityIdOf(node as { metadata?: unknown });
    if (!id || !byId.has(id)) return false;
    if (isBuildOnly(node as { metadata?: unknown })) return false;
    const mesh = node as AbstractMesh;
    if (typeof mesh.isVisible === 'boolean' && (!mesh.isVisible || mesh.visibility === 0)) return false;
    return true;
  };

  try {
    const data = await GLTF2Export.GLBAsync(ctx.scene, baseName, {
      shouldExportNode,
      shouldExportAnimation: () => false,
      exportWithoutWaitingForScene: true,
      metadataSelector: (metadata: { entityId?: string } | null | undefined) => {
        const entity = metadata?.entityId ? byId.get(metadata.entityId) : undefined;
        return entity ? entityExtras(entity) : undefined;
      },
    });
    const file = Object.entries(data.files).find(([name]) => name.endsWith('.glb'));
    if (!file) throw new Error('Der Export hat keine .glb-Datei geliefert.');
    const blob = file[1] instanceof Blob ? file[1] : new Blob([file[1]], { type: 'model/gltf-binary' });
    return { blob, fileName: `${baseName}.glb`, entities: chosen.length, skipped };
  } finally {
    for (const m of swapped) m.mesh.material = m.original;
    for (const s of snapshots.values()) {
      s.mat.alpha = s.alpha;
      s.mat.transparencyMode = s.transparencyMode;
      s.mat.subSurface.isRefractionEnabled = s.refraction;
      s.mat.subSurface.refractionIntensity = s.refractionIntensity;
      s.mat.indexOfRefraction = s.ior;
      s.mat.name = s.name;
    }
  }
}
