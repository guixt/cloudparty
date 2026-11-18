/**
 * Platzieren und Prüfen: place_relative, align_entities, fit_to_opening, verify, find_free_spot, what_changed.
 * Die KI beschreibt Beziehungen („auf“, „neben“, „in die Öffnung“), das Werkzeug rechnet die Koordinaten.
 */
import { AI_LIMITS } from '../../../shared/aiTools';
import { DEFAULT_ISLAND, type EntitySpec, type Quat, type Vec3 } from '../../../shared/types';
import { boardSize, mediaKindOfRef } from '../../world/media/helpers';
import { COMPASS_NAMES, compassVector, describeOpening, openingsOfGroup, pickOpening, type OpeningInfo } from './anchors';
import { entityBox } from './buildTools';
import { rotateVec, unionBox, yawQuat, type Box } from './buildGeometry';
import { describeOverlaps, findOverlaps, obbOf } from './overlap';
import { wrapData } from './summary';
import { fail, int, isObj, num, obj, ok, opts, resolveTargets, str, type Handler, type ToolContext } from './tools';

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (v: readonly number[]) => v.map(round).join(', ');
const DEG = Math.PI / 180;
const FRAME_PAD = 0.09;
const FRAME_DEPTH = 0.1;
const SCREEN_BOTTOM = 0.9;

// ---------------------------------------------------------------- Hilfen

interface Unit {
  /** Anzeigename (Gruppenname oder Objektname). */
  label: string;
  members: EntitySpec[];
  box: Box;
  approx: boolean;
}

function unitOf(ctx: ToolContext, id: unknown): Unit {
  const { targets, isGroup } = resolveTargets(ctx, id);
  const boxes = targets.map(entityBox);
  return {
    label: isGroup ? targets[0].groupName || 'Gruppe' : targets[0].name || targets[0].id,
    members: targets,
    box: unionBox(boxes.map((b) => b.box)),
    approx: boxes.some((b) => b.approx),
  };
}

function translate(ctx: ToolContext, members: EntitySpec[], delta: Vec3): void {
  if (delta.every((d) => Math.abs(d) < 1e-9)) return;
  for (const m of members) {
    const p = m.transform.pos;
    ctx.store.getState().updateEntity(m.id, { transform: { ...m.transform, pos: [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]] } }, opts);
  }
}

const size3 = (b: Box): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const centerOf = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
const boxText = (b: Box) => `min [${fmt(b.min)}], max [${fmt(b.max)}], Mitte [${fmt(centerOf(b))}]`;
const AXES = ['x', 'y', 'z'] as const;
type Align = 'min' | 'center' | 'max';

function alignOf(v: unknown, label: string, fallback: Align): Align {
  if (v === undefined) return fallback;
  if (v !== 'min' && v !== 'center' && v !== 'max') fail(`${label} muss min, center oder max sein.`);
  return v as Align;
}

function axisOf(v: unknown, label: string): 0 | 1 | 2 {
  const i = AXES.indexOf(v as (typeof AXES)[number]);
  if (i < 0) fail(`${label} muss x, y oder z sein.`);
  return i as 0 | 1 | 2;
}

// ---------------------------------------------------------------- Tafeln und Öffnungen

/** Bildfläche einer Medien-Tafel in Weltkoordinaten (Mitte, Größe, Blickrichtung der Vorderseite). */
export function mediaScreen(e: EntitySpec): { center: Vec3; width: number; height: number; front: Vec3 } | null {
  const kind = mediaKindOfRef(e.ref);
  if (!kind) return null;
  const bs = boardSize(kind, e.state?.aspect);
  const [sx, sy, sz] = e.transform.scale;
  const off = rotateVec(e.transform.rot as Quat, [0, (SCREEN_BOTTOM + bs.height / 2) * sy, (FRAME_DEPTH / 2 + 0.002) * sz]);
  const p = e.transform.pos;
  return { center: [p[0] + off[0], p[1] + off[1], p[2] + off[2]], width: bs.width * sx, height: bs.height * sy, front: rotateVec(e.transform.rot as Quat, [0, 0, 1]) };
}

