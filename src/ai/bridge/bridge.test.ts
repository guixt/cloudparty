import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { createBridgeClient, type CallResult, type SocketLike } from './client';
import { createRunner, RUN_IDLE_MS } from './index';
import { loadBridgeSettings, sanitizePort, setBridgeSettings } from './state';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];
  closed = false;
  constructor(readonly url: string) {}
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.closed = true;
  }
  recv(m: object) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

describe('Brücken-Client', () => {
  it('verbindet nur mit Token, meldet Welt, führt Aufrufe aus und antwortet', async () => {
    const sockets: FakeSocket[] = [];
    const states: string[] = [];
    const client = createBridgeClient({
      createSocket: (u) => {
        const s = new FakeSocket(u);
        sockets.push(s);
        return s;
      },
      run: async (name): Promise<CallResult> => ({ ok: true, content: `ok ${name}`, summary: 'x', image: 'IMG' }),
      world: () => 'Haus',
      onStatus: (s) => states.push(s),
      retryMs: 5,
    });
    client.start(8765, '');
    expect(sockets).toHaveLength(0);
    expect(states.at(-1)).toBe('off');
    client.start(8765, 'tok');
    expect(sockets[0].url).toBe('ws://127.0.0.1:8765/?token=tok');
    sockets[0].recv({ type: 'welcome' });
    expect(states.at(-1)).toBe('connected');
    expect(sockets[0].sent[0]).toEqual({ type: 'hello', world: 'Haus' });
    sockets[0].recv({ type: 'call', id: 7, name: 'get_world', input: {} });
    await new Promise((r) => setTimeout(r, 5));
    expect(sockets[0].sent[1]).toEqual({ type: 'result', id: 7, ok: true, content: 'ok get_world', summary: 'x', image: 'IMG' });
    client.stop();
    expect(sockets[0].closed).toBe(true);
    expect(states.at(-1)).toBe('off');
  });

  it('baut die Verbindung nach Abbruch neu auf, gibt bei falschem Token auf', async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const states: string[] = [];
    const client = createBridgeClient({ createSocket: (u) => (sockets.push(new FakeSocket(u)), sockets.at(-1)!), run: async () => ({ ok: true, content: '', summary: '' }), world: () => '', onStatus: (s) => states.push(s), retryMs: 100 });
    client.start(8765, 'tok');
    sockets[0].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(150);
    expect(sockets).toHaveLength(2);
    sockets[1].onclose?.({ code: 4401 });
    await vi.advanceTimersByTimeAsync(500);
    expect(sockets).toHaveLength(2);
    expect(states.at(-1)).toBe('rejected');
    client.stop();
    vi.useRealTimers();
  });
});

describe('Ausführung der Aufrufe', () => {
  const setup = () => {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    store.getState().setCanBuild(true);
    const events: string[] = [];
    bus.on('history.group.begin', () => events.push('begin'));
    bus.on('history.group.end', () => events.push('end'));
    const run = createRunner({ store, bus, localAvatar: { presence: { position: [0, 0, 0], yaw: 0 } } } as never);
    return { store, run, events };
  };

  it('baut mit denselben Werkzeugen, jeder verändernde Aufruf ist eine Undo-Gruppe', async () => {
    const t = setup();
    const before = t.store.getState().order.length;
    const r = await t.run('add_wall', { from: [0, 0], to: [4, 0], height: 2, name: 'Wand' });
    expect(r.ok).toBe(true);
    expect(t.store.getState().order.length).toBeGreaterThan(before);
    expect(t.events).toEqual(['begin', 'end']);
    await t.run('get_world', {});
    expect(t.events).toEqual(['begin', 'end']); // lesend: keine Gruppe
    expect((await t.run('add_wall', { from: [0, 0], to: [0.01, 0], height: 2 })).ok).toBe(false);
    expect((await t.run('gibtsnicht', {})).ok).toBe(false);
  });

  it('ohne Baurecht wird nichts verändert', async () => {
    const t = setup();
    t.store.getState().setCanBuild(false);
    const before = t.store.getState().order.length;
    const r = await t.run('add_wall', { from: [0, 0], to: [4, 0], height: 2 });
    expect(r.ok).toBe(false);
    expect(t.store.getState().order.length).toBe(before);
  });

  it('Anleitung enthält die Hinweise zur Steuerung von außen; Limits beginnen nach Pause neu', async () => {
    const t = setup();
    const g = await t.run('cloudparty_guide', {});
    expect(g.content).toContain('Steuerung von außen (MCP)');
    expect(g.content).toContain('Sicherheitsregeln');
    const t0 = 1_000_000;
    await t.run('add_wall', { from: [0, 0], to: [4, 0], height: 2 }, t0);
    const w = await t.run('what_changed', {}, t0 + 1000);
    expect(w.content).toContain('Gruppe');
    const w2 = await t.run('what_changed', {}, t0 + 1000 + RUN_IDLE_MS + 10);
    expect(w2.content).toContain('nichts geändert');
  });
});

describe('Einstellungen', () => {
  it('Port wird geprüft', () => {
    expect(sanitizePort(8000)).toBe(8000);
    expect(sanitizePort(80)).toBe(8765);
    expect(sanitizePort('abc')).toBe(8765);
  });
  it('ohne Speicher: ausgeschaltet', () => {
    expect(loadBridgeSettings().enabled).toBe(false);
    setBridgeSettings({ token: ' a b ' });
  });
});
