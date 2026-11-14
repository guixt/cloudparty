/**
 * Ortslinks: `#<insel>,<x>,<y>,<z>,<blickGrad>` (alles nach der Insel-ID optional).
 * Reine Funktionen, ohne DOM.
 */
import type { Vec3 } from '../../../shared/types';

export interface ParsedLocation {
  island: string | null;
  position: Vec3 | null;
  /** Blickrichtung in Radiant (Drehung um Y) oder null, wenn nicht angegeben. */
  yaw: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function num(part: string | undefined): number | null {
  if (part === undefined || part.trim() === '') return null;
  const value = Number(part);
  return Number.isFinite(value) ? value : null;
}

/** Zerlegt einen Hash (mit oder ohne führendes #). Ungültige Teile werden ignoriert. */
export function parseLocationHash(hash: string): ParsedLocation {
  const raw = hash.replace(/^#/, '');
  const empty: ParsedLocation = { island: null, position: null, yaw: null };
  if (!raw) return empty;
  const parts = raw.split(',');
  let island: string | null = null;
  try {
    island = decodeURIComponent(parts[0]).trim() || null;
  } catch {
    island = null;
  }
  if (!island) return empty;
  const x = num(parts[1]);
  const y = num(parts[2]);
  const z = num(parts[3]);
  const position: Vec3 | null = x !== null && y !== null && z !== null ? [x, y, z] : null;
  const deg = num(parts[4]);
  const yaw = position && deg !== null ? (deg * Math.PI) / 180 : null;
  return { island, position, yaw };
}

/** Blickrichtung in ganzen Grad, 0..359. */
export function yawToDegrees(yaw: number): number {
  const deg = Math.round((yaw * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}

/** Baut den Hash; ohne Position nur die Insel-ID. */
export function formatLocationHash(island: string, position?: Vec3 | null, yaw?: number | null): string {
  const id = encodeURIComponent(island);
  if (!position || !position.every(Number.isFinite)) return `#${id}`;
  const base = `#${id},${round1(position[0])},${round1(position[1])},${round1(position[2])}`;
  return yaw === undefined || yaw === null || !Number.isFinite(yaw) ? base : `${base},${yawToDegrees(yaw)}`;
}

/** Lesbare, URL-taugliche ID aus einem Namen (Umlaute aufgelöst). */
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

/** ID für eine lokale Insel: Name plus kurzer Zufallssuffix. */
export function generateLocalIslandId(name: string, random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `${slugify(name)}-${suffix}`;
}
