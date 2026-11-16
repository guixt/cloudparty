/** Umsetzung von `LibraryApi`: Speicher, Speichern, Platzieren, Export/Import. */
import { LIBRARY_LIMITS, type LibraryFile, type LibraryItem, type LibraryItemMeta } from '../../shared/library';
import { newEntityId, type EntitySpec, type Vec3 } from '../../shared/types';
import type { GameContext } from '../core/context';
import { surfaceAtScreenCenter } from '../build/placement';
import type { LibraryApi, PlaceOptions, SaveOptions } from './api';
import { builtinItems } from './builtin';
import { cleanTags, expandGroups, filterItems, instantiateItem, normalizeForItem, parseLibraryFile, safeFileName, toMeta, validateName } from './logic';
import { openStorage, type ItemStorage } from './store';
import { placeholderThumbnail, renderThumbnail } from './thumbnail';

export interface LibraryService extends LibraryApi {
  dispose(): void;
}

export interface ServiceOptions {
  storage?: ItemStorage;
  /** Standard-Platzierung (Bodenpunkt vor der Kamera). */
  defaultSpot?: (ctx: GameContext) => Vec3;
  /** Löst den Download aus (Tests ersetzen das). */
  download?: (fileName: string, text: string) => void;
  thumbnail?: (entities: EntitySpec[], name: string) => string | undefined;
}

