/**
 * Überschneidungsprüfung für gebaute Objekte: orientierte Quader (OBB) mit Trennachsen-Test (SAT).
 * Gemessen werden nur Objekte mit bekannten Maßen (Grundformen, Klemmbausteine). Zusammengesetzte Bausteine (Bank, Baum …)
 * haben keine verlässlichen Maße im Weltformat und werden übersprungen.
 */
import { BRICK_REF, brickSize, brickState } from '../../../shared/bricks';
import type { EntitySpec, Quat, Vec3 } from '../../../shared/types';
import { rotateVec } from './buildGeometry';

export interface Obb {
  id: string;
  center: Vec3;
  half: Vec3;
  /** Achsen (Einheitsvektoren) im Weltraum. */
  axes: [Vec3, Vec3, Vec3];
}

const PRIMITIVES = new Set(['EntitySpec.box', 'EntitySpec.sphere', 'EntitySpec.cylinder', 'EntitySpec.cone', 'EntitySpec.torus', 'EntitySpec.plane']);
/** Dinge ohne feste Körper (Zonen, Lichter, Startpunkte). */
const IGNORED_REFS = new Set(['EntitySpec.light', 'EntitySpec.avatar-spawn']);

export function obbOf(e: EntitySpec): Obb | null {
  if (IGNORED_REFS.has(e.ref) || e.physics?.mode === 'trigger') return null;
  const rot = e.transform.rot as Quat;
  const axes: [Vec3, Vec3, Vec3] = [rotateVec(rot, [1, 0, 0]), rotateVec(rot, [0, 1, 0]), rotateVec(rot, [0, 0, 1])];
  const [sx, sy, sz] = e.transform.scale;
  if (e.ref === BRICK_REF) {
    const size = brickSize(brickState(e.state));
    const up = axes[1];
    const c: Vec3 = [e.transform.pos[0] + (up[0] * size[1]) / 2, e.transform.pos[1] + (up[1] * size[1]) / 2, e.transform.pos[2] + (up[2] * size[1]) / 2];
    return { id: e.id, center: c, half: [size[0] / 2, size[1] / 2, size[2] / 2], axes };
  }
  if (!PRIMITIVES.has(e.ref)) return null;
  const thin = e.ref === 'EntitySpec.plane' ? 0.05 : 1;
  return { id: e.id, center: [e.transform.pos[0], e.transform.pos[1], e.transform.pos[2]], half: [Math.abs(sx) / 2, (Math.abs(sy) * thin) / 2, Math.abs(sz) / 2], axes };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface Penetration {
  /** Geringste Eindringtiefe in Metern (kleinste Verschiebung, die die Körper trennt). */
  depth: number;
  /** Achse dieser kleinsten Verschiebung. */
  axis: Vec3;
}

/** Eindringtiefe zweier Quader oder null, wenn sie sich nicht durchdringen. */
export function penetration(a: Obb, b: Obb): Penetration | null {
  const t: Vec3 = [b.center[0] - a.center[0], b.center[1] - a.center[1], b.center[2] - a.center[2]];
  let best = Infinity;
  let bestAxis: Vec3 = [0, 1, 0];
  const test = (axis: Vec3): boolean => {
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    if (len < 1e-6) return true; // parallele Kanten: keine Achse
    const n: Vec3 = [axis[0] / len, axis[1] / len, axis[2] / len];
    const ra = a.half[0] * Math.abs(dot(a.axes[0], n)) + a.half[1] * Math.abs(dot(a.axes[1], n)) + a.half[2] * Math.abs(dot(a.axes[2], n));
    const rb = b.half[0] * Math.abs(dot(b.axes[0], n)) + b.half[1] * Math.abs(dot(b.axes[1], n)) + b.half[2] * Math.abs(dot(b.axes[2], n));
    const overlap = ra + rb - Math.abs(dot(t, n));
    if (overlap <= 0) return false;
    if (overlap < best) {
      best = overlap;
      bestAxis = n;
    }
    return true;
  };
  for (const ax of a.axes) if (!test(ax)) return null;
  for (const ax of b.axes) if (!test(ax)) return null;
  for (const ax of a.axes) for (const bx of b.axes) if (!test(cross(ax, bx))) return null;
  return { depth: best, axis: bestAxis };
}

/** Kleinste Eindringtiefe, die gemeldet wird (kleinere Berührungen sind normal: aufeinander liegende Teile). Zusätzlich gilt: Verbindungen bis zur halben Dicke des dünnsten Teils (höchstens 20 cm) werden nicht gemeldet. */
export const OVERLAP_MIN_DEPTH = 0.06;

export interface Overlap {
  a: string;
  b: string;
  depth: number;
  axis: Vec3;
}

/**
 * Prüft die Objekte `checkIds` gegen alle anderen. Paare in derselben Gruppe werden übersprungen (Werkzeuge setzen die Teile
 * einer Gruppe passend), ebenso Paare, bei denen beide in `checkIds` liegen und zur selben Gruppe gehören.
 */
export function findOverlaps(entities: Record<string, EntitySpec>, order: readonly string[], checkIds: readonly string[], limit = 12): { overlaps: Overlap[]; total: number; all?: Overlap[] } {
  const boxes = new Map<string, Obb>();
  for (const id of order) {
    const e = entities[id];
    const o = e && obbOf(e);
    if (o) boxes.set(id, o);
  }
  const radius = (o: Obb) => Math.hypot(...o.half);
  const seen = new Set<string>();
  const found: Overlap[] = [];
  for (const id of checkIds) {
    const a = boxes.get(id);
    const ea = entities[id];
    if (!a || !ea) continue;
    const ra = radius(a);
    for (const [otherId, b] of boxes) {
      if (otherId === id) continue;
      const key = id < otherId ? `${id}|${otherId}` : `${otherId}|${id}`;
      if (seen.has(key)) continue;
      const eb = entities[otherId];
      if (ea.group && ea.group === eb?.group) continue;
      // Grobe Vorprüfung über Hüllkugeln
      const d = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1], a.center[2] - b.center[2]);
      if (d > ra + radius(b)) continue;
      seen.add(key);
      const p = penetration(a, b);
      // Ecken, an denen zwei dünne Wände oder Balken einander um ihre halbe Dicke durchdringen, sind normale Verbindungen.
      const thinnest = Math.min(Math.min(...a.half), Math.min(...b.half)) * 2;
      const joint = Math.min(0.5 * thinnest, 0.2);
      if (p && p.depth >= OVERLAP_MIN_DEPTH && p.depth > joint + 1e-6) found.push({ a: id, b: otherId, depth: p.depth, axis: p.axis });
    }
  }
  found.sort((x, y) => y.depth - x.depth);
  return { overlaps: found.slice(0, limit), total: found.length, all: found.slice(0, 2000) };
}

