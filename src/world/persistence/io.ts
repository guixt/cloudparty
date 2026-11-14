/** Datei-Export und -Import von Welten (JSON). */
import { parseWorldSpec, serializeWorldSpec, type ValidationResult } from '../../../shared/worldspec';
import type { WorldSpec } from '../../../shared/types';

/** Größtes erlaubtes Importvolumen (Bytes). */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** Dateiname `<name>.cloudparty.json` ohne unzulässige Zeichen. */
export function worldFileName(world: WorldSpec): string {
  const base = world.metadata.name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return `${base || 'Welt'}.cloudparty.json`;
}

/** Löst den Download einer Weltdatei aus. */
export function exportWorldToFile(world: WorldSpec): void {
  const blob = new Blob([serializeWorldSpec(world)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = worldFileName(world);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Prüft JSON-Text einer Weltdatei. */
export function importWorldFromText(text: string): ValidationResult {
  return parseWorldSpec(text);
}

/** Liest und prüft eine ausgewählte Weltdatei. */
export async function importWorldFromFile(file: File): Promise<ValidationResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, errors: [`Die Datei ist zu groß (höchstens ${MAX_IMPORT_BYTES / 1024 / 1024} MB erlaubt).`] };
  }
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    return { ok: false, errors: [`Die Datei konnte nicht gelesen werden: ${(error as Error).message}`] };
  }
  return importWorldFromText(text);
}
