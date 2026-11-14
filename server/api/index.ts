/**
 * REST-API: Konten und Inseln (siehe shared/protocol.ts).
 */
import type { IncomingMessage } from 'node:http';
import type { IslandDetail } from '../../shared/protocol';
import type { WorldSpec } from '../../shared/types';
import { validateWorldSpec } from '../../shared/worldspec/index';
import { readJson, sendJson, type ServerContext, type User } from '../context';
import type { AccountRepository } from './repository';

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

const MAX_BODY = 5_000_000;

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const value = await readJson<unknown>(req, MAX_BODY);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Die Anfrage muss ein JSON-Objekt sein.');
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).message === 'Anfrage zu groß') throw new ApiError(413, 'Die Anfrage ist zu groß.');
    throw new ApiError(400, 'Die Anfrage enthält kein gültiges JSON.');
  }
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'Bitte gib einen Namen an.');
  const name = value.trim();
  if (name.length < 1 || name.length > 32) throw new ApiError(400, 'Der Name muss 1 bis 32 Zeichen lang sein.');
  return name;
}

function validWorld(value: unknown): WorldSpec {
  const result = validateWorldSpec(value);
  if (!result.ok) throw new ApiError(400, 'Die Welt ist ungültig.', result.errors);
  return result.world;
}

export function registerApi(ctx: ServerContext): void {
  const repo = ctx.repo as AccountRepository;

  const auth = (req: IncomingMessage): User | undefined => {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return repo.resolveToken(match?.[1]?.trim());
  };
  const requireUser = (req: IncomingMessage): User => {
    const user = auth(req);
    if (!user) throw new ApiError(401, 'Bitte melde dich zuerst an.');
    return user;
  };
  const withOnline = (island: IslandDetail): IslandDetail => ({ ...island, online: ctx.presence.count(island.id) });
  const getOr404 = (id: string): IslandDetail => {
    const island = repo.getIsland(id);
    if (!island) throw new ApiError(404, 'Insel nicht gefunden.');
    return island;
  };

  async function handle(req: IncomingMessage, url: URL): Promise<{ status: number; data: unknown } | undefined> {
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/api/login' && method === 'POST') {
      const data = await body(req);
      return { status: 200, data: repo.login(parseName(data.name)) };
    }
    if (path === '/api/me') {
      if (method === 'GET') {
        const user = requireUser(req);
        return { status: 200, data: { userId: user.id, name: user.name } };
      }
      if (method === 'POST') {
        const user = requireUser(req);
        const name = parseName((await body(req)).name);
        const updated = repo.renameUser?.(user.id, name) ?? { id: user.id, name };
        return { status: 200, data: { userId: updated.id, name: updated.name } };
      }
    }
    if (path === '/api/islands') {
      if (method === 'GET') {
        const list = repo
          .listIslands()
          .map((island) => ({ ...island, online: ctx.presence.count(island.id) }))
          .sort((a, b) => b.online - a.online || b.updatedAt - a.updatedAt);
        return { status: 200, data: list };
      }
      if (method === 'POST') {
        const user = requireUser(req);
        const data = await body(req);
        const world = validWorld(data.world);
        return { status: 200, data: withOnline(repo.createIsland(world, user)) };
      }
    }
    const match = /^\/api\/islands\/([^/]+)$/.exec(path);
    if (match) {
      let id: string;
      try {
        id = decodeURIComponent(match[1]);
      } catch {
        throw new ApiError(400, 'Ungültige Insel-ID.');
      }
      if (method === 'GET') return { status: 200, data: withOnline(getOr404(id)) };
      if (method === 'PUT') {
        const user = requireUser(req);
        const island = getOr404(id);
        const isOwner = island.owner === user.id;
        if (!isOwner && !repo.canBuild(id, user.id)) throw new ApiError(403, 'Dafür fehlt dir die Berechtigung.');
        const data = await body(req);
        if (data.builders !== undefined && !isOwner) throw new ApiError(403, 'Nur der Besitzer darf Baurechte ändern.');
        let builders: string[] | undefined;
        if (data.builders !== undefined) {
          if (!Array.isArray(data.builders) || !data.builders.every((b) => typeof b === 'string' && b.length > 0 && b.length <= 64))
            throw new ApiError(400, 'Die Bauberechtigten müssen eine Liste von Benutzer-IDs sein.');
          builders = data.builders as string[];
        }
        const world = data.world !== undefined ? validWorld(data.world) : undefined;
        if (world) {
          world.metadata = { ...world.metadata, id, owner: island.owner };
          repo.saveWorld(id, world);
        }
        if (builders) repo.setBuilders(id, builders);
        return { status: 200, data: withOnline(getOr404(id)) };
      }
      if (method === 'DELETE') {
        const user = requireUser(req);
        const island = getOr404(id);
        if (island.owner !== user.id) throw new ApiError(403, 'Nur der Besitzer darf die Insel löschen.');
        repo.deleteIsland(id);
        return { status: 200, data: { ok: true } };
      }
    }
    return undefined;
  }

  ctx.addHttpHandler(async (req, res, url) => {
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      const result = await handle(req, url);
      if (!result) return false;
      sendJson(res, result.status, result.data);
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(res, error.status, error.details ? { error: error.message, details: error.details } : { error: error.message });
      } else {
        console.error('[api]', error);
        sendJson(res, 500, { error: 'Interner Fehler.' });
      }
    }
    return true;
  });
}