/** Lage eines Objekts relativ zu einer Öffnung: Versatz entlang der Wand, nach oben und senkrecht zur Wand sowie Ausdehnung. */
function measureAgainst(e: EntitySpec, o: OpeningInfo): { du: number; dv: number; dn: number; width: number; height: number; approx: boolean; front?: Vec3 } {
  const u: Vec3 = [o.u[0], 0, o.u[1]];
  const n: Vec3 = [o.normal[0], 0, o.normal[1]];
  const rel = (c: Vec3): [number, number, number] => {
    const d: Vec3 = [c[0] - o.center[0], c[1] - o.center[1], c[2] - o.center[2]];
    return [d[0] * u[0] + d[2] * u[2], d[1], d[0] * n[0] + d[2] * n[2]];
  };
  const screen = mediaScreen(e);
  if (screen) {
    const [du, dv, dn] = rel(screen.center);
    // Breite der Bildfläche entlang der Wand: die lokale x-Achse der Tafel auf u projizieren.
    const ex = rotateVec(e.transform.rot as Quat, [1, 0, 0]);
    const along = Math.abs(ex[0] * u[0] + ex[2] * u[2]);
    const width = screen.width * along + 0 * screen.height;
    return { du, dv, dn, width, height: screen.height, approx: false, front: screen.front };
  }
  const obb = obbOf(e);
  if (obb) {
    const ext = (dir: Vec3) => 2 * (obb.half[0] * Math.abs(obb.axes[0][0] * dir[0] + obb.axes[0][1] * dir[1] + obb.axes[0][2] * dir[2]) + obb.half[1] * Math.abs(obb.axes[1][0] * dir[0] + obb.axes[1][1] * dir[1] + obb.axes[1][2] * dir[2]) + obb.half[2] * Math.abs(obb.axes[2][0] * dir[0] + obb.axes[2][1] * dir[1] + obb.axes[2][2] * dir[2]));
    const [du, dv, dn] = rel(obb.center);
    return { du, dv, dn, width: ext(u), height: ext([0, 1, 0]), approx: false };
  }
  const { box, approx } = entityBox(e);
  const [du, dv, dn] = rel(centerOf(box));
  const s = size3(box);
  return { du, dv, dn, width: Math.abs(s[0] * u[0]) + Math.abs(s[2] * u[2]), height: s[1], approx };
}

function openingFor(ctx: ToolContext, wall: unknown, which: unknown): OpeningInfo {
  const target = resolveTargets(ctx, wall).targets[0];
  const list = openingsOfGroup(ctx, target.group);
  try {
    return pickOpening(list, which);
  } catch (error) {
    return fail((error as Error).message);
  }
}

// ---------------------------------------------------------------- Prüfungen (verify)

interface CheckResult {
  pass: boolean;
  text: string;
}

