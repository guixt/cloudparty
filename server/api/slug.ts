import { randomBytes } from 'node:crypto';

export const ISLAND_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

/** Wandelt einen Namen in einen lesbaren, URL-tauglichen Teil um (Umlaute werden aufgelöst). */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'insel';
}

/** Lesbare ID aus Name plus kurzem Zufallssuffix. */
export function generateIslandId(name: string): string {
  return `${slugify(name)}-${randomBytes(3).toString('hex')}`;
}
