/**
 * Material-Voreinstellungen (rein, ohne Babylon). Die Voreinstellung liefert Vorgabewerte;
 * ausdrücklich gesetzte Felder in `entity.material` überschreiben sie.
 */
import type { MaterialPreset, MaterialSpec } from '../../../shared/types';

export const PRESET_VALUES: Record<MaterialPreset, MaterialSpec> = {
  standard: { color: '#cccccc', metallic: 0, roughness: 0.75, alpha: 1 },
  metall: { color: '#aeb4bd', metallic: 1, roughness: 0.35, reflect: 0.8 },
  chrom: { color: '#ffffff', metallic: 1, roughness: 0.05, reflect: 1 },
  gold: { color: '#d4af37', metallic: 1, roughness: 0.3, reflect: 0.7 },
  glas: { color: '#e8f4ff', metallic: 0, roughness: 0.02, glass: 0.9, ior: 1.5, reflect: 0.9 },
  spiegel: { color: '#ffffff', metallic: 1, roughness: 0.02, reflect: 1 },
  lack: { color: '#d62839', metallic: 0, roughness: 0.35, clearcoat: 1, reflect: 0.45 },
  holz: { color: '#a9703c', metallic: 0, roughness: 0.7, pattern: 'holz', patternColor: '#6b4122' },
  stein: { color: '#8d8f94', metallic: 0, roughness: 0.9, pattern: 'rauschen', patternColor: '#5f6166' },
  gummi: { color: '#2f3a4a', metallic: 0, roughness: 0.95, reflect: 0.1 },
  neon: { color: '#39ff88', emissive: '#39ff88', emissiveIntensity: 1.2, metallic: 0, roughness: 0.4 },
  hologramm: {
    color: '#40e0ff', emissive: '#40e0ff', emissiveIntensity: 1.2, alpha: 0.55, metallic: 0.2, roughness: 0.2,
    pattern: 'streifen', patternColor: '#0a4a66', reflect: 0.8,
  },
};

/** Anzeigenamen (Deutsch) für Auswahl und Vorschau. */
export const PRESET_LABELS: Record<MaterialPreset, string> = {
  standard: 'Standard', metall: 'Metall', chrom: 'Chrom', gold: 'Gold', glas: 'Glas', spiegel: 'Spiegel',
  lack: 'Lack', holz: 'Holz', stein: 'Stein', gummi: 'Gummi', neon: 'Neon', hologramm: 'Hologramm',
};

export const PATTERN_LABELS = { none: 'Kein Muster', karo: 'Karo', streifen: 'Streifen', rauschen: 'Rauschen', ziegel: 'Ziegel', holz: 'Holz', wellen: 'Wellen' } as const;

/** Voreinstellung als konkrete Werte (für die Oberfläche: macht die Welt-Datei selbstbeschreibend). */
export function presetMaterial(preset: MaterialPreset, keep?: Pick<MaterialSpec, 'mirror'>): MaterialSpec {
  const out: MaterialSpec = { ...PRESET_VALUES[preset], preset };
  if (keep?.mirror) out.mirror = true;
  return out;
}

/** Voreinstellung + ausdrückliche Felder (Letztere gewinnen). */
export function resolveMaterial(spec: MaterialSpec | undefined): MaterialSpec {
  if (!spec) return {};
  const base = spec.preset ? PRESET_VALUES[spec.preset] : undefined;
  const out: MaterialSpec = { ...(base ?? {}) };
  for (const key of Object.keys(spec) as (keyof MaterialSpec)[]) {
    if (spec[key] !== undefined) (out as Record<string, unknown>)[key] = spec[key];
  }
  return out;
}
