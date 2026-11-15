/** Reine Logik für Mehrfachauswahl, Gruppen, Ausrichten und Verteilen (ohne Babylon). */
import { newEntityId, type EntitySpec, type Quat, type Transform, type Vec3 } from '../../shared/types';

export interface Box {
  min: Vec3;
  max: Vec3;
}

export type AlignMode = 'x-min' | 'x-mid' | 'x-max' | 'z-min' | 'z-mid' | 'z-max' | 'ground';

export const boxCenter = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];

/** Näherung einer Box aus Transform (Würfel der Kantenlänge scale um pos). */
export function boxFromTransform(t: Transform): Box {
  const h = t.scale.map((s) => Math.abs(s) / 2) as Vec3;
  return { min: [t.pos[0] - h[0], t.pos[1] - h[1], t.pos[2] - h[2]], max: [t.pos[0] + h[0], t.pos[1] + h[1], t.pos[2] + h[2]] };
}

export function unionBox(boxes: Box[]): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  if (boxes.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

/** Pivot = Mittelpunkt der gemeinsamen Box. */
export const pivotOf = (boxes: Box[]): Vec3 => boxCenter(unionBox(boxes));

// ---------- Quaternionen ----------
export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const quatConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(angle / 2) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const p = quatMul(quatMul(q, [v[0], v[1], v[2], 0]), quatConj(q));
  return [p[0], p[1], p[2]];
}

// ---------- Transformationen auf Mengen ----------
export function moveTransforms(ts: Transform[], delta: Vec3): Transform[] {
  return ts.map((t) => ({ ...t, pos: [t.pos[0] + delta[0], t.pos[1] + delta[1], t.pos[2] + delta[2]] }));
}

/** Dreht Positionen um den Pivot und verkettet die Drehung (delta wirkt in Weltachsen). */
export function rotateTransforms(ts: Transform[], pivot: Vec3, delta: Quat): Transform[] {
  return ts.map((t) => {
    const r = rotateVec(delta, [t.pos[0] - pivot[0], t.pos[1] - pivot[1], t.pos[2] - pivot[2]]);
    return { ...t, pos: [pivot[0] + r[0], pivot[1] + r[1], pivot[2] + r[2]], rot: quatNormalize(quatMul(delta, t.rot)) };
  });
}

/** Gleichmäßiges Skalieren um den Pivot (Positionen und Größen). */
export function scaleTransforms(ts: Transform[], pivot: Vec3, factor: number): Transform[] {
  return ts.map((t) => ({
    ...t,
    pos: [pivot[0] + (t.pos[0] - pivot[0]) * factor, pivot[1] + (t.pos[1] - pivot[1]) * factor, pivot[2] + (t.pos[2] - pivot[2]) * factor],
    scale: [t.scale[0] * factor, t.scale[1] * factor, t.scale[2] * factor],
  }));
}

// ---------- Ausrichten / Verteilen ----------
/** Verschiebung je Box, um sie auszurichten. */
export function alignDeltas(boxes: Box[], mode: AlignMode): Vec3[] {
  if (boxes.length === 0) return [];
  const u = unionBox(boxes);
  return boxes.map((b) => {
    if (mode === 'ground') return [0, u.min[1] - b.min[1], 0] as Vec3;
    const axis = mode.startsWith('x') ? 0 : 2;
    const kind = mode.slice(2);
    let d: number;
    if (kind === 'min') d = u.min[axis] - b.min[axis];
    else if (kind === 'max') d = u.max[axis] - b.max[axis];
    else d = (u.min[axis] + u.max[axis]) / 2 - (b.min[axis] + b.max[axis]) / 2;
    const out: Vec3 = [0, 0, 0];
    out[axis] = d;
    return out;
  });
}

