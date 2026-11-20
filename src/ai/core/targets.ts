/**
 * Auflösung der Ziele eines Werkzeugs: Objekt-id, Gruppen-id oder Name zu Objekten (mit „Meintest du …?“-Hinweisen).
 */
import type { EntitySpec } from '../../../shared/types';
import type { ToolContext } from './tools';
import { fail, str } from './validate';

/** Mitglieder einer Gruppe (in Weltreihenfolge); leer, wenn es die Gruppe nicht gibt. */
export function groupMembers(ctx: ToolContext, groupId: string): EntitySpec[] {
  const { entities, order } = ctx.store.getState();
  return order.map((eid) => entities[eid]).filter((e): e is EntitySpec => !!e && e.group === groupId);
}

/** Eindeutiger Treffer nach Objektname (ohne Groß/Kleinschreibung); bei mehreren Treffern Fehler mit den ersten ids. */
function byName(ctx: ToolContext, sid: string): EntitySpec | undefined {
  const needle = sid.trim().toLowerCase();
  if (!needle) return undefined;
  const { entities, order } = ctx.store.getState();
  const hits = order.map((i) => entities[i]).filter((e): e is EntitySpec => !!e && (e.name ?? '').trim().toLowerCase() === needle);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(`Der Name "${sid.slice(0, 60)}" ist nicht eindeutig (${hits.length} Objekte, z. B. ${hits.slice(0, 5).map((h) => h.id).join(', ')}). Nimm eine id.`);
  return undefined;
}

/** Gruppe nach Gruppenname (eindeutig), sonst leer. */
function groupByName(ctx: ToolContext, sid: string): EntitySpec[] {
  const needle = sid.trim().toLowerCase();
  if (!needle) return [];
  const { entities, order } = ctx.store.getState();
  const hits = order.map((i) => entities[i]).filter((e): e is EntitySpec => !!e && !!e.group && (e.groupName ?? '').trim().toLowerCase() === needle);
  return new Set(hits.map((h) => h.group)).size === 1 ? hits : [];
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Hinweis „Meintest du …?“ bei falsch abgetippten ids oder Namen (Leerzeichen, Tippfehler, Teilnamen). */
export function didYouMean(ctx: ToolContext, sid: string): string {
  const needle = sid.replace(/\s+/g, '').toLowerCase();
  const text = sid.trim().toLowerCase();
  const words = text.split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 5);
  if (!needle) return '';
  const { entities, order } = ctx.store.getState();
  const hits: string[] = [];
  const seenGroups = new Set<string>();
  for (const id of order) {
    const e = entities[id];
    if (!e) continue;
    const name = (e.name ?? '').trim().toLowerCase();
    const close = id.toLowerCase() === needle || editDistance(id.toLowerCase(), needle) <= 2;
    const partial = text.length >= 4 && name.length >= 4 && (name.includes(text) || text.includes(name) || words.some((w) => name.includes(w)));
    if (close || partial) hits.push(`${id}${e.name ? ` („${e.name}“)` : ''}`);
    const gname = (e.groupName ?? '').trim().toLowerCase();
    if (e.group && !seenGroups.has(e.group) && text.length >= 4 && gname.length >= 4 && (gname.includes(text) || text.includes(gname) || words.some((w) => gname.includes(w)))) {
      seenGroups.add(e.group);
      hits.push(`${e.group} (Gruppe „${e.groupName}“)`);
    }
    if (hits.length >= 4) break;
  }
  return hits.length > 0 ? ` Meintest du: ${hits.join(', ')}?` : '';
}

export function getEntity(ctx: ToolContext, id: unknown): EntitySpec {
  const sid = str(id, 'id', 200);
  const entity = ctx.store.getState().entities[sid];
  if (entity) return entity;
  const members = groupMembers(ctx, sid);
  if (members.length > 0) {
    return fail(`"${sid.slice(0, 60)}" ist eine Gruppen-id, kein Objekt. Nimm die id eines Mitglieds (z. B. "${members[0].id}"); get_bounds, clone_group, use_texture, look, remove_entity und update_entity (material, physics, particles, move_by) akzeptieren auch Gruppen-ids.`);
  }
  return byName(ctx, sid) ?? fail(`Kein Objekt mit der id "${sid.slice(0, 60)}" gefunden.${didYouMean(ctx, sid)} Kopiere ids exakt aus einem Werkzeugergebnis oder rufe get_world auf.`);
}

/** Ziel eines Werkzeugs: ein Objekt oder (bei einer Gruppen-id oder einem eindeutigen Gruppennamen) alle Mitglieder der Gruppe. */
export function resolveTargets(ctx: ToolContext, id: unknown): { targets: EntitySpec[]; isGroup: boolean } {
  const sid = str(id, 'id', 200);
  const entity = ctx.store.getState().entities[sid];
  if (entity) return { targets: [entity], isGroup: false };
  const members = groupMembers(ctx, sid);
  if (members.length > 0) return { targets: members, isGroup: true };
  const named = byName(ctx, sid);
  if (named) return { targets: [named], isGroup: false };
  const byGroupName = groupByName(ctx, sid);
  if (byGroupName.length > 0) return { targets: byGroupName, isGroup: true };
  return { targets: [getEntity(ctx, id)], isGroup: false };
}

/** Wie getEntity, akzeptiert aber auch eine Gruppen-id (liefert dann das erste Mitglied). */
export function getEntityOrGroup(ctx: ToolContext, id: unknown): EntitySpec {
  return resolveTargets(ctx, id).targets[0];
}

/** Liste von ids (Objekt-ids, Gruppen-ids oder Namen) zu Objekten; Gruppen werden zu ihren Mitgliedern, ohne Doppelte. */
export function expandTargets(ctx: ToolContext, raw: unknown[]): EntitySpec[] {
  const out = new Map<string, EntitySpec>();
  raw.forEach((v) => {
    for (const e of resolveTargets(ctx, str(v, 'id', 200)).targets) out.set(e.id, e);
  });
  return [...out.values()];
}
