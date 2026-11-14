/** Typisierter REST-Client für die Server-API (siehe shared/protocol.ts). */
import type { IslandDetail, IslandSummary, LoginResponse } from '../../../shared/protocol';
import type { WorldSpec } from '../../../shared/types';

export const TOKEN_KEY = 'cloudparty.token';
export const USER_ID_KEY = 'cloudparty.userId';
export const NAME_KEY = 'cloudparty.name';

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Speicher gesperrt */
  }
}

export class ApiError extends Error {
  constructor(
    /** HTTP-Status; 0 = Server nicht erreichbar. */
    readonly status: number,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get unreachable(): boolean {
    return this.status === 0;
  }
}

const FALLBACK: Record<number, string> = {
  400: 'Ungültige Anfrage.',
  401: 'Bitte melde dich zuerst an.',
  403: 'Dafür fehlt dir die Berechtigung.',
  404: 'Nicht gefunden.',
  413: 'Die Anfrage ist zu groß.',
};

export interface Api {
  login(name: string): Promise<LoginResponse>;
  me(): Promise<{ userId: string; name: string }>;
  rename(name: string): Promise<{ userId: string; name: string }>;
  listIslands(): Promise<IslandSummary[]>;
  getIsland(id: string): Promise<IslandDetail>;
  createIsland(world: WorldSpec): Promise<IslandDetail>;
  updateIsland(id: string, patch: { world?: WorldSpec; builders?: string[] }): Promise<IslandDetail>;
  deleteIsland(id: string): Promise<void>;
}

export function createApi(
  baseUrl: string,
  getToken: () => string | null = () => readStorage(TOKEN_KEY),
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Api {
  async function request<T>(method: string, path: string, body?: unknown, tokenOverride?: string | null): Promise<T> {
    const headers: Record<string, string> = {};
    const token = tokenOverride === undefined ? getToken() : tokenOverride;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetchImpl(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'Der Server ist nicht erreichbar.');
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const obj = (data && typeof data === 'object' ? data : {}) as { error?: unknown; details?: unknown };
      const message = typeof obj.error === 'string' ? obj.error : (FALLBACK[res.status] ?? `Serverfehler (${res.status}).`);
      const details = Array.isArray(obj.details) ? obj.details.filter((d): d is string => typeof d === 'string') : [];
      throw new ApiError(res.status, message, details);
    }
    return data as T;
  }
  const island = (id: string) => `/api/islands/${encodeURIComponent(id)}`;
  return {
    login: (name) => request('POST', '/api/login', { name }, null),
    me: () => request('GET', '/api/me'),
    rename: (name) => request('POST', '/api/me', { name }),
    listIslands: () => request('GET', '/api/islands'),
    getIsland: (id) => request('GET', island(id)),
    createIsland: (world) => request('POST', '/api/islands', { world }),
    updateIsland: (id, patch) => request('PUT', island(id), patch),
    deleteIsland: async (id) => {
      await request('DELETE', island(id));
    },
  };
}
