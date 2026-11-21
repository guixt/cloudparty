/**
 * KI-Werkzeuge für gekrümmte Flächen (Freiform): add_curved_wall, add_lathe, add_surface, add_wavy_wall, update_freeform.
 * Jede Freiform ist ein Objekt (ref EntitySpec.freeform) mit Parametern im `state`; das Netz entsteht im Client.
 */
import { AI_LIMITS } from '../../../shared/aiTools';
import { FREEFORM_LIMITS, FREEFORM_REF, freeformBounds, sanitizeFreeformState, type CutOp, type FreeformState, type PathPoint, type Vec2, type Vec3 as FVec3 } from '../../../shared/freeform';
import { newEntityId, type EntitySpec, type Vec3 } from '../../../shared/types';
import { describeOpening, nameOpenings, openingsOfGroup, saveOpenings, type OpeningInfo } from './anchors';
import { rotateVec } from './buildGeometry';
import { applyCommon, coord, fail, int, isObj, num, obj, ok, opts, reserveEntities, resolveTargets, str, type Handler, type RunCounters, type ToolContext } from './tools';
import { registerHandlers } from './registry';

const round = (n: number) => Math.round(n * 100) / 100;
const DEG = Math.PI / 180;
const MAX_C = AI_LIMITS.maxCoordinate;

/** Prüft einen Freiform-State; Fehler der Geometrie werden zu verständlichen Werkzeugfehlern. */
function checked(state: unknown): FreeformState {
  try {
    return sanitizeFreeformState(state);
  } catch (error) {
    if (error instanceof Error) return fail(error.message.startsWith('Freiform') ? error.message : `Freiform: ${error.message}`);
    throw error;
  }
}

function boundsText(state: FreeformState, pos: Vec3): string {
  try {
    const b = freeformBounds(state);
    const mn = [0, 1, 2].map((i) => round(b.min[i] + pos[i]));
    const mx = [0, 1, 2].map((i) => round(b.max[i] + pos[i]));
    return ` Maße: min [${mn}], max [${mx}] (m).`;
  } catch {
    return '';
  }
}

function xz(v: unknown, label: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) return fail(`${label} muss [x, z] sein.`);
  return [num(v[0], `${label}[0]`, -MAX_C, MAX_C), num(v[1], `${label}[1]`, -MAX_C, MAX_C)];
}

function nameOf(input: Record<string, unknown>, fallback: string): string {
  return input.name === undefined ? fallback : str(input.name, 'name', 80, true) || fallback;
}

function makeFreeform(input: Record<string, unknown>, pos: Vec3, state: FreeformState, name: string, group?: { id: string; name: string }): EntitySpec {
  const base: EntitySpec = { id: newEntityId(), ref: FREEFORM_REF, transform: { pos, rot: [0, 0, 0, 1], scale: [1, 1, 1] }, state: state as unknown as Record<string, unknown> };
  const common: Record<string, unknown> = {};
  for (const key of ['material', 'physics'] as const) if (input[key] !== undefined) common[key] = input[key];
  const entity = applyCommon(base, common, base);
  entity.name = name;
  if (!entity.physics) entity.physics = { mode: 'static' };
  if (group) {
    entity.group = group.id;
    entity.groupName = group.name;
  }
  return entity;
}

// ---------------------------------------------------------------- Pfad (lokale Rechnung für Öffnungen)

interface Seg {
  a: Vec2;
  b: Vec2;
  bulge: number;
  len: number;
}

function segmentsOf(path: PathPoint[], closed: boolean): Seg[] {
  const out: Seg[] = [];
  const n = closed ? path.length : path.length - 1;
  for (let i = 0; i < n; i++) {
    const a = path[i].p;
    const b = path[(i + 1) % path.length].p;
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const s = path[i].bulge ?? 0;
    let len = chord;
    if (Math.abs(s) > 1e-6 && chord > 1e-6) {
      const radius = (chord * chord / 4 + s * s) / (2 * Math.abs(s));
      len = radius * 4 * Math.atan((2 * Math.abs(s)) / chord);
    }
    out.push({ a, b, bulge: s, len });
  }
  return out;
}

