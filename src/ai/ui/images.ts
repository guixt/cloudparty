/** Bilder für den KI-Chat vorbereiten: einlesen, verkleinern, als JPEG-Daten-URL liefern. */
import { fitToJpeg } from '../core/imageFetch';
import { MAX_USER_IMAGES } from '../core/userImages';

export { MAX_USER_IMAGES };
/** Stufen: erst größer und schärfer (Texte in Screenshots), dann kleiner, bis ca. 400 kB erreicht sind. */
export const CHAT_IMAGE_STEPS = [
  { width: 1280, quality: 0.85 },
  { width: 1280, quality: 0.7 },
  { width: 1024, quality: 0.7 },
  { width: 800, quality: 0.6 },
  { width: 640, quality: 0.55 },
];
export const CHAT_IMAGE_MAX_BYTES = 400_000;

export function isImageFile(file: { type: string }): boolean {
  return /^image\/(png|jpe?g|webp|gif|bmp)$/.test(file.type);
}

/** Verkleinert eine Bilddatei (PNG, JPEG, WebP, GIF …) auf höchstens 1280 px Breite und ca. 400 kB. */
export async function prepareChatImage(file: Blob): Promise<string> {
  if (!isImageFile(file)) throw new Error('Das ist keine unterstützte Bilddatei (PNG, JPEG, WebP, GIF).');
  const bitmap = await createImageBitmap(file);
  try {
    const out = fitToJpeg(bitmap, bitmap.width, bitmap.height, CHAT_IMAGE_MAX_BYTES, 1280, CHAT_IMAGE_STEPS);
    if (!out) throw new Error('Das Bild lässt sich nicht klein genug machen.');
    return out;
  } finally {
    bitmap.close();
  }
}

/** Bilddateien aus Zwischenablage oder Ablegen (Drag-and-drop). */
export function imageFilesOf(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f && isImageFile(f)) out.push(f);
    }
  }
  if (out.length === 0) for (const f of Array.from(data.files ?? [])) if (isImageFile(f)) out.push(f);
  return out;
}
