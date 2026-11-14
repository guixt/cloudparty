/**
 * STUB des Fundaments – Paket 11 ersetzt diese Datei (vollständige REST-API laut shared/protocol.ts).
 * Vorerst: Login und Insel-Liste/-Abruf.
 */
import type { IslandSummary } from '../../shared/protocol';
import { readJson, sendJson, type ServerContext } from '../context';

export function registerApi(ctx: ServerContext): void {
  ctx.addHttpHandler(async (req, res, url) => {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const body = await readJson<{ name?: string }>(req);
      sendJson(res, 200, ctx.repo.login(body.name ?? 'Gast'));
      return true;
    }
    if (url.pathname === '/api/islands' && req.method === 'GET') {
      const list: IslandSummary[] = ctx.repo.listIslands().map((island) => ({ ...island, online: ctx.presence.count(island.id) }));
      sendJson(res, 200, list);
      return true;
    }
    const match = /^\/api\/islands\/([^/]+)$/.exec(url.pathname);
    if (match && req.method === 'GET') {
      const island = ctx.repo.getIsland(decodeURIComponent(match[1]));
      if (island) sendJson(res, 200, { ...island, online: ctx.presence.count(island.id) });
      else sendJson(res, 404, { error: 'Insel nicht gefunden' });
      return true;
    }
    return false;
  });
}