function checkOne(ctx: ToolContext, raw: unknown, index: number): CheckResult {
  const c = obj(raw, `checks[${index}]`);
  const type = c.type;
  const tol = c.tolerance === undefined ? undefined : num(c.tolerance, `checks[${index}].tolerance`, 0.001, 5);
  const label = `${index + 1}. ${String(type)}`;
  switch (type) {
    case 'in_opening': {
      const e = resolveTargets(ctx, c.id).targets[0];
      const o = openingFor(ctx, c.wall, c.opening);
      const t = tol ?? 0.05;
      const m = measureAgainst(e, o);
      const issues: string[] = [];
      if (Math.abs(m.du) > t) issues.push(`seitlich ${round(m.du)} m neben der Mitte (verschiebe um ${round(-m.du)} m entlang der Wand)`);
      if (Math.abs(m.dv) > t) issues.push(`${round(m.dv)} m ${m.dv > 0 ? 'zu hoch' : 'zu tief'} (verschiebe um ${round(-m.dv)} m)`);
      if (m.width > o.width + t) issues.push(`${round(m.width)} m breit, die Öffnung nur ${round(o.width)} m`);
      if (m.height > o.height + t) issues.push(`${round(m.height)} m hoch, die Öffnung nur ${round(o.height)} m`);
      if (Math.abs(m.dn) > o.thickness / 2 + t) issues.push(`${round(Math.abs(m.dn))} m ${m.dn > 0 ? 'vor' : 'hinter'} der Wandmitte (Wand ${round(o.thickness)} m dick), also nicht in der Öffnung`);
      if (m.front && Math.abs(m.front[0] * o.normal[0] + m.front[2] * o.normal[1]) < 0.7) issues.push('Vorderseite zeigt nicht senkrecht zur Wand');
      const facing = m.front ? `, Vorderseite zeigt ${m.front[0] * o.normal[0] + m.front[2] * o.normal[1] > 0 ? 'zur Vorderseite' : 'zur Rückseite'} der Öffnung` : '';
      const fill = `${Math.round((Math.min(m.width, o.width) / o.width) * 100)} % der Breite, ${Math.round((Math.min(m.height, o.height) / o.height) * 100)} % der Höhe`;
      return issues.length === 0 ? { pass: true, text: `✓ ${label}: ${e.name || e.id} sitzt in „${o.name}“ (füllt ${fill}${facing}).` } : { pass: false, text: `✗ ${label}: ${e.name || e.id} sitzt nicht in „${o.name}“: ${issues.join('; ')}. Besser: fit_to_opening.` };
    }
    case 'no_overlap': {
      const { entities, order } = ctx.store.getState();
      const ids = c.id === undefined ? [...order] : resolveTargets(ctx, c.id).targets.map((e) => e.id);
      const result = findOverlaps(entities, order, ids, 6);
      return result.total === 0 ? { pass: true, text: `✓ ${label}: keine Überschneidungen.` } : { pass: false, text: `✗ ${label}: ${describeOverlaps(entities, result)}` };
    }
    case 'touching': {
      const a = unitOf(ctx, c.a);
      const b = unitOf(ctx, c.b);
      const t = tol ?? 0.03;
      const gaps = [0, 1, 2].map((k) => Math.max(a.box.min[k] - b.box.max[k], b.box.min[k] - a.box.max[k]));
      const gap = Math.max(...gaps);
      const text = gap > 0 ? `Abstand ${round(gap)} m` : `durchdringen sich um ${round(-gap)} m`;
      return Math.abs(gap) <= t ? { pass: true, text: `✓ ${label}: „${a.label}“ und „${b.label}“ berühren sich (${text}).` } : { pass: false, text: `✗ ${label}: „${a.label}“ und „${b.label}“ berühren sich nicht: ${text}. Besser: place_relative.` };
    }
    case 'on_ground': {
      const u = unitOf(ctx, c.id);
      const t = tol ?? 0.05;
      const { entities, order } = ctx.store.getState();
      const mine = new Set(u.members.map((m) => m.id));
      let surface = 0;
      let on: string | null = null;
      for (const id of order) {
        const e = entities[id];
        if (!e || mine.has(id) || e.physics?.mode === 'trigger' || e.ref === 'EntitySpec.light' || e.ref === 'EntitySpec.avatar-spawn' || e.ref.startsWith('EntitySpec.water')) continue;
        const { box } = entityBox(e);
        const overlapsXZ = box.min[0] < u.box.max[0] && box.max[0] > u.box.min[0] && box.min[2] < u.box.max[2] && box.max[2] > u.box.min[2];
        if (overlapsXZ && box.max[1] <= u.box.min[1] + 0.5 && box.max[1] > surface) {
          surface = box.max[1];
          on = e.name || e.id;
        }
      }
      const delta = u.box.min[1] - surface;
      return Math.abs(delta) <= t ? { pass: true, text: `✓ ${label}: „${u.label}“ steht auf ${on ? `„${on}“` : 'dem Boden'} (Unterkante ${round(u.box.min[1])} m).` } : { pass: false, text: `✗ ${label}: „${u.label}“ ${delta > 0 ? `schwebt ${round(delta)} m` : `steckt ${round(-delta)} m`} über/unter ${on ? `„${on}“` : 'dem Boden'} (Unterkante ${round(u.box.min[1])} m, Fläche ${round(surface)} m). Besser: place_relative mit where "on_top".` };
    }
    case 'size': {
      const u = unitOf(ctx, c.id);
      const want = c.size;
      if (!Array.isArray(want) || want.length !== 3) fail(`checks[${index}].size muss [Breite x, Höhe y, Tiefe z] sein.`);
      const t = tol ?? 0.05;
      const got = size3(u.box);
      const w = (want as unknown[]).map((v, k) => num(v, `checks[${index}].size[${k}]`, 0, 1000));
      const bad = [0, 1, 2].filter((k) => Math.abs(got[k] - w[k]) > t);
      return bad.length === 0 ? { pass: true, text: `✓ ${label}: „${u.label}“ ist ${fmt(got)} m groß.${u.approx ? ' (geschätzt)' : ''}` } : { pass: false, text: `✗ ${label}: „${u.label}“ ist ${fmt(got)} m groß (x, y, z), erwartet ${fmt(w)}.${u.approx ? ' (Maße geschätzt)' : ''}` };
    }
    case 'inside': {
      const a = unitOf(ctx, c.id);
      const b = unitOf(ctx, c.container);
      const t = tol ?? 0.05;
      const out = [0, 1, 2].flatMap((k) => [a.box.min[k] < b.box.min[k] - t ? `${AXES[k]} ${round(b.box.min[k] - a.box.min[k])} m unter dem Minimum` : '', a.box.max[k] > b.box.max[k] + t ? `${AXES[k]} ${round(a.box.max[k] - b.box.max[k])} m über dem Maximum` : '']).filter(Boolean);
      return out.length === 0 ? { pass: true, text: `✓ ${label}: „${a.label}“ liegt in „${b.label}“.` } : { pass: false, text: `✗ ${label}: „${a.label}“ ragt aus „${b.label}“: ${out.join(', ')}.` };
    }
    default:
      return fail(`checks[${index}].type muss in_opening, no_overlap, touching, on_ground, size oder inside sein.`);
  }
}

