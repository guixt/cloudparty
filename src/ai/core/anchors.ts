/**
 * Öffnungen (Türen, Fenster) von Wänden als Metadaten. add_wall und fill_bricks legen sie an, damit die KI später
 * (fit_to_opening, verify, get_bounds, get_world) mit den echten Maßen arbeiten kann statt zu raten.
 * Ablage: world.extensions['cloudparty.ai.openings'] = { [Gruppen-id]: OpeningInfo[] }.
 */
import type { Vec3 } from '../../../shared/types';
import type { ToolContext } from './tools';

export const OPENINGS_KEY = 'cloudparty.ai.openings';
const MAX_GROUPS = 200;

export interface OpeningInfo {
  name: string;
  kind: 'Tür' | 'Fenster' | 'Öffnung';
  /** Mitte der Öffnung (Welt, Meter). */
  center: Vec3;
  width: number;
  height: number;
  /** Wanddicke (Meter). */
  thickness: number;
  /** Einheitsvektor [x, z] entlang der Wand (Breitenrichtung). */
  u: [number, number];
  /** Einheitsvektor [x, z] senkrecht zur Wand („Vorderseite“). */
  normal: [number, number];
}

const r2 = (n: number) => Math.round(n * 1000) / 1000;

export function readOpenings(ctx: ToolContext): Record<string, OpeningInfo[]> {
  const raw = ctx.store.getState().world.extensions?.[OPENINGS_KEY];
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, OpeningInfo[]>) : {};
}

export function saveOpenings(ctx: ToolContext, group: string, openings: OpeningInfo[]): void {
  const all = { ...readOpenings(ctx) };
  all[group] = openings.map((o) => ({ ...o, center: [r2(o.center[0]), r2(o.center[1]), r2(o.center[2])], width: r2(o.width), height: r2(o.height), thickness: r2(o.thickness), u: [r2(o.u[0]), r2(o.u[1])], normal: [r2(o.normal[0]), r2(o.normal[1])] }));
  // Alte Einträge verwerfen, wenn es zu viele werden (Gruppen, die es nicht mehr gibt, zuerst).
  const keys = Object.keys(all);
  if (keys.length > MAX_GROUPS) {
    const alive = new Set(ctx.store.getState().order.map((id) => ctx.store.getState().entities[id]?.group).filter(Boolean));
    for (const k of keys) if (Object.keys(all).length > MAX_GROUPS && k !== group && !alive.has(k)) delete all[k];
  }
  ctx.store.getState().setExtension(OPENINGS_KEY, all);
}

/** Öffnungen einer Gruppe (leer, wenn keine bekannt). */
export function openingsOfGroup(ctx: ToolContext, group: string | undefined): OpeningInfo[] {
  return group ? readOpenings(ctx)[group] ?? [] : [];
}

/** Beim Neugruppieren die Öffnungen der alten Gruppen in die neue übernehmen. */
export function migrateOpenings(ctx: ToolContext, oldGroups: Iterable<string>, newGroup: string): void {
  const all = readOpenings(ctx);
  const merged: OpeningInfo[] = [];
  for (const g of oldGroups) merged.push(...(all[g] ?? []));
  if (merged.length > 0) saveOpenings(ctx, newGroup, merged.slice(0, 40));
}

const COMPASS: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
export const COMPASS_NAMES = Object.keys(COMPASS);
export function compassVector(name: string): [number, number] | null {
  return COMPASS[name] ?? null;
}
/** Himmelsrichtung eines Normalenvektors für Texte (north = kleineres z). */
export function compassName(n: readonly [number, number]): string {
  const [x, z] = n;
  if (Math.abs(x) >= Math.abs(z)) return x >= 0 ? 'east (+x)' : 'west (−x)';
  return z >= 0 ? 'south (+z)' : 'north (−z)';
}

export function describeOpening(o: OpeningInfo, index: number): string {
  const m = (n: number) => Math.round(n * 100) / 100;
  return `${index + 1}. ${o.name} (${o.kind}): Mitte [${o.center.map(m).join(', ')}], ${m(o.width)} m breit × ${m(o.height)} m hoch, Wand ${m(o.thickness)} m dick, Vorderseite nach ${compassName(o.normal)}`;
}

/** Wählt eine Öffnung nach Nummer (1-basiert) oder Name; ohne Angabe nur, wenn es genau eine gibt. */
export function pickOpening(list: OpeningInfo[], which: unknown): OpeningInfo {
  if (list.length === 0) throw new Error('Zu dieser Wand sind keine Öffnungen gespeichert. Öffnungen kennt nur, was mit add_wall oder fill_bricks (openings) gebaut wurde.');
  if (which === undefined) {
    if (list.length === 1) return list[0];
    throw new Error(`Mehrere Öffnungen, gib opening an (Nummer oder Name):\n${list.map(describeOpening).join('\n')}`);
  }
  if (typeof which === 'number' && Number.isInteger(which)) {
    const o = list[which - 1];
    if (!o) throw new Error(`Es gibt keine Öffnung Nr. ${which}. Vorhanden:\n${list.map(describeOpening).join('\n')}`);
    return o;
  }
  if (typeof which === 'string') {
    const needle = which.trim().toLowerCase();
    const hits = list.filter((o) => o.name.toLowerCase() === needle);
    if (hits.length === 1) return hits[0];
    const asNum = Number(needle);
    if (Number.isInteger(asNum) && list[asNum - 1]) return list[asNum - 1];
  }
  throw new Error(`Öffnung "${String(which).slice(0, 40)}" nicht gefunden. Vorhanden:\n${list.map(describeOpening).join('\n')}`);
}

/** Namen vergeben: „Tür 1“, „Fenster 2“ (je Art durchnummeriert), eigener Name hat Vorrang. */
export function nameOpenings(items: Array<{ kind: OpeningInfo['kind']; name?: string }>): string[] {
  const counts: Record<string, number> = {};
  return items.map((it) => {
    counts[it.kind] = (counts[it.kind] ?? 0) + 1;
    return it.name ?? `${it.kind} ${counts[it.kind]}`;
  });
}