function browserDownload(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export function createLibrary(ctx: GameContext, options: ServiceOptions = {}): LibraryService {
  const listeners = new Set<() => void>();
  let storage: ItemStorage | null = options.storage ?? null;
  let user: LibraryItem[] | null = null;
  const builtinThumbs = new Map<string, string | undefined>();
  const makeThumb = options.thumbnail ?? ((entities: EntitySpec[], name: string) => renderThumbnail(entities) ?? placeholderThumbnail(name));
  let channel: BroadcastChannel | null = null;
  try {
    channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cloudparty-library') : null;
  } catch {
    channel = null;
  }

  const notify = () => {
    for (const l of [...listeners]) l();
  };
  const loadUser = async (force = false): Promise<LibraryItem[]> => {
    if (user && !force) return user;
    storage ??= await openStorage();
    const all = await storage.readAll();
    user = all.filter((i) => i && typeof i.id === 'string' && Array.isArray(i.entities)).sort((a, b) => b.createdAt - a.createdAt);
    return user;
  };
  if (channel) {
    channel.onmessage = () => {
      void loadUser(true).then(notify, () => undefined);
    };
  }
  const changed = () => {
    notify();
    try {
      channel?.postMessage('changed');
    } catch {
      /* ignorieren */
    }
  };
  const builtins = (): LibraryItem[] =>
    builtinItems().map((item) => {
      if (!builtinThumbs.has(item.id)) builtinThumbs.set(item.id, makeThumb(item.entities, item.name));
      return { ...item, thumbnail: builtinThumbs.get(item.id) };
    });
  const everything = async (): Promise<LibraryItem[]> => [...builtins(), ...(await loadUser())];
  const find = async (id: string) => (await everything()).find((i) => i.id === id);
  const mustBeUser = async (id: string): Promise<LibraryItem> => {
    const item = (await loadUser()).find((i) => i.id === id);
    if (!item) {
      if (builtinItems().some((b) => b.id === id)) throw new Error('Mitgelieferte Bausteine können nicht geändert oder gelöscht werden.');
      throw new Error('Der Baustein wurde nicht gefunden.');
    }
    return item;
  };

  return {
    async list(query) {
      return filterItems((await everything()).map(toMeta), query);
    },
    async get(id) {
      return find(id);
    },
    async save(opts: SaveOptions) {
      const name = validateName(opts.name);
      const state = ctx.store.getState();
      const requested = opts.ids ?? state.selectedIds;
      const ids = expandGroups(requested, state.entities);
      if (ids.length === 0) throw new Error('Es ist nichts ausgewählt, das als Baustein gespeichert werden könnte.');
      if (ids.length > LIBRARY_LIMITS.maxEntitiesPerItem) throw new Error(`Ein Baustein darf höchstens ${LIBRARY_LIMITS.maxEntitiesPerItem} Objekte enthalten (ausgewählt: ${ids.length}).`);
      const items = await loadUser();
      if (items.length >= LIBRARY_LIMITS.maxItems) throw new Error(`Die Bibliothek ist voll (höchstens ${LIBRARY_LIMITS.maxItems} eigene Bausteine). Bitte erst Bausteine löschen.`);
      const entities = normalizeForItem(ids.map((id) => state.entities[id]));
      const now = Date.now();
      const item: LibraryItem = {
        id: newEntityId('lib'),
        name,
        description: (opts.description ?? '').trim().slice(0, 1000),
        tags: cleanTags(opts.tags ?? []),
        createdAt: now,
        updatedAt: now,
        thumbnail: makeThumb(entities, name),
        count: entities.length,
        entities,
      };
      storage ??= await openStorage();
      await storage.put(item);
      items.unshift(item);
      changed();
      return toMeta(item);
    },
    async place(id, opts: PlaceOptions = {}) {
      const state = ctx.store.getState();
      if (!state.canBuild) throw new Error('Hier darfst du nichts bauen – Bausteine können nur platziert werden, wenn du bauen darfst.');
      const item = await find(id);
      if (!item) throw new Error('Der Baustein wurde nicht gefunden.');
      const at = opts.at ?? (options.defaultSpot ?? surfaceAtScreenCenter)(ctx);
      const created = instantiateItem(item.entities, at, opts.yawDegrees ?? 0, (opts.groupName ?? item.name).trim() || item.name);
      ctx.bus.emit('history.group.begin', {});
      try {
        for (const entity of created) state.addEntity(entity, { source: 'local' });
      } finally {
        ctx.bus.emit('history.group.end', {});
      }
      const ids = created.map((e) => e.id);
      ctx.store.getState().selectMany(ids);
      return ids;
    },
    async update(id, patch) {
      const item = await mustBeUser(id);
      if (patch.name !== undefined) item.name = validateName(patch.name);
      if (patch.description !== undefined) item.description = patch.description.trim().slice(0, 1000);
      if (patch.tags !== undefined) item.tags = cleanTags(patch.tags);
      item.updatedAt = Date.now();
      await (storage ??= await openStorage()).put(item);
      changed();
    },
    async remove(id) {
      const item = await mustBeUser(id);
      await (storage ??= await openStorage()).remove(id);
      user = (await loadUser()).filter((i) => i !== item);
      changed();
    },
    async exportItems(ids) {
      const all = await everything();
      const items = ids.map((id) => all.find((i) => i.id === id)).filter((i): i is LibraryItem => !!i).map((i) => ({ ...i, builtin: undefined }));
      if (items.length === 0) throw new Error('Es wurde kein Baustein zum Exportieren gefunden.');
      const file: LibraryFile = { format: 'cloudparty-library', version: 1, items: JSON.parse(JSON.stringify(items)) as LibraryItem[] };
      (options.download ?? browserDownload)(safeFileName(items.length === 1 ? items[0].name : 'Bausteine'), JSON.stringify(file, null, 2));
    },
    async importFile(file) {
      if (file.size > MAX_IMPORT_BYTES) throw new Error(`Die Datei ist zu groß (höchstens ${MAX_IMPORT_BYTES / 1024 / 1024} MB erlaubt).`);
      let text: string;
      try {
        text = await file.text();
      } catch {
        throw new Error('Die Datei konnte nicht gelesen werden.');
      }
      const incoming = parseLibraryFile(text);
      const items = await loadUser();
      if (items.length + incoming.length > LIBRARY_LIMITS.maxItems) throw new Error(`Die Bibliothek wäre zu voll (höchstens ${LIBRARY_LIMITS.maxItems} eigene Bausteine).`);
      const taken = new Set([...items.map((i) => i.id), ...builtinItems().map((i) => i.id)]);
      const added: LibraryItem[] = [];
      storage ??= await openStorage();
      for (const item of incoming) {
        const fresh: LibraryItem = { ...item, id: taken.has(item.id) ? newEntityId('lib') : item.id, createdAt: Date.now(), updatedAt: Date.now() };
        taken.add(fresh.id);
        fresh.thumbnail ??= makeThumb(fresh.entities, fresh.name);
        await storage.put(fresh);
        items.unshift(fresh);
        added.push(fresh);
      }
      changed();
      return added.map(toMeta);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      channel?.close();
      listeners.clear();
    },
  };
}
export type { LibraryItemMeta };
