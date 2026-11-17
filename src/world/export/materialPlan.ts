/** Material-Zuordnung für den Blender-Export (Option B): unsere MaterialSpec → Werte, die der glTF-Exporter versteht. */
import type { MaterialSpec } from '../../../shared/types';
import { resolveMaterial } from '../entities/materialPresets';

export interface ExportMaterialPlan {
  /** Deckkraft des Basismaterials (bei Glas 1: die Durchsicht kommt aus Transmission). */
  alpha: number;
  /** 0..1: Transmission (KHR_materials_transmission); 0 = undurchsichtig. */
  transmission: number;
  /** Brechungsindex (KHR_materials_ior). */
  ior: number;
  /** 0..1: Klarlack (KHR_materials_clearcoat). */
  clearcoat: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Rechnet eine MaterialSpec (inkl. Voreinstellung) in Exportwerte um.
 * Glas wird in der App als Alpha plus Spiegelung dargestellt; Blender soll echtes Glas bekommen:
 * Transmission = Glasanteil, Alpha = 1.
 */
export function exportMaterialPlan(spec: MaterialSpec | undefined): ExportMaterialPlan {
  const r = resolveMaterial(spec);
  const glass = clamp01(r.glass ?? 0);
  const alpha = clamp01(r.alpha ?? 1);
  return {
    alpha: glass > 0 ? 1 : alpha,
    transmission: glass,
    ior: Math.min(2.5, Math.max(1, glass > 0 ? (r.ior ?? 1.5) : 1.5)),
    clearcoat: clamp01(r.clearcoat ?? 0),
  };
}
