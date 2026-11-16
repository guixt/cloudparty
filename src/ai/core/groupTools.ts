/** Werkzeuge für Gruppen (group_entities, ungroup). */
import { newEntityId } from '../../../shared/types';
import { expandTargets, fail, getEntityOrGroup, isObj, ok, opts, str, type Handler, type ToolContext } from './tools';

function groupMembers(ctx: ToolContext, group: string): string[] {
  const { entities, order } = ctx.store.getState();
  return order.filter((id) => entities[id]?.group === group);
}

export const groupHandlers: Record<string, Handler> = {
  group_entities(input, ctx) {
    if (!Array.isArray(input.ids)) fail('ids muss eine Liste von Objekt-ids sein.');
    const raw = input.ids as unknown[];
    if (raw.length > 150) fail('Zu viele Objekte: höchstens 150 pro Gruppe.');
    const entities = expandTargets(ctx, raw);
    const ids = entities.map((e) => e.id);
    if (ids.length < 2) fail('Zum Gruppieren braucht es mindestens 2 verschiedene Objekte.');
    if (ids.length > 150) fail('Zu viele Objekte: höchstens 150 pro Gruppe.');
    const name = input.name === undefined ? 'Gruppe' : str(input.name, 'name', 80).trim() || 'Gruppe';
    const oldGroups = new Set(entities.map((e) => e.group).filter((g): g is string => !!g));
    const group = newEntityId('grp');
    const store = ctx.store.getState();
    for (const e of entities) store.updateEntity(e.id, { group, groupName: name }, opts);
    // Reste alter Gruppen mit nur noch einem Mitglied auflösen.
    for (const old of oldGroups) {
      const rest = groupMembers(ctx, old);
      if (rest.length === 1) ctx.store.getState().updateEntity(rest[0], { group: undefined, groupName: undefined }, opts);
    }
    return ok(`Gruppe angelegt, group="${group}".`, `${entities.length} Objekte gruppiert`, true);
  },

  ungroup(input, ctx) {
    if (!isObj(input)) fail('Ungültige Argumente.');
    const entity = getEntityOrGroup(ctx, input.id);
    if (!entity.group) fail('Dieses Objekt gehört zu keiner Gruppe.');
    const members = groupMembers(ctx, entity.group as string);
    for (const id of members) ctx.store.getState().updateEntity(id, { group: undefined, groupName: undefined }, opts);
    return ok('Gruppe aufgelöst.', `Gruppe aufgelöst (${members.length} Objekte)`, true);
  },
};
