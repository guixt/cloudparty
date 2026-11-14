/**
 * STUB des Fundaments – Paket 11 ersetzt die Umsetzung durch SQLite (node:sqlite)
 * im Verzeichnis dataDir. Die Signatur von createRepository bleibt.
 * Vorerst: alles im Arbeitsspeicher.
 */
import { randomUUID } from 'node:crypto';
import { createDefaultWorld } from '../../shared/defaultWorld';
import type { IslandDetail } from '../../shared/protocol';
import type { IslandRepository, User } from '../context';

export function createRepository(_dataDir: string): IslandRepository {
  const tokens = new Map<string, User>();
  const islands = new Map<string, IslandDetail>();
  const summary = ({ world: _world, builders: _builders, ...rest }: IslandDetail) => rest;

  const repo: IslandRepository = {
    login(name) {
      const user: User = { id: `u_${randomUUID().slice(0, 8)}`, name: name.trim().slice(0, 32) || 'Gast' };
      const token = randomUUID();
      tokens.set(token, user);
      return { token, userId: user.id, name: user.name };
    },
    resolveToken: (token) => (token ? tokens.get(token) : undefined),
    listIslands: () => [...islands.values()].map(summary),
    getIsland: (id) => islands.get(id),
    createIsland(world, owner) {
      const id = world.metadata.id && !islands.has(world.metadata.id) ? world.metadata.id : `insel-${randomUUID().slice(0, 8)}`;
      const detail: IslandDetail = {
        id,
        name: world.metadata.name,
        owner: owner.id,
        ownerName: owner.name,
        updatedAt: Date.now(),
        online: 0,
        world: { ...world, metadata: { ...world.metadata, id, owner: owner.id } },
        builders: [],
      };
      islands.set(id, detail);
      return detail;
    },
    ensureIsland(id) {
      const existing = islands.get(id);
      if (existing) return existing;
      const detail: IslandDetail = {
        id,
        name: id,
        owner: 'system',
        ownerName: 'Cloudparty',
        updatedAt: Date.now(),
        online: 0,
        world: createDefaultWorld(id === 'willkommen' ? 'Willkommensinsel' : id, id),
        builders: ['*'],
      };
      islands.set(id, detail);
      return detail;
    },
    saveWorld(id, world) {
      const island = islands.get(id);
      if (!island) return;
      island.world = world;
      island.name = world.metadata.name;
      island.updatedAt = Date.now();
    },
    setBuilders(id, builders) {
      const island = islands.get(id);
      if (island) island.builders = builders;
    },
    deleteIsland: (id) => void islands.delete(id),
    canBuild(id, userId) {
      const island = islands.get(id);
      if (!island) return false;
      if (island.builders.includes('*')) return true;
      return !!userId && (island.owner === userId || island.builders.includes(userId));
    },
  };
  return repo;
}
