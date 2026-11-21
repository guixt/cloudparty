/**
 * Konten und Inseln. Speicher: SQLite (node:sqlite) in <dataDir>/cloudparty.sqlite;
 * fehlt node:sqlite, fällt createRepository auf den Arbeitsspeicher zurück.
 * Die Logik (Rechte, IDs, Zusammenfassungen) liegt einmal in makeRepository,
 * die beiden Backends sind nur dünne Speicherschichten.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDefaultWorld } from '../../shared/defaultWorld';
import type { IslandDetail, IslandSummary } from '../../shared/protocol';
import type { WorldSpec } from '../../shared/types';
import type { IslandRepository, User } from '../context';
import { generateIslandId, ISLAND_ID_PATTERN } from './slug';

/** Erweiterung des Interfaces um Umbenennen (für POST /api/me). */
export interface AccountRepository extends IslandRepository {
  renameUser(id: string, name: string): User | undefined;
}

interface UserRow {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: number;
}
interface IslandRow {
  id: string;
  name: string;
  owner: string;
  worldJson: string;
  buildersJson: string;
  updatedAt: number;
}

interface Backend {
  insertUser(user: UserRow): void;
  userByTokenHash(hash: string): UserRow | undefined;
  userById(id: string): UserRow | undefined;
  renameUser(id: string, name: string): void;
  islandRows(): IslandRow[];
  islandRow(id: string): IslandRow | undefined;
  insertIsland(row: IslandRow): void;
  updateIsland(id: string, patch: Partial<Pick<IslandRow, 'name' | 'worldJson' | 'buildersJson' | 'updatedAt'>>): void;
  deleteIsland(id: string): void;
  close(): void;
}

const SYSTEM_OWNER = 'system';
const SYSTEM_NAME = 'Cloudparty';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function normalizeName(name: string): string {
  const trimmed = (name ?? '').trim().slice(0, 32);
  return trimmed || 'Gast';
}

function makeRepository(backend: Backend): AccountRepository {
  const ownerName = (owner: string) => (owner === SYSTEM_OWNER ? SYSTEM_NAME : (backend.userById(owner)?.name ?? 'Unbekannt'));
  const parseBuilders = (json: string): string[] => {
    try {
      const value = JSON.parse(json);
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  };
  const summary = (row: IslandRow): IslandSummary => ({
    id: row.id,
    name: row.name,
    owner: row.owner,
    ownerName: ownerName(row.owner),
    updatedAt: row.updatedAt,
    online: 0,
  });
  const detail = (row: IslandRow): IslandDetail => ({
    ...summary(row),
    world: JSON.parse(row.worldJson) as WorldSpec,
    builders: parseBuilders(row.buildersJson),
  });

  const repo: AccountRepository = {
    login(name) {
      const user = { id: `u_${randomUUID().replace(/-/g, '').slice(0, 10)}`, name: normalizeName(name) };
      const token = randomBytes(24).toString('hex');
      backend.insertUser({ ...user, tokenHash: hashToken(token), createdAt: Date.now() });
      return { token, userId: user.id, name: user.name };
    },
    resolveToken(token) {
      if (!token) return undefined;
      const row = backend.userByTokenHash(hashToken(token));
      return row ? { id: row.id, name: row.name } : undefined;
    },
    renameUser(id, name) {
      const row = backend.userById(id);
      if (!row) return undefined;
      const next = normalizeName(name);
      backend.renameUser(id, next);
      return { id, name: next };
    },
    listIslands: () => backend.islandRows().map(summary),
    getIsland(id) {
      const row = backend.islandRow(id);
      return row ? detail(row) : undefined;
    },
    createIsland(world, owner) {
      const wanted = world.metadata?.id;
      let id = wanted && ISLAND_ID_PATTERN.test(wanted) && !backend.islandRow(wanted) ? wanted : '';
      while (!id) {
        const candidate = generateIslandId(world.metadata?.name ?? 'insel');
        if (!backend.islandRow(candidate)) id = candidate;
      }
      const stored: WorldSpec = { ...world, metadata: { ...world.metadata, id, owner: owner.id } };
      backend.insertIsland({
        id,
        name: stored.metadata.name,
        owner: owner.id,
        worldJson: JSON.stringify(stored),
        buildersJson: '[]',
        updatedAt: Date.now(),
      });
      return repo.getIsland(id)!;
    },
    ensureIsland(id) {
      const existing = repo.getIsland(id);
      if (existing) return existing;
      const world = createDefaultWorld(id === 'willkommen' ? 'Willkommensinsel' : id, id);
      world.metadata.owner = SYSTEM_OWNER;
      backend.insertIsland({
        id,
        name: world.metadata.name,
        owner: SYSTEM_OWNER,
        worldJson: JSON.stringify(world),
        buildersJson: JSON.stringify(['*']),
        updatedAt: Date.now(),
      });
      return repo.getIsland(id)!;
    },
    saveWorld(id, world) {
      if (!backend.islandRow(id)) return;
      backend.updateIsland(id, { name: world.metadata.name, worldJson: JSON.stringify(world), updatedAt: Date.now() });
    },
    setBuilders(id, builders) {
      if (!backend.islandRow(id)) return;
      backend.updateIsland(id, { buildersJson: JSON.stringify([...new Set(builders)]) });
    },
    deleteIsland: (id) => backend.deleteIsland(id),
    canBuild(id, userId) {
      const row = backend.islandRow(id);
      if (!row) return false;
      const builders = parseBuilders(row.buildersJson);
      if (builders.includes('*')) return true;
      return !!userId && (row.owner === userId || builders.includes(userId));
    },
    close: () => backend.close(),
  };
  if (backend.islandRows().length === 0) repo.ensureIsland('willkommen');
  return repo;
}

function createMemoryBackend(): Backend {
  const users = new Map<string, UserRow>();
  const islands = new Map<string, IslandRow>();
  return {
    insertUser: (user) => void users.set(user.id, user),
    userByTokenHash: (hash) => [...users.values()].find((u) => u.tokenHash === hash),
    userById: (id) => users.get(id),
    renameUser(id, name) {
      const user = users.get(id);
      if (user) user.name = name;
    },
    islandRows: () => [...islands.values()],
    islandRow: (id) => islands.get(id),
    insertIsland: (row) => void islands.set(row.id, { ...row }),
    updateIsland(id, patch) {
      const row = islands.get(id);
      if (row) Object.assign(row, patch);
    },
    deleteIsland: (id) => void islands.delete(id),
    close() {},
  };
}

/** Minimale Sicht auf node:sqlite, damit wir ohne Typen von @types/node auskommen. */
interface SqliteModule {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
    close(): void;
  };
}

