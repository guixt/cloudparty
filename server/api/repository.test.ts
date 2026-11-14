import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultWorld } from '../../shared/defaultWorld';
import { createMemoryRepository, createRepository, type AccountRepository } from './repository';
import { generateIslandId, slugify } from './slug';

const dirs: string[] = [];
const closers: (() => void)[] = [];
afterEach(() => {
  while (closers.length) closers.pop()!();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'cp-repo-'));
  dirs.push(dir);
  return dir;
};

const variants: [string, () => AccountRepository][] = [
  ['sqlite', () => createRepository(tmp())],
  ['memory', () => createMemoryRepository()],
];

describe.each(variants)('Repository (%s)', (_name, make) => {
  const open = () => {
    const repo = make();
    closers.push(() => repo.close?.());
    return repo;
  };

  it('legt die Willkommensinsel an', () => {
    const repo = open();
    const island = repo.getIsland('willkommen');
    expect(island?.owner).toBe('system');
    expect(island?.builders).toEqual(['*']);
    expect(repo.canBuild('willkommen', undefined)).toBe(true);
  });

  it('Konten: Login, Token, Umbenennen', () => {
    const repo = open();
    const a = repo.login('  Anna  ');
    expect(a.name).toBe('Anna');
    expect(repo.resolveToken(a.token)).toEqual({ id: a.userId, name: 'Anna' });
    expect(repo.resolveToken('falsch')).toBeUndefined();
    expect(repo.resolveToken(undefined)).toBeUndefined();
    expect(repo.login('Anna').userId).not.toBe(a.userId);
    repo.renameUser(a.userId, 'Berta');
    expect(repo.resolveToken(a.token)?.name).toBe('Berta');
  });

  it('Inseln: anlegen, Rechte, speichern, löschen', () => {
    const repo = open();
    const owner = repo.login('Olga');
    const other = repo.login('Otto');
    const created = repo.createIsland(createDefaultWorld('Meine Insel', 'meine-insel'), { id: owner.userId, name: owner.name });
    expect(created.id).toBe('meine-insel');
    expect(created.ownerName).toBe('Olga');
    expect(created.world.metadata.owner).toBe(owner.userId);
    expect(repo.canBuild('meine-insel', owner.userId)).toBe(true);
    expect(repo.canBuild('meine-insel', other.userId)).toBe(false);
    expect(repo.canBuild('meine-insel', undefined)).toBe(false);
    repo.setBuilders('meine-insel', [other.userId]);
    expect(repo.canBuild('meine-insel', other.userId)).toBe(true);
    repo.setBuilders('meine-insel', ['*']);
    expect(repo.canBuild('meine-insel', undefined)).toBe(true);

    const world = createDefaultWorld('Umbenannt', 'meine-insel');
    repo.saveWorld('meine-insel', world);
    expect(repo.getIsland('meine-insel')?.name).toBe('Umbenannt');
    expect(repo.listIslands().map((i) => i.id)).toContain('meine-insel');

    // belegte ID -> neue ID
    const second = repo.createIsland(createDefaultWorld('Meine Insel', 'meine-insel'), { id: owner.userId, name: owner.name });
    expect(second.id).not.toBe('meine-insel');
    expect(second.id).toMatch(/^meine-insel-[0-9a-f]+$/);

    repo.deleteIsland('meine-insel');
    expect(repo.getIsland('meine-insel')).toBeUndefined();
    expect(repo.canBuild('meine-insel', owner.userId)).toBe(false);
  });

  it('ensureIsland legt offene Sandbox an', () => {
    const repo = open();
    const island = repo.ensureIsland('irgendwo');
    expect(island.owner).toBe('system');
    expect(repo.ensureIsland('irgendwo').updatedAt).toBe(island.updatedAt);
    expect(repo.canBuild('irgendwo', undefined)).toBe(true);
  });
});

describe('SQLite-Persistenz', () => {
  it('überlebt erneutes Öffnen', () => {
    const dir = tmp();
    const first = createRepository(dir);
    const user = first.login('Paula');
    first.createIsland(createDefaultWorld('Bleibt', 'bleibt'), { id: user.userId, name: user.name });
    first.close?.();
    const second = createRepository(dir);
    closers.push(() => second.close?.());
    expect(second.getIsland('bleibt')?.ownerName).toBe('Paula');
    expect(second.resolveToken(user.token)?.id).toBe(user.userId);
    expect(second.listIslands().filter((i) => i.id === 'willkommen')).toHaveLength(1);
  });
});

describe('Slugs', () => {
  it('löst Umlaute auf und liefert lesbare IDs', () => {
    expect(slugify('Größe Überraschung!')).toBe('groesse-ueberraschung');
    expect(slugify('***')).toBe('insel');
    expect(generateIslandId('Meine Insel')).toMatch(/^meine-insel-[0-9a-f]{6}$/);
  });
});