// ---------------------------------------------------------------- freier Platz

const FLOOR_TOP = 0.15;

function obstacles(ctx: ToolContext, height: number): Box[] {
  const { entities, order } = ctx.store.getState();
  const out: Box[] = [];
  for (const id of order) {
    const e = entities[id];
    if (!e || e.physics?.mode === 'trigger' || e.ref === 'EntitySpec.light' || e.ref === 'EntitySpec.avatar-spawn' || e.ref.startsWith('EntitySpec.water')) continue;
    const { box } = entityBox(e);
    if (box.max[1] <= FLOOR_TOP || box.min[1] >= height) continue; // Bodenplatten und hoch Hängendes stören nicht
    out.push(box);
  }
  return out;
}

// ---------------------------------------------------------------- Änderungen

export interface ChangeSet {
  created: string[];
  removed: Array<{ id: string; name?: string; group?: string; groupName?: string }>;
  modified: Array<{ id: string; fields: string[] }>;
}

const FIELD_LABELS: Record<string, string> = { transform: 'Position/Größe/Drehung', material: 'Material', name: 'Name', state: 'Zustand', script: 'Skript', physics: 'Physik', particles: 'Partikel', group: 'Gruppe', graph: 'Logik-Graph' };

export function diffEntities(before: EntitySpec, after: EntitySpec): string[] {
  const fields: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof EntitySpec>;
  for (const k of keys) {
    if (k === 'id' || k === 'groupName') continue;
    if (before[k] === after[k]) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) fields.push(FIELD_LABELS[k as string] ?? String(k));
  }
  return fields;
}

// ---------------------------------------------------------------- Handler

