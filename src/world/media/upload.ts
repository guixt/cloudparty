/** Bild-Upload: Datei lesen, auf höchstens 1600 px verkleinern und als data:-URL zurückgeben. */
import { downscaleSize } from './helpers';

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Datei ist kein lesbares Bild'));
    img.src = url;
  });
}

const KEEP_BELOW_BYTES = 350_000;

export async function fileToDataUrl(file: File, max = 1600): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Das ist keine Bilddatei');
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return original; // z. B. SVG ohne feste Größe
  const size = downscaleSize(w, h, max);
  const scaled = size.width !== w || size.height !== h;
  if (!scaled && file.size < KEEP_BELOW_BYTES) return original;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const c = canvas.getContext('2d');
  if (!c) return original;
  const lossless = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/svg+xml';
  if (!lossless) {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, size.width, size.height);
  }
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, size.width, size.height);
  return lossless ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.86);
}