function loadSqlite(): SqliteModule | undefined {
  try {
    const getter = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    return getter ? (getter.call(process, 'node:sqlite') as SqliteModule | undefined) : undefined;
  } catch {
    return undefined;
  }
}

function createSqliteBackend(sqlite: SqliteModule, dataDir: string): Backend {
  mkdirSync(dataDir, { recursive: true });
  const db = new sqlite.DatabaseSync(join(dataDir, 'cloudparty.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS islands (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, world_json TEXT NOT NULL,
    builders_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL);`);
  const userRow = (r: unknown): UserRow | undefined => {
    const row = r as { id: string; name: string; token_hash: string; created_at: number } | undefined;
    return row ? { id: row.id, name: row.name, tokenHash: row.token_hash, createdAt: row.created_at } : undefined;
  };
  const islandRow = (r: unknown): IslandRow | undefined => {
    const row = r as { id: string; name: string; owner: string; world_json: string; builders_json: string; updated_at: number } | undefined;
    return row
      ? { id: row.id, name: row.name, owner: row.owner, worldJson: row.world_json, buildersJson: row.builders_json, updatedAt: row.updated_at }
      : undefined;
  };
  const q = {
    insertUser: db.prepare('INSERT INTO users (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)'),
    byHash: db.prepare('SELECT * FROM users WHERE token_hash = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    rename: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
    all: db.prepare('SELECT * FROM islands'),
    one: db.prepare('SELECT * FROM islands WHERE id = ?'),
    insertIsland: db.prepare('INSERT INTO islands (id, name, owner, world_json, builders_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    update: db.prepare(
      'UPDATE islands SET name = COALESCE(?, name), world_json = COALESCE(?, world_json), builders_json = COALESCE(?, builders_json), updated_at = COALESCE(?, updated_at) WHERE id = ?',
    ),
    remove: db.prepare('DELETE FROM islands WHERE id = ?'),
  };
  return {
    insertUser: (u) => void q.insertUser.run(u.id, u.name, u.tokenHash, u.createdAt),
    userByTokenHash: (hash) => userRow(q.byHash.get(hash)),
    userById: (id) => userRow(q.byId.get(id)),
    renameUser: (id, name) => void q.rename.run(name, id),
    islandRows: () => q.all.all().map((r) => islandRow(r)!),
    islandRow: (id) => islandRow(q.one.get(id)),
    insertIsland: (r) => void q.insertIsland.run(r.id, r.name, r.owner, r.worldJson, r.buildersJson, r.updatedAt),
    updateIsland: (id, p) => void q.update.run(p.name ?? null, p.worldJson ?? null, p.buildersJson ?? null, p.updatedAt ?? null, id),
    deleteIsland: (id) => void q.remove.run(id),
    close: () => db.close(),
  };
}

/** Repository im Arbeitsspeicher (Tests, Rückfall ohne node:sqlite). */
export function createMemoryRepository(): AccountRepository {
  return makeRepository(createMemoryBackend());
}

/** SQLite-Repository; bei fehlendem node:sqlite Rückfall auf den Arbeitsspeicher. */
export function createRepository(dataDir: string): AccountRepository {
  const sqlite = loadSqlite();
  if (!sqlite) {
    console.warn('[cloudparty] node:sqlite nicht verfügbar – Inseln werden nur im Arbeitsspeicher gehalten.');
    return createMemoryRepository();
  }
  return makeRepository(createSqliteBackend(sqlite, dataDir));
}