/** Punkt und Einheits-Tangente bei Bogenlänge `t` entlang der Segmente. */
function pointAt(segs: Seg[], t: number): { p: Vec2; u: Vec2 } {
  let rest = t;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (rest <= s.len || i === segs.length - 1) {
      const f = s.len > 0 ? Math.min(1, Math.max(0, rest / s.len)) : 0;
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const chord = Math.hypot(dx, dz) || 1;
      if (Math.abs(s.bulge) <= 1e-6) return { p: [s.a[0] + dx * f, s.a[1] + dz * f], u: [dx / chord, dz / chord] };
      const sag = Math.abs(s.bulge);
      const radius = (chord * chord / 4 + sag * sag) / (2 * sag);
      const theta = 4 * Math.atan((2 * sag) / chord);
      const d: Vec2 = [dx / chord, dz / chord];
      const left: Vec2 = [-d[1], d[0]];
      const side = s.bulge > 0 ? 1 : -1;
      const mid: Vec2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      // Mittelpunkt liegt gegenüber der Ausbuchtung: bei Bogen nach links rechts der Sehne (bzw. umgekehrt).
      const c: Vec2 = [mid[0] + left[0] * side * (sag - radius), mid[1] + left[1] * side * (sag - radius)];
      const a0 = Math.atan2(s.a[1] - c[1], s.a[0] - c[0]);
      const dir = s.bulge > 0 ? -1 : 1;
      const ang = a0 + dir * theta * f;
      return { p: [c[0] + radius * Math.cos(ang), c[1] + radius * Math.sin(ang)], u: [dir * -Math.sin(ang), dir * Math.cos(ang)] };
    }
    rest -= s.len;
  }
  return { p: segs[0].a, u: [1, 0] };
}

function parsePath(raw: unknown, label: string): PathPoint[] {
  if (!Array.isArray(raw) || raw.length < 2) return fail(`${label} braucht mindestens 2 Punkte ({p: [x, z], bulge?}).`);
  if (raw.length > FREEFORM_LIMITS.maxPoints) return fail(`${label}: höchstens ${FREEFORM_LIMITS.maxPoints} Punkte (angegeben: ${raw.length}).`);
  return raw.map((q, i) => {
    const r = obj(q, `${label}[${i}]`);
    const point: PathPoint = { p: xz(r.p, `${label}[${i}].p`) };
    if (r.bulge !== undefined) point.bulge = num(r.bulge, `${label}[${i}].bulge`, -FREEFORM_LIMITS.maxSize, FREEFORM_LIMITS.maxSize);
    return point;
  });
}

// ---------------------------------------------------------------- Handler

/** Schnitt aus Weltkoordinaten in lokale Koordinaten der Freiform umrechnen (Verschiebung, Drehung und Skalierung der Entity). */
function cutToLocal(cut: unknown, e: EntitySpec): unknown {
  if (!isObj(cut) || !Array.isArray(cut.pos) || cut.pos.length !== 3 || cut.pos.some((n) => typeof n !== 'number')) return cut;
  const [x, y, z] = e.transform.pos;
  const [qx, qy, qz, qw] = e.transform.rot;
  const [sx, sy, sz] = e.transform.scale;
  const d: Vec3 = [(cut.pos[0] as number) - x, (cut.pos[1] as number) - y, (cut.pos[2] as number) - z];
  const inv = rotateVec([-qx, -qy, -qz, qw], d);
  const local = [inv[0] / (sx || 1), inv[1] / (sy || 1), inv[2] / (sz || 1)].map((n) => Math.round(n * 1000) / 1000);
  return { ...cut, pos: local };
}

