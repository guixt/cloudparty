/**
 * Bibliothek wiederverwendbarer Bausteine. VERTRAG: nur der Koordinator ändert diese Datei.
 *
 * Ein Baustein ist eine Gruppe von Entities samt Material, Skripten und Graphen.
 * Positionen sind relativ zu einem Fußpunkt: x/z = Mitte der Auswahl, y = 0 ist der Boden (tiefste Unterkante);
 * Drehungen und Größen bleiben unverändert. Beim Platzieren werden IDs neu vergeben und alle Teile bekommen
 * eine gemeinsame Gruppe (`group`).
 */
import type { EntitySpec } from './types';

export interface LibraryItemMeta {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** Vorschaubild als data:-URL (JPEG/PNG, höchstens ~256 px). */
  thumbnail?: string;
  /** Mitgelieferter Baustein (nicht löschbar). */
  builtin?: boolean;
  /** Anzahl der Objekte. */
  count: number;
}

export interface LibraryItem extends LibraryItemMeta {
  entities: EntitySpec[];
}

/** Dateiformat für Export/Import (.cloudparty-baustein.json). */
export interface LibraryFile {
  format: 'cloudparty-library';
  version: 1;
  items: LibraryItem[];
}

export const LIBRARY_LIMITS = { maxEntitiesPerItem: 300, maxItems: 500, maxNameLength: 80, maxTags: 12 } as const;
