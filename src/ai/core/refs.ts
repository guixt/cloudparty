/**
 * Bekannte Baustein-Verweise für die KI: registrierte Prefabs plus die Bausteine des Bauen-Menüs, die nicht als Prefab
 * registriert sind (z. B. die Medien-Tafeln EntitySpec.media-*).
 */
import { hasFront } from '../../../shared/front';
import type { EntitySpec } from '../../../shared/types';
import { CATALOG, createFromItem, type CatalogItem } from '../../build/catalog';
import { PREFABS, createEntityFromPrefab, getPrefab } from '../../world/entities/prefabs';

function catalogItem(ref: string): CatalogItem | undefined {
  return CATALOG.find((i) => i.ref === ref);
}

export function isKnownRef(ref: string): boolean {
  return !!getPrefab(ref) || !!catalogItem(ref);
}

export function knownRefs(): string[] {
  const refs = new Set(PREFABS.map((p) => p.ref));
  for (const item of CATALOG) refs.add(item.ref);
  return [...refs];
}

/** Neue Entity im Ursprung mit den Standardwerten des Bausteins (Prefab, sonst Eintrag des Bauen-Menüs). */
export function baseEntityFor(ref: string): EntitySpec {
  if (getPrefab(ref)) return createEntityFromPrefab(ref, [0, 0, 0]);
  const item = catalogItem(ref);
  if (!item) throw new Error(`Unbekannter ref ${ref}`);
  return createFromItem(item, [0, 0, 0], 0);
}

/** Zusätzliche Katalogeinträge für die KI (Bausteine ohne Prefab-Registrierung). */
export function extraCatalog() {
  const seen = new Set(PREFABS.map((p) => p.ref));
  const out: { ref: string; bezeichnung: string; kategorie: string; standard_skalierung: [number, number, number]; ursprung: string; vorderseite?: string }[] = [];
  for (const item of CATALOG) {
    if (seen.has(item.ref)) continue;
    seen.add(item.ref);
    out.push({ ref: item.ref, bezeichnung: item.label, kategorie: item.category, standard_skalierung: item.scale, ursprung: item.anchor === 'center' ? 'Mitte' : 'Boden', ...(hasFront(item.ref) ? { vorderseite: 'lokale +Z-Richtung (Rückseite leer); mit face_toward ausrichten' } : {}) });
  }
  return out;
}
