/**
 * Schnittstelle der Bibliothek. VERTRAG: nur der Koordinator ändert diese Datei.
 * Paket 17 implementiert sie in src/library/ und exportiert `getLibrary()` aus src/library/index.ts.
 */
import type { LibraryItem, LibraryItemMeta } from '../../shared/library';
import type { Vec3 } from '../../shared/types';

export interface SaveOptions {
  name: string;
  description?: string;
  tags?: string[];
  /** Entity-IDs; Standard: aktuelle Auswahl des Stores (Gruppen werden vollständig übernommen). */
  ids?: string[];
}

export interface PlaceOptions {
  /** Fußpunkt in Weltkoordinaten (x, y = Bodenhöhe, z). Standard: vor der aktiven Kamera auf dem Boden. */
  at?: Vec3;
  /** Drehung um die Y-Achse in Grad. */
  yawDegrees?: number;
  /** Name der neuen Gruppe; Standard: Name des Bausteins. */
  groupName?: string;
}

export interface LibraryApi {
  list(query?: string): Promise<LibraryItemMeta[]>;
  get(id: string): Promise<LibraryItem | undefined>;
  /** Speichert eine Auswahl als neuen Baustein (mit Vorschaubild, wenn möglich). Wirft Error mit deutscher Meldung. */
  save(options: SaveOptions): Promise<LibraryItemMeta>;
  /**
   * Setzt den Baustein in die Welt (neue IDs, gemeinsame Gruppe, als EIN Undo-Schritt über
   * history.group.begin/end), wählt die neuen Objekte aus und gibt deren IDs zurück.
   */
  place(id: string, options?: PlaceOptions): Promise<string[]>;
  update(id: string, patch: Partial<Pick<LibraryItemMeta, 'name' | 'description' | 'tags'>>): Promise<void>;
  remove(id: string): Promise<void>;
  /** Löst einen Dateidownload aus (.cloudparty-baustein.json). */
  exportItems(ids: string[]): Promise<void>;
  /** Liest eine Bausteindatei; gibt die neu hinzugefügten Bausteine zurück. Wirft Error mit deutscher Meldung. */
  importFile(file: File): Promise<LibraryItemMeta[]>;
  /** Meldet Änderungen (Liste neu laden). Rückgabe meldet ab. */
  subscribe(listener: () => void): () => void;
}