const r = (n: number) => Math.round(n * 100) / 100;
const axisName = (v: Vec3): string => {
  const i = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];
  const k = i.indexOf(Math.max(...i));
  return ['x', 'y', 'z'][k];
};

/** Text für die KI: wer überschneidet sich mit wem und wie tief; Paare derselben Gruppen werden zusammengefasst. */
export function describeOverlaps(entities: Record<string, EntitySpec>, result: { overlaps: Overlap[]; total: number; all?: Overlap[] }): string {
  const name = (id: string) => entities[id]?.name || entities[id]?.ref.replace('EntitySpec.', '') || id;
  const label = (id: string) => {
    const e = entities[id];
    return e?.group ? `Gruppe „${e.groupName || 'ohne Namen'}“ (${e.group})` : `„${name(id)}“ (${id})`;
  };
  const list = result.all ?? result.overlaps;
  const groups = new Map<string, { a: string; b: string; count: number; depth: number; axis: Vec3 }>();
  for (const o of list) {
    const la = label(o.a);
    const lb = label(o.b);
    const key = la < lb ? `${la}|${lb}` : `${lb}|${la}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { a: la, b: lb, count: 1, depth: o.depth, axis: o.axis });
    else {
      g.count += 1;
      if (o.depth > g.depth) {
        g.depth = o.depth;
        g.axis = o.axis;
      }
    }
  }
  const rows = [...groups.values()].sort((x, y) => y.depth - x.depth);
  const lines = rows.slice(0, 8).map((g) => `${g.a} ↔ ${g.b}: ${g.count === 1 ? '1 Paar' : `${g.count} Paare`}, bis ${r(g.depth)} m ineinander, kleinste Verschiebung entlang ${axisName(g.axis)}`);
  const more = rows.length > 8 ? `\n… und ${rows.length - 8} weitere Kombinationen` : '';
  return `ACHTUNG – Überschneidungen (${result.total} Paar${result.total === 1 ? '' : 'e'}):\n${lines.join('\n')}${more}\nPrüfe, ob das gewollt ist (z. B. Dachbalken, der in einer Wand steckt). Sonst verschiebe das neue Teil oder die ganze Gruppe gezielt (update_entity mit move_by, mindestens um die genannte Tiefe entlang der Achse) statt alles zu entfernen und neu zu bauen. Steht eine Wand in der Bodenplatte, hebe sie (origin y) auf die Oberkante der Platte.`;
}

/** Objekte, deren Unterkante deutlich unter der Inseloberfläche (y = 0) liegt. */
export function belowSurface(entities: Record<string, EntitySpec>, ids: readonly string[], tolerance = 0.1): { id: string; depth: number }[] {
  const out: { id: string; depth: number }[] = [];
  for (const id of ids) {
    const e = entities[id];
    const o = e && obbOf(e);
    if (!o || !e || e.ref === 'EntitySpec.plane') continue;
    const lowest = o.center[1] - (o.half[0] * Math.abs(o.axes[0][1]) + o.half[1] * Math.abs(o.axes[1][1]) + o.half[2] * Math.abs(o.axes[2][1]));
    if (lowest < -tolerance) out.push({ id, depth: -lowest });
  }
  return out.sort((a, b) => b.depth - a.depth);
}

export function describeBelowSurface(entities: Record<string, EntitySpec>, list: { id: string; depth: number }[]): string {
  const name = (id: string) => entities[id]?.name || entities[id]?.ref.replace('EntitySpec.', '') || id;
  const shown = list.slice(0, 5).map((x) => `„${name(x.id)}“ (${x.id}) ${r(x.depth)} m`).join(', ');
  return `Hinweis: Diese Teile stecken unter der Inseloberfläche (y = 0): ${shown}${list.length > 5 ? ` und ${list.length - 5} weitere` : ''}. Grundformen sind um ihre Position zentriert: ein Würfel mit Höhe h steht bei y = h/2 auf dem Boden.`;
}
