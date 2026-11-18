/** Bilder, die der Nutzer im KI-Chat anhängt: Prüfung und Umwandlung in Bildblöcke der API. */
import type { ContentBlock } from './client';

export const MAX_USER_IMAGES = 4;
/** Größe eines Bildes (Base64-Text) höchstens ca. 1,5 MB; die Oberfläche verkleinert vorher deutlich darunter. */
export const MAX_USER_IMAGE_CHARS = 2_000_000;

type ImageBlock = Extract<ContentBlock, { type: 'image' }>;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Wandelt Daten-URLs in Bildblöcke; ungültige oder zu große Einträge entfallen. */
export function toImageBlocks(dataUrls: readonly string[] | undefined): ImageBlock[] {
  const out: ImageBlock[] = [];
  for (const url of dataUrls ?? []) {
    if (out.length >= MAX_USER_IMAGES) break;
    if (typeof url !== 'string' || url.length > MAX_USER_IMAGE_CHARS) continue;
    const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!m || !(TYPES as readonly string[]).includes(m[1])) continue;
    out.push({ type: 'image', source: { type: 'base64', media_type: m[1] as ImageBlock['source']['media_type'], data: m[2] } });
  }
  return out;
}