export const placeHandlers: Record<string, Handler> = {
  place_relative(input, ctx) {
    const mover = unitOf(ctx, input.id);
    const ref = unitOf(ctx, input.relative_to);
    const refIds = new Set(ref.members.map((m) => m.id));
    if (mover.members.some((m) => refIds.has(m.id))) fail('id und relative_to sind dasselbe Objekt (oder dieselbe Gruppe).');
    const where = input.where;
    const gap = input.gap === undefined ? 0 : num(input.gap, 'gap', -50, 50);
    const alignDefaults: Align[] = ['center', 'center', 'center'];
    const main: number = where === 'on_top' || where === 'below' ? 1 : where === 'east' || where === 'west' ? 0 : where === 'north' || where === 'south' ? 2 : -1;
    if (main < 0) fail('where muss on_top, below, north, south, east oder west sein (north = kleineres z, south = größeres z, west = kleineres x, east = größeres x).');
    if (main !== 1) alignDefaults[1] = 'min'; // Daneben stehen heißt: gleiche Standhöhe
    const align: Align[] = [alignOf(input.align_x, 'align_x', alignDefaults[0]), alignOf(input.align_y, 'align_y', alignDefaults[1]), alignOf(input.align_z, 'align_z', alignDefaults[2])];
    const ms = size3(mover.box);
    const delta: Vec3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let newMin: number;
      if (k === main) {
        if (where === 'east' || where === 'south' || where === 'on_top') newMin = ref.box.max[k] + gap;
        else newMin = ref.box.min[k] - gap - ms[k];
      } else if (align[k] === 'min') newMin = ref.box.min[k];
      else if (align[k] === 'max') newMin = ref.box.max[k] - ms[k];
      else newMin = (ref.box.min[k] + ref.box.max[k]) / 2 - ms[k] / 2;
      delta[k] = newMin - mover.box.min[k];
    }
    if (input.offset !== undefined) {
      if (!Array.isArray(input.offset) || input.offset.length !== 3) fail('offset muss [x, y, z] sein.');
      for (let k = 0; k < 3; k++) delta[k] += num((input.offset as unknown[])[k], `offset[${k}]`, -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate);
    }
    translate(ctx, mover.members, delta);
    const nb: Box = { min: [0, 1, 2].map((k) => mover.box.min[k] + delta[k]) as Vec3, max: [0, 1, 2].map((k) => mover.box.max[k] + delta[k]) as Vec3 };
    const note = mover.approx || ref.approx ? ' Hinweis: zusammengesetzte Bausteine sind nur geschätzt (Größe = scale, Ursprung am Boden); prüfe mit verify.' : '';
    return ok(`„${mover.label}“ ${where === 'on_top' ? 'auf' : where === 'below' ? 'unter' : where === 'north' ? 'nördlich (−z) von' : where === 'south' ? 'südlich (+z) von' : where === 'east' ? 'östlich (+x) von' : 'westlich (−x) von'} „${ref.label}“ gesetzt, Abstand ${round(gap)} m. Verschoben um [${fmt(delta)}]. Neue Maße: ${boxText(nb)}.${note}`, `${mover.label} platziert (${String(where)})`, true);
  },

  align_entities(input, ctx) {
    if (!Array.isArray(input.ids) || input.ids.length < 2) fail('ids muss eine Liste mit mindestens 2 Objekten oder Gruppen sein.');
    const raw = input.ids as unknown[];
    if (raw.length > 60) fail('Höchstens 60 Objekte auf einmal.');
    const units = raw.map((v) => unitOf(ctx, str(v, 'ids[]', 200)));
    if (input.axis === undefined && input.distribute_axis === undefined) fail('Gib axis (ausrichten) und/oder distribute_axis (verteilen) an.');
    const deltas = units.map((): Vec3 => [0, 0, 0]);
    const parts: string[] = [];
    if (input.axis !== undefined) {
      const k = axisOf(input.axis, 'axis');
      const to = alignOf(input.to, 'to', 'center');
      const union = unionBox(units.map((u) => u.box));
      const target = to === 'min' ? union.min[k] : to === 'max' ? union.max[k] : (union.min[k] + union.max[k]) / 2;
      units.forEach((u, i) => {
        const cur = to === 'min' ? u.box.min[k] : to === 'max' ? u.box.max[k] : (u.box.min[k] + u.box.max[k]) / 2;
        deltas[i][k] += target - cur;
      });
      parts.push(`Achse ${AXES[k]}: ${to === 'min' ? 'Minimum bündig' : to === 'max' ? 'Maximum bündig' : 'Mitten bündig'} bei ${round(target)} m`);
    }
    if (input.distribute_axis !== undefined) {
      const k = axisOf(input.distribute_axis, 'distribute_axis');
      const order = units.map((u, i) => i).sort((a, b) => (units[a].box.min[k] + units[a].box.max[k]) - (units[b].box.min[k] + units[b].box.max[k]));
      const sizes = order.map((i) => units[i].box.max[k] - units[i].box.min[k]);
      let gap: number;
      if (input.gap !== undefined) gap = num(input.gap, 'gap', -50, 50);
      else {
        const first = units[order[0]].box.min[k];
        const last = units[order[order.length - 1]].box.max[k];
        gap = (last - first - sizes.reduce((a, b) => a + b, 0)) / (order.length - 1);
        if (gap < -1e-6) fail(`Die Objekte passen nicht gleichmäßig in die Spanne (Abstand wäre ${round(gap)} m). Gib gap an oder nimm eine größere Spanne.`);
      }
      let cursor = units[order[0]].box.min[k];
      order.forEach((i, n) => {
        deltas[i][k] += cursor - units[i].box.min[k];
        cursor += sizes[n] + gap;
      });
      parts.push(`entlang ${AXES[k]} mit Abstand ${round(gap)} m verteilt`);
    }
    units.forEach((u, i) => translate(ctx, u.members, deltas[i]));
    return ok(`${units.length} Objekte angeordnet (${parts.join('; ')}). Neue Abstände prüfst du mit verify.`, `${units.length} Objekte ausgerichtet`, true);
  },

  fit_to_opening(input, ctx) {
    const { targets, isGroup } = resolveTargets(ctx, input.id);
    if (isGroup) fail('fit_to_opening arbeitet mit einem einzelnen Objekt (einer Tafel oder einem Quader), nicht mit einer Gruppe.');
    const e = targets[0];
    const o = openingFor(ctx, input.wall, input.opening);
    const inset = input.inset === undefined ? 0 : num(input.inset, 'inset', 0, 5);
    const W = o.width - 2 * inset;
    const H = o.height - 2 * inset;
    if (W < 0.05 || H < 0.05) fail('inset ist zu groß für diese Öffnung.');
    const mode = input.mode === undefined ? 'flush' : input.mode;
    if (mode !== 'flush' && mode !== 'surface') fail('mode muss flush (bündig in der Wand, Standard) oder surface (auf der Wandfläche) sein.');
    // Blickseite: Standard = die Vorderseite der Öffnung; face (north/south/east/west) wählt die Seite, von der man hinsieht.
    let n: [number, number] = [o.normal[0], o.normal[1]];
    if (input.face !== undefined) {
      const cv = typeof input.face === 'string' ? compassVector(input.face) : null;
      if (!cv) fail(`face muss eines von ${COMPASS_NAMES.join(', ')} sein (die Richtung, in die die Vorderseite zeigt).`);
      if (cv![0] * n[0] + cv![1] * n[1] < 0) n = [-n[0], -n[1]];
    }
    const fillMode = input.fit === undefined ? 'contain' : input.fit;
    if (fillMode !== 'contain' && fillMode !== 'stretch') fail('fit muss contain (Seitenverhältnis behalten, Standard) oder stretch (Öffnung ausfüllen, Bild wird gestreckt) sein.');
    const planeOffset = mode === 'flush' ? Math.max(0, o.thickness / 2 - 0.02) : o.thickness / 2 + 0.01;
    const target: Vec3 = [o.center[0] + n[0] * planeOffset, o.center[1], o.center[2] + n[1] * planeOffset];
    const kind = mediaKindOfRef(e.ref);
    if (kind) {
      let aspectState = e.state?.aspect;
      let bs = boardSize(kind, aspectState);
      if (fillMode === 'stretch') {
        aspectState = Math.min(8, Math.max(0.2, W / H));
        bs = boardSize(kind, aspectState);
      }
      const s = Math.min(W / bs.width, H / bs.height);
      const yawDeg = Math.atan2(n[0], n[1]) / DEG;
      const rot = yawQuat(yawDeg);
      const off = rotateVec(rot, [0, (SCREEN_BOTTOM + bs.height / 2) * s, (FRAME_DEPTH / 2 + 0.002) * s]);
      const pos: Vec3 = [target[0] - off[0], target[1] - off[1], target[2] - off[2]];
      const state = { ...(e.state ?? {}), stand: false, ...(fillMode === 'stretch' ? { aspect: Math.round((aspectState as number) * 10000) / 10000 } : {}) };
      ctx.store.getState().updateEntity(e.id, { transform: { pos, rot, scale: [s, s, s] }, state }, opts);
      const w = bs.width * s;
      const h = bs.height * s;
      return ok(`„${e.name || e.id}“ sitzt jetzt in „${o.name}“: Bildfläche ${round(w)} × ${round(h)} m (Öffnung ${round(o.width)} × ${round(o.height)} m) um [${fmt(target)}], Vorderseite nach ${n[0] !== 0 ? (n[0] > 0 ? 'east (+x)' : 'west (−x)') : n[1] > 0 ? 'south (+z)' : 'north (−z)'}. Standfüße aus. ${w < W - 0.02 || h < H - 0.02 ? 'Das Seitenverhältnis blieb erhalten, deshalb bleibt ein Rand; mit fit "stretch" füllt die Tafel die Öffnung ganz.' : 'Die Öffnung ist ausgefüllt.'}`, `${e.name || 'Tafel'} in ${o.name} eingepasst`, true);
    }
    if (e.ref === 'EntitySpec.box') {
      const depth = input.depth === undefined ? 0.05 : num(input.depth, 'depth', AI_LIMITS.minSize, 2);
      const yawDeg = Math.atan2(-o.u[1], o.u[0]) / DEG;
      ctx.store.getState().updateEntity(e.id, { transform: { pos: mode === 'flush' ? [o.center[0], o.center[1], o.center[2]] : target, rot: yawQuat(yawDeg), scale: [W, H, depth] } }, opts);
      return ok(`„${e.name || e.id}“ füllt jetzt „${o.name}“: ${round(W)} × ${round(H)} m, ${round(depth)} m dick, Mitte [${fmt(mode === 'flush' ? o.center : target)}].`, `${e.name || 'Quader'} in ${o.name} eingepasst`, true);
    }
    return fail(`fit_to_opening unterstützt Medien-Tafeln (EntitySpec.media-*) und Quader (EntitySpec.box, z. B. als Glasscheibe), nicht ${e.ref}. Für andere Objekte nutze place_relative oder update_entity mit der Öffnungsmitte aus get_bounds.`);
  },

  verify(input, ctx) {
    const checks = input.checks;
    if (!Array.isArray(checks) || checks.length === 0) fail('checks muss eine Liste mit mindestens einer Prüfung sein.');
    if ((checks as unknown[]).length > 12) fail('Höchstens 12 Prüfungen pro Aufruf.');
    const results = (checks as unknown[]).map((c, i) => checkOne(ctx, c, i));
    const failed = results.filter((r) => !r.pass).length;
    return ok(wrapData(results.map((r) => r.text).join('\n')), failed === 0 ? `Alle ${results.length} Prüfungen bestanden` : `${failed} von ${results.length} Prüfungen nicht bestanden`, false);
  },

  find_free_spot(input, ctx) {
    const sz = input.size;
    if (!Array.isArray(sz) || sz.length !== 2) fail('size muss [Breite x, Tiefe z] in Metern sein.');
    const w = num((sz as unknown[])[0], 'size[0]', 0.05, 100);
    const d = num((sz as unknown[])[1], 'size[1]', 0.05, 100);
    const clearance = input.clearance === undefined ? 0.3 : num(input.clearance, 'clearance', 0, 10);
    const height = input.height === undefined ? 2 : num(input.height, 'height', 0.1, 100);
    const radius = input.radius === undefined ? 15 : num(input.radius, 'radius', 1, 150);
    const count = input.count === undefined ? 1 : int(input.count, 'count', 1, 5);
    let cx = 0;
    let cz = 0;
    if (input.center !== undefined) {
      if (!Array.isArray(input.center) || input.center.length !== 2) fail('center muss [x, z] sein.');
      cx = num((input.center as unknown[])[0], 'center[0]', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate);
      cz = num((input.center as unknown[])[1], 'center[1]', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate);
    } else {
      const avatar = ctx.getAvatar();
      if (avatar) [cx, cz] = [avatar.position[0], avatar.position[2]];
    }
    const island = ctx.store.getState().world.island ?? DEFAULT_ISLAND;
    const obs = obstacles(ctx, height);
    const hw = w / 2 + clearance;
    const hd = d / 2 + clearance;
    const step = Math.max(0.5, radius / 50);
    const cands: Array<{ x: number; z: number; dist: number }> = [];
    for (let x = cx - radius; x <= cx + radius; x += step) {
      for (let z = cz - radius; z <= cz + radius; z += step) {
        const dist = Math.hypot(x - cx, z - cz);
        if (dist > radius) continue;
        if (Math.hypot(Math.abs(x) + w / 2, Math.abs(z) + d / 2) > island.radius - 0.5) continue;
        cands.push({ x, z, dist });
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    const free = (x: number, z: number) => !obs.some((b) => b.min[0] < x + hw && b.max[0] > x - hw && b.min[2] < z + hd && b.max[2] > z - hd);
    const found: Array<{ x: number; z: number }> = [];
    const sep = Math.max(w, d) + clearance;
    for (const c of cands) {
      if (found.length >= count) break;
      if (found.some((f) => Math.hypot(f.x - c.x, f.z - c.z) < sep)) continue;
      if (free(c.x, c.z)) found.push({ x: round(c.x), z: round(c.z) });
    }
    if (found.length === 0) return ok(wrapData(`Kein freier Platz für ${round(w)} × ${round(d)} m (Abstand ${round(clearance)} m) im Umkreis von ${round(radius)} m um [${round(cx)}, ${round(cz)}]. Verkleinere size/clearance oder vergrößere radius.`), 'Kein freier Platz gefunden', false);
    const lines = found.map((f, i) => `${i + 1}. x ${f.x}, z ${f.z}, y 0 (Boden), Abstand zur Mitte ${round(Math.hypot(f.x - cx, f.z - cz))} m`);
    return ok(wrapData(`Freie Plätze für ${round(w)} × ${round(d)} m (mit ${round(clearance)} m Abstand, ${round(height)} m Höhe frei):\n${lines.join('\n')}`), `${found.length} freie${found.length === 1 ? 'r Platz' : ' Plätze'} gefunden`, false);
  },

  what_changed(_input, ctx) {
    const cs = ctx.changedSince?.();
    if (!cs) fail('Der Änderungsverlauf ist hier nicht verfügbar.');
    const { entities } = ctx.store.getState();
    const lines: string[] = [];
    const groups = new Map<string, EntitySpec[]>();
    const loose: EntitySpec[] = [];
    for (const id of cs!.created) {
      const e = entities[id];
      if (!e) continue;
      if (e.group) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
      else loose.push(e);
    }
    for (const [g, list] of groups) lines.push(`Neu: Gruppe „${list[0].groupName ?? ''}“ (${g}), ${list.length} Teile, ${boxText(unionBox(list.map((m) => entityBox(m).box)))}`);
    for (const e of loose.slice(0, 15)) lines.push(`Neu: ${e.name || e.ref} (${e.id}), ${boxText(entityBox(e).box)}`);
    if (loose.length > 15) lines.push(`… und ${loose.length - 15} weitere neue Einzelobjekte`);
    const modGroups = new Map<string, { label: string; ids: number; fields: Set<string> }>();
    for (const m of cs!.modified) {
      const e = entities[m.id];
      if (!e) continue;
      const key = e.group ?? e.id;
      const cur = modGroups.get(key) ?? { label: e.group ? `Gruppe „${e.groupName ?? ''}“ (${e.group})` : `${e.name || e.ref} (${e.id})`, ids: 0, fields: new Set<string>() };
      cur.ids += 1;
      for (const f of m.fields) cur.fields.add(f);
      modGroups.set(key, cur);
    }
    for (const g of [...modGroups.values()].slice(0, 20)) lines.push(`Geändert: ${g.label}${g.ids > 1 ? ` (${g.ids} Teile)` : ''}: ${[...g.fields].join(', ')}`);
    if (modGroups.size > 20) lines.push(`… und ${modGroups.size - 20} weitere geänderte Einträge`);
    if (cs!.removed.length > 0) {
      const names = new Map<string, number>();
      for (const r of cs!.removed) names.set(r.groupName || r.name || 'Objekt', (names.get(r.groupName || r.name || 'Objekt') ?? 0) + 1);
      lines.push(`Entfernt: ${[...names].slice(0, 10).map(([n, c]) => (c > 1 ? `${n} (${c}×)` : n)).join(', ')} (${cs!.removed.length} Objekte)`);
    }
    return ok(wrapData(lines.length > 0 ? lines.join('\n') : 'Seit Beginn dieses Auftrags hat sich nichts geändert.'), lines.length > 0 ? 'Änderungen zusammengefasst' : 'Nichts geändert', false);
  },
};

export function isPlaceTool(name: string): boolean {
  return name in placeHandlers;
}
export { isObj };
