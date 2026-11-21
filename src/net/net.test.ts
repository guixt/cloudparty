import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../shared/avatar';
import { encodeMessage, type ClientMessage, type ServerMessage } from '../../shared/protocol';
import { createDefaultWorld } from '../../shared/defaultWorld';
import { appendMessage, parseHashIsland, type ChatLine } from './chatLogic';
import { Connection, backoffDelay, toWsUrl, type ConnectionState, type SocketLike } from './connection';
import { InterpBuffer, lerpAngle } from './interpolation';
import { Coalescer } from './outgoing';

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: SocketLike['onopen'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  onmessage: SocketLike['onmessage'] = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: ServerMessage) {
    this.onmessage?.({ data: encodeMessage(msg) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const welcome: ServerMessage = { type: 'welcome', selfId: 'a', canBuild: true, world: createDefaultWorld(), avatars: [] };

function setup() {
  const messages: ServerMessage[] = [];
  const states: ConnectionState[] = [];
  const conn = new Connection({
    createSocket: (url) => new FakeSocket(url),
    buildJoin: (island, token): ClientMessage => ({ type: 'join', island, name: 'T', token, appearance: DEFAULT_APPEARANCE }),
    onMessage: (m) => messages.push(m),
    onState: (s) => states.push(s),
    random: () => 0.5,
  });
  return { conn, messages, states, last: () => FakeSocket.all[FakeSocket.all.length - 1] };
}

describe('Connection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
  });
  afterEach(() => vi.useRealTimers());

  it('sendet join und wird mit welcome online', () => {
    const { conn, messages, last } = setup();
    conn.connect('ws://x/ws', 'insel', 'tok');
    expect(conn.state.phase).toBe('connecting');
    last().open();
    expect(JSON.parse(last().sent[0])).toMatchObject({ type: 'join', island: 'insel', token: 'tok' });
    last().receive(welcome);
    expect(conn.state.phase).toBe('online');
    expect(messages[0].type).toBe('welcome');
    expect(conn.send({ type: 'chat', text: 'hi' })).toBe(true);
  });

  it('bleibt beim ersten Fehlschlag leise offline und versucht es alle ~15 s erneut', () => {
    const { conn, last } = setup();
    conn.connect('ws://x/ws', 'insel');
    last().drop();
    expect(conn.state.phase).toBe('waiting');
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(13000);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1500);
    expect(FakeSocket.all).toHaveLength(2);
    last().drop();
    vi.advanceTimersByTime(16000);
    expect(FakeSocket.all).toHaveLength(3);
  });

  it('verbindet nach Verlust mit exponentiellem Backoff neu und setzt ihn bei welcome zurück', () => {
    const { conn, last } = setup();
    conn.connect('ws://x/ws', 'insel');
    last().open();
    last().receive(welcome);
    last().drop();
    expect(conn.state.phase).toBe('waiting');
    const d0 = backoffDelay(0, true, 0.5);
    vi.advanceTimersByTime(d0 - 1);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(FakeSocket.all).toHaveLength(2);
    last().drop();
    expect(conn.state.attempt).toBe(2);
    vi.advanceTimersByTime(backoffDelay(1, true, 0.5) + 1);
    expect(FakeSocket.all).toHaveLength(3);
    last().open();
    last().receive(welcome);
    expect(conn.state.attempt).toBe(0);
  });

  it('Backoff wächst und ist bei 15 s gedeckelt', () => {
    const delays = [0, 1, 2, 3, 4, 5, 10].map((a) => backoffDelay(a, true, 1));
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(Math.max(...delays)).toBe(15000);
    expect(backoffDelay(10, true, 0)).toBeLessThanOrEqual(15000);
  });

  it('full beendet die Wiederverbindung', () => {
    const { conn, messages, last } = setup();
    conn.connect('ws://x/ws', 'insel');
    last().open();
    last().receive({ type: 'error', code: 'full', message: 'voll' });
    expect(messages[0]).toMatchObject({ type: 'error' });
    expect(conn.state.phase).toBe('idle');
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('disconnect stoppt alles und send schlägt fehl', () => {
    const { conn, last } = setup();
    conn.connect('ws://x/ws', 'insel');
    last().open();
    last().receive(welcome);
    conn.disconnect();
    expect(conn.state.phase).toBe('idle');
    expect(conn.send({ type: 'chat', text: 'x' })).toBe(false);
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('Verbindungs-Timeout löst eine Wiederholung aus', () => {
    const { conn } = setup();
    conn.connect('ws://x/ws', 'insel');
    vi.advanceTimersByTime(10001);
    expect(conn.state.phase).toBe('waiting');
  });

  it('wandelt http in ws um', () => {
    expect(toWsUrl('http://localhost:8787/')).toBe('ws://localhost:8787/ws');
    expect(toWsUrl('https://a.b')).toBe('wss://a.b/ws');
  });
});

describe('Coalescer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('drosselt und sendet immer den Endzustand', () => {
    const out: number[] = [];
    const c = new Coalescer<number>((_, v) => out.push(v));
    c.push('k', 1, 100);
    c.push('k', 2, 100);
    c.push('k', 3, 100);
    expect(out).toEqual([1]);
    vi.advanceTimersByTime(100);
    expect(out).toEqual([1, 3]);
    vi.advanceTimersByTime(500);
    expect(out).toEqual([1, 3]);
  });

  it('sendNow ersetzt Ausstehendes', () => {
    const out: number[] = [];
    const c = new Coalescer<number>((_, v) => out.push(v));
    c.push('k', 1, 100);
    c.push('k', 2, 100);
    c.sendNow('k', 9);
    vi.advanceTimersByTime(500);
    expect(out).toEqual([1, 9]);
  });

  it('Schlüssel sind unabhängig', () => {
    const out: string[] = [];
    const c = new Coalescer<string>((k, v) => out.push(k + v));
    c.push('a', '1', 100);
    c.push('b', '1', 100);
    expect(out).toEqual(['a1', 'b1']);
  });
});