/** Verschiebung je Box, damit die Mittelpunkte gleichmäßig zwischen erstem und letztem liegen. */
export function distributeDeltas(boxes: Box[], axis: 'x' | 'z'): Vec3[] {
  const i = axis === 'x' ? 0 : 2;
  const deltas: Vec3[] = boxes.map(() => [0, 0, 0]);
  if (boxes.length < 3) return deltas;
  const centers = boxes.map((b) => (b.min[i] + b.max[i]) / 2);
  const order = boxes.map((_, k) => k).sort((a, b) => centers[a] - centers[b]);
  const first = centers[order[0]];
  const last = centers[order[order.length - 1]];
  order.forEach((k, n) => {
    deltas[k][i] = first + ((last - first) * n) / (order.length - 1) - centers[k];
  });
  return deltas;
}

// ---------- Gruppen ----------
export function nextGroupName(existing: (string | undefined)[]): string {
  const used = new Set(existing);
  for (let n = 1; ; n++) if (!used.has(`Gruppe ${n}`)) return `Gruppe ${n}`;
}

export function membersOf(group: string, entities: Record<string, EntitySpec>, order: string[]): string[] {
  return order.filter((id) => entities[id]?.group === group);
}

/** Erweitert die IDs um alle Mitglieder ihrer Gruppen (Reihenfolge der Eingabe bleibt vorn). */
export function expandToGroups(ids: string[], entities: Record<string, EntitySpec>, order: string[]): string[] {
  const out = [...ids];
  const seen = new Set(ids);
  const groups = new Set(ids.map((id) => entities[id]?.group).filter((g): g is string => !!g));
  for (const g of groups) {
    for (const m of membersOf(g, entities, order)) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

export type Patches = Record<string, Partial<EntitySpec>>;

/** Patches zum Gruppieren; Restgruppen mit weniger als 2 Mitgliedern werden aufgelöst. */
export function groupPatches(ids: string[], entities: Record<string, EntitySpec>, order: string[], groupId: string, name: string): Patches {
  const patches: Patches = {};
  const sel = new Set(ids.filter((id) => entities[id]));
  if (sel.size < 2) return patches;
  const oldGroups = new Set([...sel].map((id) => entities[id].group).filter((g): g is string => !!g));
  for (const id of sel) patches[id] = { group: groupId, groupName: name };
  for (const g of oldGroups) {
    const rest = membersOf(g, entities, order).filter((id) => !sel.has(id));
    if (rest.length === 1) patches[rest[0]] = { group: undefined, groupName: undefined };
  }
  return patches;
}

/** Patches zum Auflösen aller Gruppen, die von den IDs berührt werden. */
export function ungroupPatches(ids: string[], entities: Record<string, EntitySpec>, order: string[]): Patches {
  const patches: Patches = {};
  const groups = new Set(ids.map((id) => entities[id]?.group).filter((g): g is string => !!g));
  for (const g of groups) for (const m of membersOf(g, entities, order)) patches[m] = { group: undefined, groupName: undefined };
  return patches;
}

/** Klone mit neuen IDs und neuen Gruppen-IDs, um `offset` verschoben. Gruppen mit nur einem Klon werden aufgelöst. */
export function cloneEntities(source: EntitySpec[], offset: Vec3, idFn: (prefix?: string) => string = newEntityId): EntitySpec[] {
  const groupMap = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const e of source) if (e.group) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
  return source.map((e) => {
    const copy = structuredClone(e);
    copy.id = idFn();
    copy.transform.pos = [e.transform.pos[0] + offset[0], e.transform.pos[1] + offset[1], e.transform.pos[2] + offset[2]];
    if (e.group) {
      if ((counts.get(e.group) ?? 0) < 2) {
        delete copy.group;
        delete copy.groupName;
      } else {
        if (!groupMap.has(e.group)) groupMap.set(e.group, idFn('grp'));
        copy.group = groupMap.get(e.group);
      }
    }
    return copy;
  });
}

// ---------- Marquee ----------
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export function marqueeHit(rect: Rect, points: { id: string; x: number; y: number }[]): string[] {
  const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
  return points.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1).map((p) => p.id);
}
