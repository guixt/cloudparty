/**
 * KI-Werkzeuge für Klemmbausteine: add_bricks (Raster-Koordinaten in Noppen) und fill_bricks (Mauerwerk mit Versatz).
 * Die Rechnung steckt in shared/bricks.ts.
 */
import { AI_LIMITS } from '../../../shared/aiTools';
import { BRICK_KINDS, placedFromEntity, profilePieces, type ProfileEdge, type ProfileSegment, BRICK_REF, MAX_BRICK_STUDS, STUD, PLATE_H, brickState, brickWorldPos, kindPlates, floorFootprints, layerFootprints, restLevel, type BrickKind, type Footprint, type PlacedBrick } from '../../../shared/bricks';
import { newEntityId, type EntitySpec, type Vec3 } from '../../../shared/types';
import { yawQuat } from './buildGeometry';
import { describeOpening, nameOpenings, saveOpenings, type OpeningInfo } from './anchors';
import { createEntityFromPrefab } from '../../world/entities/prefabs';
import { applyCommon, coord, reserveEntities, fail, int, obj, ok, opts, str, type Handler, type RunCounters, type ToolContext } from './tools';

const MAX_BRICKS = AI_LIMITS.maxPerCall;
/** Größtes Wand-/Boden-Rechteck von fill_bricks (Noppen je Seite) und größte Zahl Öffnungen je Aufruf. Der Systemprompt nennt beide. */
export const FILL_BRICKS_MAX_STUDS = 128;
export const FILL_BRICKS_MAX_OPENINGS = 16;

/** `rot` (0/90/180/270) oder der alte Schalter `rot90`. */
function parseRot(r: Record<string, unknown>): number {
  if (r.rot !== undefined) {
    const v = typeof r.rot === 'number' ? ((Math.round(r.rot) % 360) + 360) % 360 : NaN;
    if (![0, 90, 180, 270].includes(v)) fail('rot muss 0, 90, 180 oder 270 sein.');
    return v;
  }
  return r.rot90 === true ? 90 : 0;
}

function colorOf(v: unknown, label: string): string | undefined {
  if (v === undefined) return undefined;
  const c = str(v, label, 9);
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) fail(`${label} muss eine Farbe #RRGGBB sein.`);
  return c;
}

interface Spec extends Footprint {
  level?: number;
  kind: BrickKind;
  color?: string;
  /** Drehung in Grad: 0, 90, 180 oder 270 (Schrägen fallen bei 0 nach +z, 90 nach +x, 180 nach −z, 270 nach −x). */
  rot: number;
  studs?: boolean;
}

async function place(specs: Spec[], origin: Vec3, name: string, ctx: ToolContext, counters: RunCounters): Promise<{ ids: string[]; group: string; bounds: string }> {
  await reserveEntities(ctx, counters, specs.length, name);
  const { entities, order } = ctx.store.getState();
  const placed: PlacedBrick[] = order.map((id) => entities[id]).filter((e): e is EntitySpec => !!e).map((e) => placedFromEntity(e, origin)).filter((b): b is PlacedBrick => !!b);
  const group = { id: newEntityId('grp'), name };
  const ids: string[] = [];
  const mine: PlacedBrick[] = [];
  specs.forEach((s, i) => {
    const st = brickState({ w: s.w, d: s.d, kind: s.kind });
    const plates = kindPlates(st.kind, st.d);
    const turned = s.rot === 90 || s.rot === 270;
    const fp: Footprint = { gx: s.gx, gz: s.gz, w: turned ? st.d : st.w, d: turned ? st.w : st.d };
    const level = s.level ?? restLevel(fp, placed);
    const brick: PlacedBrick = { ...fp, level, plates };
    placed.push(brick);
    mine.push(brick);
    const base = createEntityFromPrefab(BRICK_REF, [0, 0, 0]);
    // state.w/d sind die unrotierten Maße; die Drehung steckt in der Entity.
    const common: Record<string, unknown> = { state: { w: st.w, d: st.d, kind: st.kind, ...(s.studs === false ? { studs: false } : {}) }, ...(s.color ? { material: { color: s.color, preset: 'lack' } } : {}) };
    const entity = applyCommon(base, common, base);
    entity.transform.pos = brickWorldPos(brick, origin);
    if (s.rot !== 0) entity.transform.rot = yawQuat(s.rot);
    entity.name = `${name} ${i + 1}`;
    entity.group = group.id;
    entity.groupName = group.name;
    ctx.store.getState().addEntity(entity, opts);
    ids.push(entity.id);
  });
  counters.newEntities += specs.length;
  const lo = [Math.min(...mine.map((b) => origin[0] + b.gx * STUD)), Math.min(...mine.map((b) => origin[1] + b.level * PLATE_H)), Math.min(...mine.map((b) => origin[2] + b.gz * STUD))];
  const hi = [Math.max(...mine.map((b) => origin[0] + (b.gx + b.w) * STUD)), Math.max(...mine.map((b) => origin[1] + (b.level + b.plates) * PLATE_H)), Math.max(...mine.map((b) => origin[2] + (b.gz + b.d) * STUD))];
  const f = (v: number[]) => v.map((n) => Math.round(n * 100) / 100).join(', ');
  return { ids, group: group.id, bounds: `Maße: min [${f(lo)}], max [${f(hi)}] (Meter, Welt-Koordinaten). x/z der Steine sind Noppen ab origin (1 Noppe = 0,25 m).` };
}