describe('InterpBuffer', () => {
  it('interpoliert mit Verzögerung', () => {
    const b = new InterpBuffer(100);
    b.push({ t: 1000, x: 0, y: 0, z: 0, yaw: 0 });
    b.push({ t: 1100, x: 2, y: 0, z: 0, yaw: 0 });
    expect(b.sample(1150)?.x).toBeCloseTo(1);
    expect(b.sample(1300)?.x).toBeCloseTo(2);
  });
  it('verwendet den kürzesten Bogen', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(3 + ((-3 - 3 + 2 * Math.PI) % (2 * Math.PI)) / 2);
    const b = new InterpBuffer(0);
    b.push({ t: 0, x: 0, y: 0, z: 0, yaw: 3 });
    b.push({ t: 100, x: 0, y: 0, z: 0, yaw: -3 });
    const yaw = b.sample(50)!.yaw;
    expect(Math.abs(yaw)).toBeGreaterThan(3);
  });
  it('springt bei großen Sprüngen', () => {
    const b = new InterpBuffer(0);
    b.push({ t: 0, x: 0, y: 0, z: 0, yaw: 0 });
    b.push({ t: 100, x: 50, y: 0, z: 0, yaw: 0 });
    expect(b.sample(100)?.x).toBe(50);
    expect(b.sample(150)?.x).toBe(50);
  });
  it('liefert null ohne Daten', () => {
    expect(new InterpBuffer().sample(0)).toBeNull();
  });
});

describe('Chat und Hash', () => {
  it('begrenzt den Verlauf auf 200', () => {
    let list: ChatLine[] = [];
    for (let i = 0; i < 250; i++) list = appendMessage(list, { from: 'a', name: 'A', text: String(i), ts: i, kind: 'avatar' });
    expect(list).toHaveLength(200);
    expect(list[0].text).toBe('50');
    expect(list[199].text).toBe('249');
  });
  it('liest die Insel aus dem Hash', () => {
    expect(parseHashIsland('#testinsel,1,2,3,0')).toBe('testinsel');
    expect(parseHashIsland('#a')).toBe('a');
    expect(parseHashIsland('')).toBeNull();
    expect(parseHashIsland('#,1,2')).toBeNull();
  });
});
