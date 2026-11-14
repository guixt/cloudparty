import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('REST-Client', () => {
  it('sendet Token und JSON', async () => {
    const fetchMock = vi.fn(async () => json(200, { userId: 'u1', name: 'A' }));
    const api = createApi('http://s', () => 'tok', fetchMock as unknown as typeof fetch);
    await expect(api.rename('A')).resolves.toEqual({ userId: 'u1', name: 'A' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://s/api/me');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBe('{"name":"A"}');
  });
  it('Login sendet keinen Token', async () => {
    const fetchMock = vi.fn(async () => json(200, { token: 't', userId: 'u', name: 'n' }));
    await createApi('http://s', () => 'alt', fetchMock as unknown as typeof fetch).login('n');
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty('Authorization');
  });
  it('kodiert IDs', async () => {
    const fetchMock = vi.fn(async () => json(200, {}));
    await createApi('http://s', () => null, fetchMock as unknown as typeof fetch).getIsland('a/b c');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://s/api/islands/a%2Fb%20c');
  });
  it('bildet Fehler ab', async () => {
    const api = createApi('http://s', () => null, (async () => json(400, { error: 'Kaputt', details: ['a', 'b'] })) as unknown as typeof fetch);
    const error = (await api.createIsland({} as never).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Kaputt');
    expect(error.details).toEqual(['a', 'b']);
  });
  it('nutzt deutsche Standardtexte ohne Fehlerkörper', async () => {
    const api = createApi('http://s', () => null, (async () => new Response('x', { status: 403 })) as unknown as typeof fetch);
    expect(((await api.deleteIsland('a').catch((e) => e)) as ApiError).message).toBe('Dafür fehlt dir die Berechtigung.');
  });
  it('meldet unerreichbaren Server als Status 0', async () => {
    const api = createApi('http://s', () => null, (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);
    const error = (await api.listIslands().catch((e) => e)) as ApiError;
    expect(error.unreachable).toBe(true);
    expect(error.message).toBe('Der Server ist nicht erreichbar.');
  });
});
