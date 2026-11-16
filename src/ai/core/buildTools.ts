/**
 * KI-Bauwerkzeuge: add_wall, add_beam, array, clone_group, get_bounds, surface_height_at.
 * Die Rechnung steckt in buildGeometry.ts; hier werden Eingaben geprüft und Objekte angelegt.
 */
import { AI_LIMITS } from '../../../shared/aiTools';
import { BRICK_REF, brickSize, brickState } from '../../../shared/bricks';
import { DEFAULT_ISLAND, newEntityId, type EntitySpec, type Quat, type Vec3 } from '../../../shared/types';
import { createEntityFromPrefab, getPrefab } from '../../world/entities/prefabs';
import { baseEntityFor, isKnownRef, knownRefs } from './refs';
import {
  GeometryError,
  arrayItems,
  beamTransform,
  quatMul,
  rotatedBox,
  transformPoint,
  transformRotation,
  unionBox,
  wallPieces,
  yawQuat,
  type Box,
  type Mirror,
  type Opening,
} from './buildGeometry';
import { wrapData } from './summary';
import { applyCommon, coord, reserveEntities, fail, getEntityOrGroup, num, obj, ok, opts, str, vec, type Handler, type RunCounters, type ToolContext } from './tools';

const MAX_WALL_PIECES = 100;
const MAX_ARRAY_ITEMS = AI_LIMITS.maxPerCall;
const MAX_CLONES = 10;
const round = (n: number) => Math.round(n * 100) / 100;
const roundVec = (v: Vec3): Vec3 => [round(v[0]), round(v[1]), round(v[2])];

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof GeometryError) return fail(error.message);
    throw error;
  }
}

function xz(v: unknown, label: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) return fail(`${label} muss [x, z] sein.`);
  return [num(v[0], `${label}[0]`, -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate), num(v[1], `${label}[1]`, -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate)];
}

/** Gemeinsame Eigenschaften (Material, Physik, Name …) aus der Eingabe auf eine neue Grundform anwenden. */
function makePiece(ref: string, pos: Vec3, rot: Quat, scale: Vec3, input: Record<string, unknown>, name: string, group?: { id: string; name: string }): EntitySpec {
  const base = createEntityFromPrefab(ref, [0, 0, 0]);
  base.transform = { pos, rot, scale };
  const common: Record<string, unknown> = {};
  for (const key of ['material', 'physics', 'particles', 'state'] as const) if (input[key] !== undefined) common[key] = input[key];
  const entity = applyCommon(base, common, base);
  entity.name = name;
  if (!entity.physics) entity.physics = { mode: 'static' };
  if (group) {
    entity.group = group.id;
    entity.groupName = group.name;
  }
  return entity;
}

const PRIMITIVES = new Set(['EntitySpec.box', 'EntitySpec.sphere', 'EntitySpec.cylinder', 'EntitySpec.cone', 'EntitySpec.plane', 'EntitySpec.torus']);

/** Rahmen eines Objekts; bei zusammengesetzten Bausteinen (Ursprung am Boden) nur geschätzt. */
export function entityBox(e: EntitySpec): { box: Box; approx: boolean } {
  if (e.ref === BRICK_REF) {
    // Klemmbaustein: Maße aus Noppen/Art; Ursprung = Mitte der Grundfläche an der Unterkante.
    const size = brickSize(brickState(e.state));
    const center: Vec3 = [e.transform.pos[0], e.transform.pos[1] + size[1] / 2, e.transform.pos[2]];
    return { box: rotatedBox(center, size, e.transform.rot), approx: false };
  }
  const [sx, sy, sz] = e.transform.scale;
  if (PRIMITIVES.has(e.ref)) {
    const thin = e.ref === 'EntitySpec.plane' ? 0.05 : 1;
    return { box: rotatedBox(e.transform.pos, [sx, sy * thin, sz], e.transform.rot), approx: false };
  }
  const center: Vec3 = [e.transform.pos[0], e.transform.pos[1] + sy / 2, e.transform.pos[2]];
  return { box: rotatedBox(center, [sx, sy, sz], e.transform.rot), approx: true };
}

