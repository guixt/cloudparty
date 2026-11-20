/** Werkzeuge für die Bibliothek (library_list, library_place, library_save). Namen/Beschreibungen sind Nutzerinhalt = Daten. */
import { AI_LIMITS } from '../../../shared/aiTools';
import { LIBRARY_LIMITS } from '../../../shared/library';
import { getLibrary } from '../../library';
import type { LibraryApi } from '../../library/api';
import { coord, expandTargets, reserveEntities, fail, getEntity, num, obj, ok, str, type Handler } from './tools';
import { registerHandlers } from './registry';
import { wrapData } from './summary';

function lib(): LibraryApi {
  return getLibrary() ?? fail('Die Bibliothek ist nicht verfügbar.');
}

export const libraryHandlers: Record<string, Handler> = registerHandlers({
  async library_list(input) {
    const api = lib();
    const query = input.query === undefined ? '' : str(input.query, 'query', 100, true).trim();
    const all = await api.list(query || undefined);
    const q = query.toLowerCase();
    const hits = q
      ? all.filter((m) => [m.name, m.description, ...(m.tags ?? [])].some((t) => String(t).toLowerCase().includes(q)))
      : all;
    const shown = hits.slice(0, 50).map((m) => ({ id: m.id, name: m.name, description: m.description, tags: m.tags, count: m.count, builtin: !!m.builtin }));
    const note = hits.length > shown.length ? { hinweis: `Nur die ersten ${shown.length} von ${hits.length} gezeigt; verfeinere die Suche.` } : {};
    return ok(wrapData(JSON.stringify({ bausteine: shown, ...note })), `Bibliothek durchsucht (${hits.length} Treffer)`, false);
  },

  async library_place(input, ctx, counters) {
    const api = lib();
    const id = str(input.id, 'id', 200);
    const at = coord(input.position, 'position');
    const yaw = input.yaw_degrees === undefined ? undefined : num(input.yaw_degrees, 'yaw_degrees', -3600, 3600);
    const groupName = input.group_name === undefined ? undefined : str(input.group_name, 'group_name', 80);
    const item = await api.get(id);
    if (!item) fail(`Kein Baustein mit der id "${id.slice(0, 60)}" gefunden. Rufe library_list auf.`);
    const count = item!.count ?? item!.entities?.length ?? 1;
    await reserveEntities(ctx, counters, count, 'dieser Baustein');
    const ids = await api.place(id, { at, ...(yaw !== undefined ? { yawDegrees: yaw } : {}), ...(groupName ? { groupName } : {}) });
    counters.newEntities += ids.length || count;
    return ok(`Baustein platziert, ${ids.length} Objekte: ${JSON.stringify(ids)}`, `Baustein „${item!.name.slice(0, 40)}“ platziert (${ids.length} Objekte)`, true);
  },

  async library_save(input, ctx) {
    const api = lib();
    const name = str(input.name, 'name', LIBRARY_LIMITS.maxNameLength).trim();
    const description = input.description === undefined ? undefined : str(input.description, 'description', 300, true);
    let tags: string[] | undefined;
    if (input.tags !== undefined) {
      if (!Array.isArray(input.tags) || input.tags.length > LIBRARY_LIMITS.maxTags) fail(`tags muss eine Liste mit höchstens ${LIBRARY_LIMITS.maxTags} Einträgen sein.`);
      tags = (input.tags as unknown[]).map((t, i) => str(t, `tags[${i}]`, 30));
    }
    if (!Array.isArray(input.ids) || input.ids.length < 1) fail('ids muss eine nicht leere Liste von Objekt-ids sein.');
    const rawIds = input.ids as unknown[];
    if (rawIds.length > LIBRARY_LIMITS.maxEntitiesPerItem) fail(`Zu viele Objekte: höchstens ${LIBRARY_LIMITS.maxEntitiesPerItem} pro Baustein.`);
    const ids = expandTargets(ctx, rawIds).map((e) => e.id);
    obj(input, 'Argumente');
    const meta = await api.save({ name, ...(description !== undefined ? { description } : {}), ...(tags ? { tags } : {}), ids });
    return ok(`Baustein gespeichert, id="${meta.id}".`, `Baustein „${name.slice(0, 40)}“ gespeichert`, false);
  },
});
