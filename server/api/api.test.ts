import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultWorld } from '../../shared/defaultWorld';
import type { IslandDetail, IslandSummary, LoginResponse } from '../../shared/protocol';
import { startServer, type RunningServer } from '../index';

let server: RunningServer;
let dir: string;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cp-api-'));
  server = await startServer({ port: 0, dataDir: dir });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call<T = any>(method: string, path: string, opts: { token?: string; body?: unknown; raw?: string } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), 'Content-Type': 'application/json' },
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  return { status: res.status, data: (await res.json()) as T };
}
const login = async (name: string) => (await call<LoginResponse>('POST', '/api/login', { body: { name } })).data;

describe('REST-API', () => {
  it('Konten', async () => {
    const me = await login('Anna');
    expect(me.token).toBeTruthy();
    expect((await call('GET', '/api/me', { token: me.token })).data).toEqual({ userId: me.userId, name: 'Anna' });
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect((await call('GET', '/api/me', { token: 'x' })).status).toBe(401);
    expect((await call('POST', '/api/me', { token: me.token, body: { name: 'Berta' } })).data).toEqual({ userId: me.userId, name: 'Berta' });
    expect((await call('POST', '/api/login', { body: { name: '   ' } })).status).toBe(400);
    expect((await call('POST', '/api/login', { body: { name: 'x'.repeat(33) } })).status).toBe(400);
    expect((await call('POST', '/api/login', { raw: '{kaputt' })).status).toBe(400);
  });

  it('Inseln: kompletter Ablauf', async () => {
    const owner = await login('Olga');
    const other = await login('Otto');
    const builder = await login('Bert');

    const world = createDefaultWorld('Testinsel', 'testinsel');
    expect((await call('POST', '/api/islands', { body: { world } })).status).toBe(401);
    const created = await call<IslandDetail>('POST', '/api/islands', { token: owner.token, body: { world } });
    expect(created.status).toBe(200);
    expect(created.data.id).toBe('testinsel');
    expect(created.data.owner).toBe(owner.userId);

    const list = (await call<IslandSummary[]>('GET', '/api/islands')).data;
    expect(list.map((i) => i.id)).toContain('testinsel');
    expect(list[0]).not.toHaveProperty('world');

    const got = await call<IslandDetail>('GET', '/api/islands/testinsel');
    expect(got.data.world.metadata.name).toBe('Testinsel');
    expect((await call('GET', '/api/islands/gibtsnicht')).status).toBe(404);

    const renamed = createDefaultWorld('Neu benannt', 'testinsel');
    expect((await call('PUT', '/api/islands/testinsel', { token: owner.token, body: { world: renamed } })).data).toMatchObject({ name: 'Neu benannt' });
    expect((await call('PUT', '/api/islands/testinsel', { token: other.token, body: { world: renamed } })).status).toBe(403);
    expect((await call('PUT', '/api/islands/testinsel', { body: { world: renamed } })).status).toBe(401);

    expect((await call('PUT', '/api/islands/testinsel', { token: owner.token, body: { builders: [builder.userId] } })).data.builders).toEqual([builder.userId]);
    expect((await call('PUT', '/api/islands/testinsel', { token: builder.token, body: { world: createDefaultWorld('Vom Mitbauer', 'x') } })).status).toBe(200);
    expect((await call('GET', '/api/islands/testinsel')).data.world.metadata.owner).toBe(owner.userId);
    expect((await call('PUT', '/api/islands/testinsel', { token: builder.token, body: { builders: ['*'] } })).status).toBe(403);
    expect((await call('PUT', '/api/islands/testinsel', { token: owner.token, body: { builders: 'alle' } })).status).toBe(400);

    expect((await call('DELETE', '/api/islands/testinsel', { token: builder.token })).status).toBe(403);
    expect((await call('DELETE', '/api/islands/testinsel', { token: owner.token })).data).toEqual({ ok: true });
    expect((await call('GET', '/api/islands/testinsel')).status).toBe(404);
  });

  it('Validierung und IDs', async () => {
    const user = await login('Vera');
    const bad = await call<{ error: string; details?: string[] }>('POST', '/api/islands', { token: user.token, body: { world: { foo: 1 } } });
    expect(bad.status).toBe(400);
    expect(bad.data.details?.length).toBeGreaterThan(0);
    expect((await call('POST', '/api/islands', { token: user.token, body: {} })).status).toBe(400);
    expect((await call('POST', '/api/islands', { token: user.token, raw: 'nope' })).status).toBe(400);

    const world = createDefaultWorld('Schöne Insel', 'böse id!');
    const created = (await call<IslandDetail>('POST', '/api/islands', { token: user.token, body: { world } })).data;
    expect(created.id).toMatch(/^schoene-insel-[0-9a-f]{6}$/);
    expect((await call('POST', '/api/islands', { token: user.token, body: { world: createDefaultWorld('A', 'willkommen') } })).data.id).not.toBe('willkommen');
  });

  it('zu große Anfrage ergibt 413', async () => {
    const user = await login('Gross');
    const res = await call('POST', '/api/islands', { token: user.token, raw: JSON.stringify({ pad: 'x'.repeat(5_100_000) }) });
    expect(res.status).toBe(413);
  });
});