function originOf(input: Record<string, unknown>): Vec3 {
  return input.origin === undefined ? [0, 0, 0] : coord(input.origin, 'origin');
}

interface Opening {
  name?: string;
  side: 'north' | 'south' | 'east' | 'west';
  at: number;
  width: number;
  layers: number;
  sill: number;
}

/** Liegt der Stein (Schicht `layer`) in einer Öffnung? Norden = z klein, Süden = z groß, Westen = x klein, Osten = x groß. */
function inOpening(fp: Footprint, layer: number, cols: number, rows: number, openings: Opening[]): boolean {
  return openings.some((o) => {
    if (layer < o.sill || layer >= o.sill + o.layers) return false;
    if (o.side === 'north' || o.side === 'south') {
      if (fp.gz !== (o.side === 'north' ? 0 : rows - 1)) return false;
      return fp.gx < o.at + o.width && o.at < fp.gx + fp.w;
    }
    if (fp.gx !== (o.side === 'west' ? 0 : cols - 1)) return false;
    return fp.gz < o.at + o.width && o.at < fp.gz + fp.d;
  });
}

export const brickHandlers: Record<string, Handler> = {
  async bricks_profile(input, ctx, counters) {
    const gx0 = int(input.x, 'x', -500, 500);
    const gz0 = int(input.z, 'z', -500, 500);
    const width = int(input.width, 'width', 1, 64);
    const base = input.base === undefined ? 0 : int(input.base, 'base', 0, 400);
    const origin = originOf(input);
    const color = colorOf(input.color, 'color');
    const raw = input.segments;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) fail('segments muss eine Liste mit 1 bis 20 Einträgen sein.');
    const edges = ['none', 'slope', 'curve'];
    const segments: ProfileSegment[] = (raw as unknown[]).map((v, i) => {
      const r = obj(v, `segments[${i}]`);
      const eb = r.edge_before === undefined ? 'none' : String(r.edge_before);
      const ea = r.edge_after === undefined ? 'none' : String(r.edge_after);
      if (!edges.includes(eb) || !edges.includes(ea)) fail(`segments[${i}]: edge_before/edge_after müssen none, slope oder curve sein.`);
      return { len: int(r.len, `segments[${i}].len`, 1, 64), h: int(r.h, `segments[${i}].h`, 1, 120), edgeBefore: eb as ProfileEdge, edgeAfter: ea as ProfileEdge, color: colorOf(r.color, `segments[${i}].color`) };
    });
    const pieces = profilePieces(width, segments, base);
    if (pieces.length > MAX_BRICKS) fail(`Das Profil braucht ${pieces.length} Teile (höchstens ${MAX_BRICKS} je Aufruf). Teile es in zwei Aufrufe.`);
    const specs: Spec[] = pieces.map((p) => ({ gx: gx0 + p.gx, gz: gz0 + p.gz, w: p.w, d: p.d, level: p.level, kind: p.kind, color: segments[p.segment].color ?? color, rot: p.rot, studs: p.studs }));
    const name = input.name === undefined ? 'Profil' : str(input.name, 'name', 80, true) || 'Profil';
    const { ids, group, bounds } = await place(specs, origin, name, ctx, counters);
    return ok(`Profil gebaut: ${ids.length} Teile, group="${group}". ${bounds} Segmente liegen nacheinander längs z ab Ecke (x=${gx0}, z=${gz0}) Noppen, Breite längs x.`, `${name} gebaut (${ids.length} Teile)`, true);
  },

  async add_bricks(input, ctx, counters) {
    const list = input.bricks;
    if (!Array.isArray(list) || list.length === 0) fail('bricks muss eine nicht leere Liste sein.');
    if ((list as unknown[]).length > MAX_BRICKS) fail(`Höchstens ${MAX_BRICKS} Steine pro Aufruf.`);
    const origin = originOf(input);
    const specs: Spec[] = (list as unknown[]).map((b, i) => {
      const r = obj(b, `bricks[${i}]`);
      const kind = r.kind === undefined ? 'stein' : r.kind;
      if (!BRICK_KINDS.includes(kind as BrickKind)) fail(`bricks[${i}].kind muss eines von ${BRICK_KINDS.join(', ')} sein.`);
      return {
        gx: int(r.x, `bricks[${i}].x`, -500, 500),
        gz: int(r.z, `bricks[${i}].z`, -500, 500),
        w: int(r.w, `bricks[${i}].w`, 1, MAX_BRICK_STUDS),
        d: int(r.d, `bricks[${i}].d`, 1, MAX_BRICK_STUDS),
        ...(r.y === undefined ? {} : { level: int(r.y, `bricks[${i}].y`, 0, 400) }),
        kind: kind as BrickKind,
        color: colorOf(r.color, `bricks[${i}].color`),
        rot: parseRot(r),
        ...(r.studs === false ? { studs: false } : {}),
      };
    });
    const name = input.name === undefined ? 'Steine' : str(input.name, 'name', 80, true) || 'Steine';
    const { ids, group, bounds } = await place(specs, origin, name, ctx, counters);
    return ok(`${ids.length} Steine gesetzt: group="${group}"${ids.length <= 10 ? `, ids: ${ids.join(', ')}` : ''}. ${bounds}`, `${ids.length} Steine gesetzt`, true);
  },

  async fill_bricks(input, ctx, counters) {
    const mode = input.mode;
    if (mode !== 'wall' && mode !== 'floor') fail('mode muss wall oder floor sein.');
    const gx0 = int(input.x, 'x', -500, 500);
    const gz0 = int(input.z, 'z', -500, 500);
    const cols = int(input.cols, 'cols', 1, FILL_BRICKS_MAX_STUDS);
    const rows = int(input.rows, 'rows', 1, FILL_BRICKS_MAX_STUDS);
    const layers = int(input.layers, 'layers', 1, 40);
    if (mode === 'wall' && (cols < 3 || rows < 3)) fail('Eine Wand braucht mindestens 3 × 3 Noppen.');
    const origin = originOf(input);
    const color = colorOf(input.color, 'color');
    const rawOpenings = input.openings === undefined ? [] : input.openings;
    if (!Array.isArray(rawOpenings) || rawOpenings.length > FILL_BRICKS_MAX_OPENINGS) fail(`openings muss eine Liste mit höchstens ${FILL_BRICKS_MAX_OPENINGS} Einträgen sein (für mehr Fenster teile die Wand in zwei Aufrufe).`);
    const openings: Opening[] = (rawOpenings as unknown[]).map((o, i) => {
      const r = obj(o, `openings[${i}]`);
      if (!['north', 'south', 'east', 'west'].includes(String(r.side))) fail(`openings[${i}].side muss north, south, east oder west sein.`);
      return { ...(r.name === undefined ? {} : { name: str(r.name, `openings[${i}].name`, 40) }), side: r.side as Opening['side'], at: int(r.at, `openings[${i}].at`, 0, 64), width: int(r.width, `openings[${i}].width`, 1, 64), layers: int(r.layers, `openings[${i}].layers`, 1, 40), sill: r.sill_layers === undefined ? 0 : int(r.sill_layers, `openings[${i}].sill_layers`, 0, 40) };
    });
    const specs: Spec[] = [];
    for (let layer = 0; layer < layers; layer++) {
      for (const fp of mode === 'wall' ? layerFootprints(cols, rows, layer, true) : floorFootprints(cols, rows)) {
        if (mode === 'wall' && inOpening(fp, layer, cols, rows, openings)) continue;
        // Mauerwerk: Schicht n steht auf Schicht n-1 (Stein 3 Platten); Boden aus Platten.
        const plates = mode === 'wall' ? 3 : 1;
        specs.push({ gx: gx0 + fp.gx, gz: gz0 + fp.gz, w: fp.w, d: fp.d, level: layer * plates, kind: mode === 'wall' ? 'stein' : 'platte', color, rot: 0 });
      }
      if (specs.length > MAX_BRICKS) fail(`Zu viele Steine (mehr als ${MAX_BRICKS} pro Aufruf); teile die Arbeit in mehrere Aufrufe (weniger Schichten oder kleineres Rechteck).`);
    }
    if (specs.length === 0) fail('Es bleibt kein Stein übrig (Öffnungen füllen alles).');
    const name = input.name === undefined ? (mode === 'wall' ? 'Mauer' : 'Bodenplatte') : str(input.name, 'name', 80, true) || 'Mauer';
    const { ids, group, bounds } = await place(specs, origin, name, ctx, counters);
    const m = (n: number) => Math.round(n * 100) / 100;
    let openingInfoText = '';
    const doors = openings.map((o) => {
      const y0 = origin[1] + o.sill * 0.3;
      const y1 = origin[1] + (o.sill + o.layers) * 0.3;
      if (o.side === 'north' || o.side === 'south') {
        const z = origin[2] + (gz0 + (o.side === 'north' ? 0 : rows)) * STUD;
        return `${o.side}: x ${m(origin[0] + (gx0 + o.at) * STUD)}–${m(origin[0] + (gx0 + o.at + o.width) * STUD)} m an der Wand bei z = ${m(z)}, Höhe ${m(y0)}–${m(y1)} m`;
      }
      const x = origin[0] + (gx0 + (o.side === 'west' ? 0 : cols)) * STUD;
      return `${o.side}: z ${m(origin[2] + (gz0 + o.at) * STUD)}–${m(origin[2] + (gz0 + o.at + o.width) * STUD)} m an der Wand bei x = ${m(x)}, Höhe ${m(y0)}–${m(y1)} m`;
    });
    if (openings.length > 0) {
      const kinds = openings.map((o) => (o.sill > 0 ? 'Fenster' : 'Tür') as OpeningInfo['kind']);
      const names = nameOpenings(kinds.map((kind, i) => ({ kind, name: openings[i].name })));
      const infos: OpeningInfo[] = openings.map((o, i) => {
        const horizontal = o.side === 'north' || o.side === 'south';
        const mid = o.at + o.width / 2;
        const sign = o.side === 'north' || o.side === 'west' ? -1 : 1;
        return {
          name: names[i],
          kind: kinds[i],
          center: horizontal
            ? [origin[0] + (gx0 + mid) * STUD, origin[1] + (o.sill + o.layers / 2) * 0.3, origin[2] + (gz0 + (o.side === 'north' ? 0.5 : rows - 0.5)) * STUD]
            : [origin[0] + (gx0 + (o.side === 'west' ? 0.5 : cols - 0.5)) * STUD, origin[1] + (o.sill + o.layers / 2) * 0.3, origin[2] + (gz0 + mid) * STUD],
          width: o.width * STUD,
          height: o.layers * 0.3,
          thickness: STUD,
          u: horizontal ? [1, 0] : [0, 1],
          normal: horizontal ? [0, sign] : [sign, 0],
        };
      });
      saveOpenings(ctx, group, infos);
      openingInfoText = `\nÖffnungen gespeichert (für fit_to_opening/verify):\n${infos.map((o, i) => describeOpening(o, i)).join('\n')}`;
    }
    return ok(`${ids.length} Steine gemauert: group="${group}". ${bounds}${doors.length ? ` Öffnungen (Welt-Koordinaten; north = kleineres z, south = größeres z, west = kleineres x, east = größeres x): ${doors.join('; ')}.` : ''}${openingInfoText}`, `${name} gemauert (${ids.length} Steine)`, true);
  },
};
