import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { DEFAULT_APPEARANCE } from '../../shared/avatar';
import { AVATAR_SEND_RATE, MAX_AVATARS_PER_ISLAND, type ClientMessage, type ServerMessage } from '../../shared/protocol';
import type { EntitySpec } from '../../shared/types';
import { startServer, type RunningServer } from '../index';

class TestClient {
  msgs: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  closed = false;
  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => {
      this.msgs.push(JSON.parse(raw.toString()));
      this.waiters.splice(0).forEach((w) => w());
    });
    ws.on('close', () => {
      this.closed = true;
      this.waiters.splice(0).forEach((w) => w());
    });
    ws.on('error', () => undefined);
  }
  send(msg: ClientMessage | Record<string, unknown>) {
    this.ws.send(JSON.stringify(msg));
  }
  async waitFor<T extends ServerMessage['type']>(type: T, timeout = 3000, pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = this.msgs.find((m) => m.type === type && pred(m as Extract<ServerMessage, { type: T }>));
      if (found) return found as Extract<ServerMessage, { type: T }>;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`Timeout: ${type}; erhalten: ${this.msgs.map((m) => m.type).join(',')}`);
      await new Promise<void>((res) => {
        const t = setTimeout(res, left);
        this.waiters.push(() => {
          clearTimeout(t);
          res();
        });
      });
    }
  }
  of<T extends ServerMessage['type']>(type: T) {
    return this.msgs.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }
  async waitClosed(timeout = 3000) {
    const deadline = Date.now() + timeout;
    while (!this.closed && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    expect(this.closed).toBe(true);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ent = (id: string, x = 0): EntitySpec => ({ id, ref: 'EntitySpec.box', transform: { pos: [x, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
const walk = (x: number) => ({ position: [x, 0, 0] as [number, number, number], yaw: 0, motion: 'walk' as const, emotes: {} });

let server: RunningServer;
let dir: string;
let clients: TestClient[] = [];

async function connect(): Promise<TestClient> {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
  const c = new TestClient(ws);
  clients.push(c);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  return c;
}
async function joined(island: string, name = 'Gast', token?: string): Promise<TestClient> {
  const c = await connect();
  c.send({ type: 'join', island, name, token, appearance: DEFAULT_APPEARANCE });
  await c.waitFor('welcome');
  return c;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cp-rt-'));
  server = await startServer({ port: 0, dataDir: dir });
});
afterEach(async () => {
  for (const c of clients) c.ws.terminate();
  clients = [];
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Beitritt', () => {
  it('welcome, avatar.joined und avatar.left', async () => {
    const a = await joined('sandbox1', '  Anna   Lena ');
    const w = a.of('welcome')[0];
    expect(w.selfId).toMatch(/^gast_\d+$/);
    expect(w.canBuild).toBe(true);
    expect(w.avatars).toEqual([]);
    expect(server.ctx.presence.count('sandbox1')).toBe(1);

    const b = await joined('sandbox1', 'Ben');
    expect(b.of('welcome')[0].avatars.map((x) => x.name)).toEqual(['Anna Lena']);
    const joinedMsg = await a.waitFor('avatar.joined');
    expect(joinedMsg.avatar.name).toBe('Ben');
    expect(server.ctx.presence.count('sandbox1')).toBe(2);

    b.ws.close();
    const left = await a.waitFor('avatar.left');
    expect(left.id).toBe(b.of('welcome')[0].selfId);
    await sleep(50);
    expect(server.ctx.presence.count('sandbox1')).toBe(1);
  });

  it('Inseln sind getrennt', async () => {
    const a = await joined('insel-a');
    await joined('insel-b');
    await sleep(100);
    expect(a.of('avatar.joined')).toHaveLength(0);
  });

  it('ungültige Insel-ID und falsche erste Nachricht', async () => {
    const a = await connect();
    a.send({ type: 'join', island: 'bad id!', name: 'x', appearance: DEFAULT_APPEARANCE });
    expect((await a.waitFor('error')).code).toBe('bad-request');
    await a.waitClosed();
    const b = await connect();
    b.send({ type: 'chat', text: 'hi' });
    expect((await b.waitFor('error')).code).toBe('bad-request');
    await b.waitClosed();
  });

  it('gleicher Nutzer in zwei Tabs bekommt unterschiedliche IDs', async () => {
    const login = server.ctx.repo.login('Nora');
    const a = await joined('sandbox2', 'x', login.token);
    const b = await joined('sandbox2', 'x', login.token);
    expect(a.of('welcome')[0].selfId).toBe(login.userId);
    expect(b.of('welcome')[0].selfId).toBe(`${login.userId}#2`);
    expect(a.of('welcome')[0].avatars).toEqual([]);
    expect(b.of('welcome')[0].avatars[0].name).toBe('Nora');
  });

  it('Raum voll nach 25 Avataren', async () => {
    for (let i = 0; i < MAX_AVATARS_PER_ISLAND; i++) await joined('voll');
    const extra = await connect();
    extra.send({ type: 'join', island: 'voll', name: 'zu spät', appearance: DEFAULT_APPEARANCE });
    expect((await extra.waitFor('error')).code).toBe('full');
    await extra.waitClosed();
    expect(server.ctx.presence.count('voll')).toBe(MAX_AVATARS_PER_ISLAND);
  }, 20000);
});

describe('Avatare und Chat', () => {
  it('fasst Avatar-Updates zusammen', async () => {
    const a = await joined('av');
    const b = await joined('av');
    for (let i = 1; i <= 20; i++) a.send({ type: 'avatar', state: walk(i) });
    await b.waitFor('avatar.update');
    await sleep(1000 / AVATAR_SEND_RATE + 100);
    const updates = b.of('avatar.update');
    expect(updates.length).toBeLessThan(5);
    expect(updates.at(-1)!.state.position[0]).toBe(20);
    expect(updates[0].id).toBe(a.of('welcome')[0].selfId);
    expect(a.of('avatar.update')).toHaveLength(0);
  });

  it('ignoriert ungültige Avatar-Daten', async () => {
    const a = await joined('av2');
    const b = await joined('av2');
    a.send({ type: 'avatar', state: { ...walk(1), position: [1e9, 0, 0] } });
    await b.waitFor('avatar.update', 300).then(
      () => {
        throw new Error('unerwartetes Update');
      },
      () => undefined,
    );
    expect((await a.waitFor('error')).code).toBe('bad-request');
  });

  it('Chat geht an alle inklusive Absender, mit Limit', async () => {
    const a = await joined('chat');
    const b = await joined('chat');
    a.send({ type: 'chat', text: '  Hallo  ' });
    const echo = await a.waitFor('chat');
    const got = await b.waitFor('chat');
    expect(echo.text).toBe('Hallo');
    expect(got.from).toBe(a.of('welcome')[0].selfId);
    expect(got.ts).toBeGreaterThan(0);
    a.send({ type: 'chat', text: '   ' });
    for (let i = 0; i < 8; i++) a.send({ type: 'chat', text: `m${i}` });
    expect((await a.waitFor('error')).code).toBe('rate-limit');
    await sleep(100);
    expect(b.of('chat').length).toBe(5);
  });
});

describe('Bauen', () => {
  it('Sandbox: alle bauen, Neuankömmling sieht die Welt, Speicherung nach Austritt', async () => {
    const a = await joined('bau');
    const b = await joined('bau');
    a.send({ type: 'entity.upsert', entity: ent('k1', 3) });
    a.send({ type: 'entity.upsert', entity: ent('k2') });
    a.send({ type: 'entity.remove', id: 'k2' });
    const env = { ...a.of('welcome')[0].world.environment, audio: { volume: 0.123 } };
    a.send({ type: 'environment', environment: env });
    const up = await b.waitFor('entity.upsert', 3000, (m) => m.entity.id === 'k1');
    expect(up.by).toBe(a.of('welcome')[0].selfId);
    await b.waitFor('entity.remove');
    expect((await b.waitFor('environment')).environment.audio.volume).toBe(0.123);

    const c = await joined('bau');
    const world = c.of('welcome')[0].world;
    expect(world.entities.map((e) => e.id)).toContain('k1');
    expect(world.entities.map((e) => e.id)).not.toContain('k2');
    expect(world.environment.audio.volume).toBe(0.123);

    a.ws.close();
    b.ws.close();
    c.ws.close();
    await sleep(200);
    const saved = server.ctx.repo.getIsland('bau')!.world;
    expect(saved.entities.find((e) => e.id === 'k1')?.transform.pos[0]).toBe(3);
    expect(saved.entities.some((e) => e.id === 'k2')).toBe(false);
    expect(saved.environment.audio.volume).toBe(0.123);
  });

  it('speichert verzögert, solange jemand im Raum ist', async () => {
    const a = await joined('bau-debounce');
    a.send({ type: 'entity.upsert', entity: ent('d1') });
    await sleep(100);
    expect(server.ctx.repo.getIsland('bau-debounce')!.world.entities.some((e) => e.id === 'd1')).toBe(false);
    await sleep(2000);
    expect(server.ctx.repo.getIsland('bau-debounce')!.world.entities.some((e) => e.id === 'd1')).toBe(true);
  });

  it('close() speichert ausstehende Änderungen', async () => {
    const a = await joined('bau-close');
    a.send({ type: 'entity.upsert', entity: ent('c1') });
    await sleep(100);
    const repo = server.ctx.repo;
    await server.close();
    expect(repo.getIsland('bau-close')!.world.entities.some((e) => e.id === 'c1')).toBe(true);
    server = await startServer({ port: 0, dataDir: dir });
  });

  it('eigene Insel: Besitzer baut, Gast nicht und bekommt Rücknahme', async () => {
    const owner = server.ctx.repo.login('Olga');
    const island = server.ctx.repo.createIsland(
      { ...server.ctx.repo.ensureIsland('vorlage').world, metadata: { name: 'Olgas Insel', version: '1', id: 'olga' } },
      { id: owner.userId, name: owner.name },
    );
    const o = await joined(island.id, 'x', owner.token);
    const g = await joined(island.id, 'Gast');
    expect(o.of('welcome')[0].canBuild).toBe(true);
    expect(g.of('welcome')[0].canBuild).toBe(false);

    g.send({ type: 'entity.upsert', entity: ent('verboten') });
    expect((await g.waitFor('error')).code).toBe('forbidden');
    expect((await g.waitFor('entity.remove')).id).toBe('verboten');

    o.send({ type: 'entity.upsert', entity: ent('erlaubt', 4) });
    await g.waitFor('entity.upsert', 3000, (m) => m.entity.id === 'erlaubt');
    g.send({ type: 'entity.upsert', entity: ent('erlaubt', 99) });
    const back = await g.waitFor('entity.upsert', 3000, (m) => m.entity.id === 'erlaubt' && m.by === 'server');
    expect(back.entity.transform.pos[0]).toBe(4);
    g.send({ type: 'entity.remove', id: 'erlaubt' });
    await sleep(100);
    expect(g.of('entity.upsert').filter((m) => m.entity.id === 'erlaubt' && m.by === 'server')).toHaveLength(2); // Rücknahme des Upserts und des Entfernens
    expect(o.of('entity.remove')).toHaveLength(0);

    // Rechte ändern sich: Gast wird Mitbauer
    server.ctx.repo.setBuilders(island.id, ['*']);
    g.send({ type: 'entity.upsert', entity: ent('jetzt-ok') });
    await o.waitFor('entity.upsert', 3000, (m) => m.entity.id === 'jetzt-ok');
  });

  it('weist ungültige Entities zurück', async () => {
    const a = await joined('bad-ent');
    const b = await joined('bad-ent');
    a.send({ type: 'entity.upsert', entity: { id: 'x', ref: '', transform: {} } });
    expect((await a.waitFor('error')).code).toBe('bad-request');
    await sleep(100);
    expect(b.of('entity.upsert')).toHaveLength(0);
  });
});

describe('Signale und Robustheit', () => {
  it('Signale gehen an die anderen mit from', async () => {
    const a = await joined('sig');
    const b = await joined('sig');
    const c = await joined('sig');
    a.send({ type: 'signal', channel: 'boom', data: { x: 1 } });
    const s = await b.waitFor('signal');
    await c.waitFor('signal');
    expect(s).toMatchObject({ channel: 'boom', data: { x: 1 }, from: a.of('welcome')[0].selfId });
    await sleep(50);
    expect(a.of('signal')).toHaveLength(0);
  });

  it('kaputtes JSON und unbekannte Typen sind nicht fatal', async () => {
    const a = await joined('robust');
    a.ws.send('{kaputt');
    a.send({ type: 'unbekannt' });
    expect((await a.waitFor('error')).code).toBe('bad-request');
    await sleep(100);
    expect(a.of('error').length).toBe(1);
    a.send({ type: 'chat', text: 'noch da' });
    expect((await a.waitFor('chat')).text).toBe('noch da');
  });

  it('zu große Nachrichten schließen die Verbindung', async () => {
    const a = await joined('big');
    a.ws.send(JSON.stringify({ type: 'chat', text: 'x'.repeat(300 * 1024) }));
    await a.waitClosed();
  });

  it('GET /api/islands zeigt Anwesenheit', async () => {
    await joined('presence-test');
    const res = await fetch(`http://localhost:${server.port}/api/islands`);
    const list = (await res.json()) as Array<{ id: string; online: number }>;
    expect(list.find((i) => i.id === 'presence-test')?.online).toBe(1);
  });
});
