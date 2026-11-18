/**
 * Lädt ein Bild herunter, verkleinert es und liefert es als JPEG-Daten-URL (damit es eine echte Textur wird und
 * online die Größengrenze eines Objekts nicht sprengt). Braucht den Browser (fetch + Canvas).
 */
export const MAX_IMAGE_BYTES = 170_000;

/** Reihenfolge der Versuche: erst größer/besser, dann kleiner, bis das Ergebnis klein genug ist. */
export const FIT_STEPS: { width: number; quality: number }[] = [
  { width: 1024, quality: 0.82 },
  { width: 1024, quality: 0.68 },
  { width: 800, quality: 0.68 },
  { width: 640, quality: 0.6 },
  { width: 480, quality: 0.55 },
];

/** Ungefähre Größe der Daten-URL in Bytes (Base64-Anteil). */
export const dataUrlBytes = (url: string): number => Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4);

export interface FetchedImage {
  dataUrl: string;
  /** Maße des Originals (für das Seitenverhältnis der Tafel). */
  width: number;
  height: number;
}

export async function fetchImageAsDataUrl(url: string, maxBytes = MAX_IMAGE_BYTES, signal?: AbortSignal): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url, { mode: 'cors', signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/') || blob.size > 25_000_000) return null;
    const bitmap = await createImageBitmap(blob);
    try {
      const dataUrl = fitToJpeg(bitmap, bitmap.width, bitmap.height, maxBytes);
      return dataUrl ? { dataUrl, width: bitmap.width, height: bitmap.height } : null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/** Zeichnet ein Bild stufenweise kleiner, bis das JPEG nicht größer als `maxBytes` ist (null: nicht möglich). */
export function fitToJpeg(source: CanvasImageSource, width: number, height: number, maxBytes = MAX_IMAGE_BYTES, maxWidth = 1024, steps: { width: number; quality: number }[] = FIT_STEPS): string | null {
  for (const step of steps) {
    const scale = Math.min(1, Math.min(step.width, maxWidth) / width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.fillStyle = '#ffffff'; // PNG-Transparenz → weiß (JPEG kennt keine)
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(source, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', step.quality);
    if (dataUrlBytes(out) <= maxBytes) return out;
  }
  return null;
}