/** Kurztext mit Rahmen (min, max, Mitte) für Werkzeugergebnisse; spart der KI spätere get_bounds-Aufrufe. */
export function boundsText(entities: EntitySpec[]): string {
  const box = unionBox(entities.map((e) => entityBox(e).box));
  const mid = [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2) as Vec3;
  return `Maße: min [${roundVec(box.min)}], max [${roundVec(box.max)}], Mitte [${roundVec(mid)}] (m).`;
}

/** ids nur bei wenigen Teilen aufzählen; die Gruppen-id genügt für die weiteren Werkzeuge. */
export function idsText(ids: string[]): string {
  return ids.length <= 10 ? `, ids: ${ids.join(', ')}` : '';
}

function membersOf(ctx: ToolContext, e: EntitySpec): EntitySpec[] {
  const { entities, order } = ctx.store.getState();
  return e.group ? order.map((id) => entities[id]).filter((x): x is EntitySpec => !!x && x.group === e.group) : [e];
}

export const buildHandlers: Record<string, Handler> = {
  async add_wall(input, ctx, counters) {
    const from = xz(input.from, 'from');
    const to = xz(input.to, 'to');
    const height = num(input.height, 'height', 0.2, AI_LIMITS.maxSize);
    const thickness = input.thickness === undefined ? 0.3 : num(input.thickness, 'thickness', AI_LIMITS.minSize, 5);
    const y0 = input.y0 === undefined ? 0 : num(input.y0, 'y0', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate);
    const rawOpenings = input.openings === undefined ? [] : input.openings;
    if (!Array.isArray(rawOpenings)) fail('openings muss eine Liste sein.');
    if ((rawOpenings as unknown[]).length > 10) fail('Höchstens 10 Öffnungen pro Wand.');
    const openings: Opening[] = (rawOpenings as unknown[]).map((o, i) => {
      const r = obj(o, `openings[${i}]`);
      return {
        at: num(r.at, `openings[${i}].at`, 0, 1000),
        width: num(r.width, `openings[${i}].width`, 0.1, 100),
        height: num(r.height, `openings[${i}].height`, 0.1, AI_LIMITS.maxSize),
        ...(r.sill === undefined ? {} : { sill: num(r.sill, `openings[${i}].sill`, 0, AI_LIMITS.maxSize) }),
      };
    });
    const pieces = guard(() => wallPieces(from, to, height, thickness, y0, openings));
    if (pieces.length > MAX_WALL_PIECES) fail(`Die Wand besteht aus zu vielen Teilen (${pieces.length}, höchstens ${MAX_WALL_PIECES}).`);
    await reserveEntities(ctx, counters, pieces.length, 'diese Wand');
    const name = input.name === undefined ? 'Wand' : str(input.name, 'name', 80, true) || 'Wand';
    const group = { id: newEntityId('grp'), name };
    const ids: string[] = [];
    const made: EntitySpec[] = [];
    pieces.forEach((p, i) => {
      const entity = makePiece('EntitySpec.box', p.center, yawQuat(p.yawDeg), p.size, input, `${name} ${i + 1}`, group);
      ctx.store.getState().addEntity(entity, opts);
      ids.push(entity.id);
      made.push(entity);
    });
    counters.newEntities += pieces.length;
    return ok(`Wand angelegt: group="${group.id}", ${pieces.length} Teile${idsText(ids)}. ${boundsText(made)}`, `${name} gebaut (${pieces.length} Teile)`, true);
  },

  async add_beam(input, ctx, counters) {
    await reserveEntities(ctx, counters, 1, 'dieser Balken');
    const a = coord(input.from, 'from');
    const b = coord(input.to, 'to');
    const thickness = num(input.thickness, 'thickness', AI_LIMITS.minSize, 10);
    const shape = input.shape === undefined ? 'cylinder' : input.shape;
    if (shape !== 'cylinder' && shape !== 'box') fail('shape muss cylinder oder box sein.');
    const t = beamTransform(a, b, thickness);
    if (t.length < 0.1) fail('Anfang und Ende liegen zu nah beieinander (mindestens 0,1 m).');
    if (t.length > AI_LIMITS.maxSize * 3) fail(`Der Balken ist zu lang (höchstens ${AI_LIMITS.maxSize * 3} m).`);
    // Größen über maxSize hinaus gehen nicht: lange Balken über 60 m werden abgewiesen, wo scale > maxSize wäre.
    if (t.length > AI_LIMITS.maxSize) fail(`Die Länge liegt über der Größengrenze von ${AI_LIMITS.maxSize} m; teile den Balken in zwei.`);
    const name = input.name === undefined ? 'Balken' : str(input.name, 'name', 80, true) || 'Balken';
    const entity = makePiece(shape === 'box' ? 'EntitySpec.box' : 'EntitySpec.cylinder', t.center, t.rot, t.scale, input, name);
    ctx.store.getState().addEntity(entity, opts);
    counters.newEntities += 1;
    return ok(`Balken angelegt, id="${entity.id}", Länge ${round(t.length)} m.`, `${name} gesetzt (${round(t.length)} m)`, true);
  },

  async array(input, ctx, counters) {
    const ref = str(input.ref, 'ref', 100);
    if (!isKnownRef(ref)) fail(`Unbekannter ref "${ref.slice(0, 60)}". Gültige refs: ${knownRefs().join(', ')}`);
    const pattern = input.pattern;
    let items;
    if (pattern === 'circle') {
      const count = num(input.count, 'count', 2, MAX_ARRAY_ITEMS);
      items = arrayItems({
        pattern: 'circle',
        count: Math.round(count),
        radius: num(input.radius, 'radius', 0.1, AI_LIMITS.maxCoordinate),
        center: coord(input.center, 'center'),
        startDeg: input.start_degrees === undefined ? 0 : num(input.start_degrees, 'start_degrees', -3600, 3600),
        faceCenter: input.face_center === true,
      });
    } else if (pattern === 'line') {
      items = arrayItems({ pattern: 'line', count: Math.round(num(input.count, 'count', 2, MAX_ARRAY_ITEMS)), start: coord(input.start, 'start'), step: vec(input.step, 'step', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate) });
    } else if (pattern === 'grid') {
      const rows = Math.round(num(input.rows, 'rows', 1, MAX_ARRAY_ITEMS));
      const cols = Math.round(num(input.cols, 'cols', 1, MAX_ARRAY_ITEMS));
      if (rows * cols > MAX_ARRAY_ITEMS) fail(`Raster zu groß (${rows * cols} Teile, höchstens ${MAX_ARRAY_ITEMS}).`);
      const sp = xz(input.spacing, 'spacing');
      items = arrayItems({ pattern: 'grid', rows, cols, spacing: sp, origin: coord(input.origin, 'origin') });
    } else {
      return fail('pattern muss circle, line oder grid sein.');
    }
    if (items.length > MAX_ARRAY_ITEMS) fail(`Zu viele Teile (höchstens ${MAX_ARRAY_ITEMS}).`);
    await reserveEntities(ctx, counters, items.length, 'diese Anordnung');
    const label = input.name === undefined ? getPrefab(ref)?.label ?? 'Objekt' : str(input.name, 'name', 80, true) || 'Objekt';
    const group = { id: newEntityId('grp'), name: label };
    const ids: string[] = [];
    const made: EntitySpec[] = [];
    items.forEach((item, i) => {
      const base = baseEntityFor(ref);
      base.transform.pos = item.pos;
      const common: Record<string, unknown> = {};
      for (const key of ['material', 'physics', 'particles', 'state', 'scale', 'rotation_degrees'] as const) if (input[key] !== undefined) common[key] = input[key];
      const entity = applyCommon(base, common, base);
      entity.transform.pos = item.pos;
      if (item.yawDeg !== 0) entity.transform.rot = quatMul(yawQuat(item.yawDeg), entity.transform.rot);
      entity.name = `${label} ${i + 1}`;
      entity.group = group.id;
      entity.groupName = group.name;
      ctx.store.getState().addEntity(entity, opts);
      ids.push(entity.id);
      made.push(entity);
    });
    counters.newEntities += items.length;
    return ok(`Angeordnet: group="${group.id}", ${items.length} Objekte${idsText(ids)}. ${boundsText(made)}`, `${items.length}× ${label} angeordnet`, true);
  },

  async clone_group(input, ctx, counters) {
    const source = getEntityOrGroup(ctx, input.id);
    const members = membersOf(ctx, source);
    const count = input.count === undefined ? 1 : Math.round(num(input.count, 'count', 1, MAX_CLONES));
    await reserveEntities(ctx, counters, members.length * count, 'dieses Klonen');
    const offset: Vec3 = input.offset === undefined ? [0, 0, 0] : vec(input.offset, 'offset', -2 * AI_LIMITS.maxCoordinate, 2 * AI_LIMITS.maxCoordinate);
    const yaw = input.rotate_y_degrees === undefined ? 0 : num(input.rotate_y_degrees, 'rotate_y_degrees', -3600, 3600);
    const mirror: Mirror = input.mirror === undefined ? undefined : input.mirror === 'x' || input.mirror === 'z' ? input.mirror : (fail('mirror muss x oder z sein.') as never);
    let pivot: [number, number];
    if (input.pivot !== undefined) pivot = xz(input.pivot, 'pivot');
    else {
      const b = unionBox(members.map((m) => entityBox(m).box));
      pivot = [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
    }
    if (yaw === 0 && !mirror && offset.every((v) => v === 0)) fail('Gib offset, rotate_y_degrees oder mirror an, sonst entsteht eine Kopie an derselben Stelle.');
    const baseName = source.groupName ?? source.name ?? 'Objekt';
    const created: string[] = [];
    const groups: string[] = [];
    for (let k = 1; k <= count; k++) {
      const group = members.length > 1 || source.group ? newEntityId('grp') : undefined;
      groups.push(group ?? '');
      for (const m of members) {
        const pos = transformPoint(m.transform.pos, pivot, yaw * k, mirror, [offset[0] * k, offset[1] * k, offset[2] * k]);
        const copy: EntitySpec = JSON.parse(JSON.stringify(m));
        copy.id = newEntityId();
        copy.transform = { ...m.transform, pos, rot: transformRotation(m.transform.rot, yaw * k, mirror) };
        if (group) {
          copy.group = group;
          copy.groupName = `${baseName} (Kopie ${k})`;
        } else delete copy.group;
        ctx.store.getState().addEntity(copy, opts);
        created.push(copy.id);
      }
    }
    counters.newEntities += created.length;
    return ok(`Kopiert: ${created.length} Objekte${groups[0] ? `, group="${groups.join('", "')}"` : ''}, ids: ${created.join(', ')}.`, `${baseName} kopiert (${count}×)`, true);
  },

  get_bounds(input, ctx) {
    const entity = getEntityOrGroup(ctx, input.id);
    const members = membersOf(ctx, entity);
    const boxes = members.map(entityBox);
    const box = unionBox(boxes.map((b) => b.box));
    const size: Vec3 = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
    const result = {
      id: entity.id,
      gruppe: entity.group ?? null,
      objekte: members.length,
      min: roundVec(box.min),
      max: roundVec(box.max),
      mitte: roundVec([(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]),
      groesse: roundVec(size),
      ungefaehr: boxes.some((b) => b.approx),
      hinweis: boxes.some((b) => b.approx) ? 'Zusammengesetzte Bausteine (Bank, Baum …) sind nur geschätzt (Größe = scale, Ursprung am Boden).' : undefined,
    };
    return ok(wrapData(JSON.stringify(result)), `Maße gelesen (${round(size[0])} × ${round(size[1])} × ${round(size[2])} m)`, false);
  },

  surface_height_at(input, ctx) {
    const x = num(input.x, 'x', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate);
    const z = num(input.z, 'z', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate);
    const state = ctx.store.getState();
    const island = state.world.island ?? DEFAULT_ISLAND;
    const dist = Math.hypot(x, z);
    let top = 0;
    let on: string | null = null;
    for (const id of state.order) {
      const e = state.entities[id];
      if (!e || e.physics?.mode === 'trigger' || e.ref === 'EntitySpec.avatar-spawn' || e.ref.startsWith('EntitySpec.water') || e.ref === 'EntitySpec.light') continue;
      const { box } = entityBox(e);
      if (x >= box.min[0] && x <= box.max[0] && z >= box.min[2] && z <= box.max[2] && box.max[1] > top) {
        top = box.max[1];
        on = e.id;
      }
    }
    const result = { x, z, aufDerInsel: dist <= island.radius, abstandZumRand: round(island.radius - dist), hoehe: round(top), liegtAuf: on };
    return ok(wrapData(JSON.stringify(result)), `Höhe bei (${round(x)}, ${round(z)}): ${round(top)} m`, false);
  },
};