export const freeformHandlers: Record<string, Handler> = registerHandlers({
  async add_curved_wall(input, ctx: ToolContext, counters: RunCounters) {
    const path = parsePath(input.path, 'path');
    const height = num(input.height, 'height', 0.2, AI_LIMITS.maxSize);
    const heightEnd = input.height_end === undefined ? undefined : num(input.height_end, 'height_end', 0.2, AI_LIMITS.maxSize);
    const thickness = input.thickness === undefined ? 0.3 : num(input.thickness, 'thickness', AI_LIMITS.minSize, 5);
    const y0 = input.y0 === undefined ? 0 : num(input.y0, 'y0', -MAX_C, MAX_C);
    if (input.closed !== undefined && typeof input.closed !== 'boolean') fail('closed muss true oder false sein.');
    const closed = input.closed === true;
    if (closed && path.length < 3) fail('Ein geschlossener Pfad braucht mindestens 3 Punkte.');
    const rawOpenings = input.openings === undefined ? [] : input.openings;
    if (!Array.isArray(rawOpenings)) fail('openings muss eine Liste sein.');
    if ((rawOpenings as unknown[]).length > FREEFORM_LIMITS.maxCuts) fail(`Höchstens ${FREEFORM_LIMITS.maxCuts} Öffnungen pro Wand.`);
    const segs = segmentsOf(path, closed);
    const total = segs.reduce((s, x) => s + x.len, 0);
    if (total < 0.1) fail('Der Pfad ist zu kurz (mindestens 0,1 m).');
    // Ursprung der Entity = Mitte der Pfadpunkte (x, z); der Pfad liegt relativ dazu.
    const xs = path.map((q) => q.p[0]);
    const zs = path.map((q) => q.p[1]);
    const origin: Vec2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
    const local = path.map((q) => ({ p: [q.p[0] - origin[0], q.p[1] - origin[1]] as Vec2, ...(q.bulge ? { bulge: q.bulge } : {}) }));
    const localSegs = segmentsOf(local, closed);
    const names: Array<string | undefined> = [];
    const cuts: CutOp[] = [];
    const infos: Array<Omit<OpeningInfo, 'name'>> = [];
    (rawOpenings as unknown[]).forEach((o, i) => {
      const r = obj(o, `openings[${i}]`);
      names.push(r.name === undefined ? undefined : str(r.name, `openings[${i}].name`, 40));
      const at = num(r.at, `openings[${i}].at`, 0, 1000);
      const width = num(r.width, `openings[${i}].width`, 0.1, 100);
      const h = num(r.height, `openings[${i}].height`, 0.1, AI_LIMITS.maxSize);
      const sill = r.sill === undefined ? 0 : num(r.sill, `openings[${i}].sill`, 0, AI_LIMITS.maxSize);
      if (at + width > total + 1e-6) fail(`openings[${i}] liegt hinter dem Pfadende (at ${at} + width ${width} > Pfadlänge ${round(total)} m).`);
      const hAt = (d: number) => height + ((heightEnd ?? height) - height) * Math.min(1, d / total);
      const lowest = Math.min(hAt(at), hAt(at + width));
      if (sill + h > lowest + 1e-6) fail(`openings[${i}] ist höher als die Wand an dieser Stelle (sill ${sill} + height ${h} > ${round(lowest)} m).`);
      const { p, u } = pointAt(localSegs, at + width / 2);
      const cy = y0 + sill + h / 2;
      const rotY = Math.atan2(-u[1], u[0]) / DEG;
      cuts.push({ shape: 'box', pos: [round(p[0]), round(cy), round(p[1])], size: [width, h, thickness + 0.4], rotY: round(rotY) });
      infos.push({
        kind: sill > 0 ? 'Fenster' : 'Tür',
        center: [p[0] + origin[0], cy, p[1] + origin[1]],
        width,
        height: h,
        thickness,
        u: [u[0], u[1]],
        normal: [-u[1], u[0]],
      });
    });
    const state = checked({ kind: 'sweep', path: local, ...(closed ? { closedPath: true } : {}), height, ...(heightEnd !== undefined ? { heightEnd } : {}), thickness, ...(y0 !== 0 ? { y0 } : {}), ...(cuts.length > 0 ? { cuts } : {}) });
    await reserveEntities(ctx, counters, 1, 'diese Wand');
    const name = nameOf(input, 'Bogenwand');
    const group = { id: newEntityId('grp'), name };
    const entity = makeFreeform(input, [round(origin[0]), 0, round(origin[1])], state, name, group);
    ctx.store.getState().addEntity(entity, opts);
    counters.newEntities += 1;
    let openingText = '';
    if (infos.length > 0) {
      const kinds = infos.map((o) => o.kind);
      const nm = nameOpenings(kinds.map((kind, i) => ({ kind, name: names[i] })));
      const full: OpeningInfo[] = infos.map((o, i) => ({ ...o, name: nm[i] }));
      saveOpenings(ctx, group.id, full);
      openingText = ` Öffnungen gespeichert (für fit_to_opening/verify):\n${full.map((o, i) => describeOpening(o, i)).join('\n')}`;
    }
    return ok(`Bogenwand angelegt: group="${group.id}", id="${entity.id}", Pfadlänge ${round(total)} m.${boundsText(state, entity.transform.pos)}${openingText}`, `${name} gebaut (${round(total)} m)`, true);
  },

  async add_lathe(input, ctx, counters) {
    const raw = input.profile;
    if (!Array.isArray(raw) || raw.length < 2) fail('profile braucht mindestens 2 Punkte [radius, y].');
    if ((raw as unknown[]).length > FREEFORM_LIMITS.maxPoints) fail(`profile: höchstens ${FREEFORM_LIMITS.maxPoints} Punkte (angegeben: ${(raw as unknown[]).length}).`);
    const profile = (raw as unknown[]).map((q, i) => {
      if (!Array.isArray(q) || q.length !== 2) return fail(`profile[${i}] muss [radius, y] sein.`);
      const radius = num(q[0], `profile[${i}][0] (Radius)`, 0, FREEFORM_LIMITS.maxSize);
      return [radius, num(q[1], `profile[${i}][1] (y)`, -FREEFORM_LIMITS.maxSize, FREEFORM_LIMITS.maxSize)] as Vec2;
    });
    const position = coord(input.position, 'position');
    const draft: Record<string, unknown> = { kind: 'lathe', profile };
    if (input.sweep_degrees !== undefined) draft.sweepDeg = num(input.sweep_degrees, 'sweep_degrees', 1, 360);
    if (input.start_degrees !== undefined) draft.startDeg = num(input.start_degrees, 'start_degrees', -3600, 3600);
    if (input.ellipse !== undefined) draft.ellipse = num(input.ellipse, 'ellipse', 0.1, 10);
    const state = checked(draft);
    await reserveEntities(ctx, counters, 1, 'dieser Drehkörper');
    const name = nameOf(input, 'Drehkörper');
    const entity = makeFreeform(input, position, state, name);
    ctx.store.getState().addEntity(entity, opts);
    counters.newEntities += 1;
    return ok(`Drehkörper angelegt, id="${entity.id}".${boundsText(state, position)}`, `${name} gebaut`, true);
  },

  async add_surface(input, ctx, counters) {
    const raw = input.grid;
    if (!Array.isArray(raw) || raw.length < 2) fail('grid braucht mindestens 2 Zeilen mit je mindestens 2 Punkten [x, y, z].');
    const rows = raw as unknown[];
    if (rows.length > FREEFORM_LIMITS.maxGrid) fail(`grid: höchstens ${FREEFORM_LIMITS.maxGrid} Zeilen (angegeben: ${rows.length}).`);
    let cols = -1;
    const grid = rows.map((row, r) => {
      if (!Array.isArray(row) || row.length < 2) return fail(`grid[${r}] braucht mindestens 2 Punkte.`);
      if (row.length > FREEFORM_LIMITS.maxGrid) fail(`grid[${r}]: höchstens ${FREEFORM_LIMITS.maxGrid} Spalten (angegeben: ${row.length}).`);
      if (cols >= 0 && row.length !== cols) fail(`Alle Zeilen von grid müssen gleich viele Punkte haben (Zeile 0: ${cols}, Zeile ${r}: ${row.length}).`);
      cols = row.length;
      return (row as unknown[]).map((pt, c) => {
        if (!Array.isArray(pt) || pt.length !== 3) return fail(`grid[${r}][${c}] muss [x, y, z] sein.`);
        const lim = FREEFORM_LIMITS.maxSize;
        return [num(pt[0], `grid[${r}][${c}][0]`, -lim, lim), num(pt[1], `grid[${r}][${c}][1]`, -lim, lim), num(pt[2], `grid[${r}][${c}][2]`, -lim, lim)] as FVec3;
      });
    });
    const position = coord(input.position, 'position');
    const draft: Record<string, unknown> = { kind: 'patch', grid };
    if (input.degree !== undefined) draft.degree = int(input.degree, 'degree', 1, 3);
    if (input.thickness !== undefined) draft.thickness = num(input.thickness, 'thickness', 0, 5);
    const state = checked(draft);
    await reserveEntities(ctx, counters, 1, 'diese Fläche');
    const name = nameOf(input, 'Fläche');
    const entity = makeFreeform(input, position, state, name);
    ctx.store.getState().addEntity(entity, opts);
    counters.newEntities += 1;
    return ok(`Fläche angelegt, id="${entity.id}" (${rows.length} × ${cols} Kontrollpunkte).${boundsText(state, position)}`, `${name} gebaut`, true);
  },

  async add_wavy_wall(input, ctx, counters) {
    const from = xz(input.from, 'from');
    const to = xz(input.to, 'to');
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length < 0.5) fail('Anfang und Ende liegen zu nah beieinander (mindestens 0,5 m).');
    const height = num(input.height, 'height', 0.2, AI_LIMITS.maxSize);
    const thickness = input.thickness === undefined ? 0.2 : num(input.thickness, 'thickness', AI_LIMITS.minSize, 5);
    const amplitude = num(input.amplitude, 'amplitude', 0.01, 20);
    const waveLength = num(input.wave_length, 'wave_length', 0.2, 100);
    const y0 = input.y0 === undefined ? 0 : num(input.y0, 'y0', -MAX_C, MAX_C);
    const mid: Vec2 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const state = checked({
      kind: 'sweep',
      path: [{ p: [from[0] - mid[0], from[1] - mid[1]] }, { p: [to[0] - mid[0], to[1] - mid[1]] }],
      height,
      thickness,
      ...(y0 !== 0 ? { y0 } : {}),
      wave: { amplitude, length: waveLength },
    });
    await reserveEntities(ctx, counters, 1, 'diese Wellenwand');
    const name = nameOf(input, 'Wellenwand');
    const entity = makeFreeform(input, [round(mid[0]), 0, round(mid[1])], state, name);
    ctx.store.getState().addEntity(entity, opts);
    counters.newEntities += 1;
    return ok(`Wellenwand angelegt, id="${entity.id}", ${round(length)} m lang.${boundsText(state, entity.transform.pos)}`, `${name} gebaut (${round(length)} m)`, true);
  },

  update_freeform(input, ctx) {
    const { targets, isGroup } = resolveTargets(ctx, input.id);
    const changes = input.changes === undefined ? {} : obj(input.changes, 'changes');
    const addCuts = input.add_cuts === undefined ? [] : Array.isArray(input.add_cuts) ? (input.add_cuts as unknown[]) : fail('add_cuts muss eine Liste von Schnitten sein, z. B. [{"shape":"box","pos":[1,1.5,0],"size":[1.2,1.2,1]}].');
    if (Object.keys(changes).length === 0 && addCuts.length === 0) fail('update_freeform: nichts zu ändern. Gib changes (Felder wie height, path …) oder add_cuts (neue Schnitte) an.');
    const inWorld = input.cuts_in_world === true;
    const forms = targets.filter((e) => e.ref === FREEFORM_REF && e.state);
    if (forms.length === 0) fail(isGroup ? 'Die Gruppe enthält keine Freiform (nur Objekte aus add_curved_wall, add_lathe, add_surface, add_wavy_wall).' : 'Das Objekt ist keine Freiform. Nutze update_entity.');
    if (changes.kind !== undefined) {
      for (const e of forms) if (changes.kind !== (e.state as { kind?: unknown }).kind) fail('Die Art der Freiform (kind) lässt sich nicht ändern; lege ein neues Objekt an.');
    }
    for (const key of ['path', 'profile', 'grid', 'cuts']) {
      const v = changes[key];
      if (v === undefined) continue;
      if (!Array.isArray(v)) fail(`changes.${key} muss eine Liste sein.`);
      const max = key === 'cuts' ? FREEFORM_LIMITS.maxCuts : key === 'grid' ? FREEFORM_LIMITS.maxGrid : FREEFORM_LIMITS.maxPoints;
      if ((v as unknown[]).length > max) fail(`changes.${key}: höchstens ${max} Einträge (angegeben: ${(v as unknown[]).length}).`);
    }
    const ranges: Record<string, [number, number]> = {
      height: [0.2, AI_LIMITS.maxSize],
      heightEnd: [0.2, AI_LIMITS.maxSize],
      thickness: [0, 5],
      y0: [-MAX_C, MAX_C],
      sweepDeg: [1, 360],
      startDeg: [-3600, 3600],
      ellipse: [0.1, 10],
      degree: [1, 3],
    };
    for (const [key, [lo, hi]] of Object.entries(ranges)) if (changes[key] !== undefined) num(changes[key], `changes.${key}`, lo, hi);
    // Erst alle prüfen, dann schreiben: bei einem Fehler bleibt die Welt unverändert.
    const next = forms.map((e) => {
      const merged: Record<string, unknown> = { ...(e.state as Record<string, unknown>), ...changes };
      const toLocal = (c: unknown): unknown => (inWorld ? cutToLocal(c, e) : c);
      if (Array.isArray(changes.cuts)) merged.cuts = (changes.cuts as unknown[]).map(toLocal);
      if (addCuts.length > 0) merged.cuts = [...(Array.isArray(merged.cuts) ? (merged.cuts as unknown[]) : []), ...addCuts.map(toLocal)];
      return { e, state: checked(merged) };
    });
    for (const { e, state } of next) ctx.store.getState().updateEntity(e.id, { state: state as unknown as Record<string, unknown> }, opts);
    // Gespeicherte Öffnungen (add_curved_wall) passen nach einer Formänderung nicht mehr: verwerfen, damit fit_to_opening nicht mit alten Maßen arbeitet.
    const stale = addCuts.length > 0 || ['path', 'cuts', 'y0', 'thickness', 'height', 'heightEnd', 'closedPath'].some((k) => changes[k] !== undefined);
    const groups = new Set(next.map((n) => n.e.group).filter((g): g is string => !!g && openingsOfGroup(ctx, g).length > 0));
    for (const g of groups) if (stale) saveOpenings(ctx, g, []);
    const note = stale && groups.size > 0 ? ' Die gespeicherten Öffnungen sind verworfen (die Form hat sich geändert); passe Tafeln mit update_entity an.' : '';
    const label = next[0].e.name || 'Freiform';
    return ok(next.length === 1 ? `Freiform geändert, id="${next[0].e.id}".${boundsText(next[0].state, next[0].e.transform.pos)}${note}` : `${next.length} Freiformen geändert.${note}`, next.length === 1 ? `${label} geändert` : `${next.length} Freiformen geändert`, true);
  },
});
