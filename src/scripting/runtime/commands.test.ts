import { describe, expect, it, vi } from 'vitest';
import { EventBus, type GameEvents } from '../../core/events';
import { createWorldStore } from '../../core/store';
import type { EntitySpec } from '../../../shared/types';
import {
  CommandError,
  RateLimiter,
  applyCommand,
  eulerToQuat,
  quatToEuler,
  type CommandDeps,
} from './commands';

function setup() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const entity: EntitySpec = {
    id: 't1',
    ref: 'EntitySpec.box',
    name: 'Kiste',
    transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
    media: { kind: 'slides', urls: ['a', 'b', 'c'], slide: 0 },
    physics: { mode: 'static', mass: 3 },
  };
  store.getState().addEntity(entity);
  const events: { type: string; payload: unknown }[] = [];
  for (const type of ['chat.message', 'entity.impulse', 'sound.play', 'avatar.teleport', 'script.message'] as (keyof GameEvents)[]) {
    bus.on(type, (payload: unknown) => events.push({ type, payload }));
  }
  const audio = { playSound: vi.fn(), playTone: vi.fn() };
  const deliver = vi.fn();
  const deps: CommandDeps = { store, bus, localAvatarId: () => 'me', audio, deliver };
  const get = () => store.getState().entities.t1;
  return { deps, store, events, audio, deliver, get, apply: (cmd: unknown) => applyCommand(deps, 't1', cmd) };
}

describe('Euler/Quaternion', () => {
  it('Rundreise', () => {
    for (const e of [[0, 0, 0], [30, 45, 60], [-20, 170, 10], [10, -90, 5]] as [number, number, number][]) {
      const back = quatToEuler(eulerToQuat(...e));
      back.forEach((v, i) => expect(v).toBeCloseTo(e[i], 4));
    }
    const q = eulerToQuat(0, 90, 0);
    expect(q[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe('RateLimiter', () => {
  it('lässt max Aufrufe pro Fenster zu', () => {
    let t = 0;
    const limiter = new RateLimiter(3, 1000, () => t);
    expect([1, 2, 3, 4, 5].map(() => limiter.take())).toEqual([true, true, true, false, false]);
    expect(limiter.shouldWarn()).toBe(true);
    expect(limiter.shouldWarn()).toBe(false);
    t = 1000;
    expect(limiter.take()).toBe(true);
  });
});

describe('applyCommand', () => {
  it('Transform, Material, Partikel, Physik', () => {
    const { apply, get, store } = setup();
    const changes: string[] = [];
    store.subscribe(() => changes.push('x'));
    apply({ c: 'position', v: [1, 2, 3] });
    apply({ c: 'position', v: [1, 2, 3] }); // keine Änderung
    expect(changes).toHaveLength(1);
    expect(get().transform.pos).toEqual([1, 2, 3]);
    apply({ c: 'rotation', v: [0, 90, 0] });
    expect(quatToEuler(get().transform.rot)[1]).toBeCloseTo(90, 4);
    apply({ c: 'scale', v: [2, 2, 2] });
    expect(get().transform.scale).toEqual([2, 2, 2]);
    apply({ c: 'color', v: '#AABBCC' });
    apply({ c: 'emissive', v: '#112233' });
    apply({ c: 'alpha', v: 5 });
    expect(get().material).toEqual({ color: '#aabbcc', emissive: '#112233', alpha: 1 });
    apply({ c: 'particles', on: true, preset: 'fire' });
    expect(get().particles).toEqual({ preset: 'fire', enabled: true });
    apply({ c: 'physics', mode: 'dynamic' });
    expect(get().physics).toEqual({ mode: 'dynamic', mass: 3 });
  });

  it('Änderungen haben die Quelle script', () => {
    const { apply, deps } = setup();
    const sources: string[] = [];
    deps.bus.on('entity.changed', (e) => sources.push(e.source));
    apply({ c: 'color', v: '#ffffff' });
    expect(sources).toEqual(['script']);
  });

  it('say, Impuls, Ton, Nachrichten, Teleport', () => {
    const { apply, events, audio, deliver } = setup();
    apply({ c: 'say', text: 'x'.repeat(900) });
    const chat = events.find((e) => e.type === 'chat.message')!.payload as { text: string; kind: string; name: string; from: string };
    expect(chat.text).toHaveLength(500);
    expect(chat).toMatchObject({ kind: 'object', name: 'Kiste', from: 't1' });
    apply({ c: 'impulse', v: [0, 5, 0] });
    expect(events.find((e) => e.type === 'entity.impulse')!.payload).toEqual({ entityId: 't1', impulse: [0, 5, 0] });
    apply({ c: 'sound', name: 'pop' });
    apply({ c: 'tone', frequency: 440, duration: 0.2 });
    expect(audio.playSound).toHaveBeenCalledWith('pop');
    expect(audio.playTone).toHaveBeenCalledWith(440, 0.2);
    expect(events.filter((e) => e.type === 'sound.play')).toHaveLength(2);
    apply({ c: 'send', target: 'Bob', message: 'hi', data: 1 });
    apply({ c: 'broadcast', message: 'all' });
    expect(deliver).toHaveBeenNthCalledWith(1, 't1', 'Bob', 'hi', 1);
    expect(deliver).toHaveBeenNthCalledWith(2, 't1', null, 'all', undefined);
    expect(events.filter((e) => e.type === 'script.message')).toHaveLength(2);
    apply({ c: 'teleport', avatarId: 'other', v: [1, 1, 1] });
    expect(events.some((e) => e.type === 'avatar.teleport')).toBe(false);
    apply({ c: 'teleport', avatarId: 'me', v: [1, 2, 3] });
    expect(events.find((e) => e.type === 'avatar.teleport')!.payload).toEqual({ position: [1, 2, 3] });
  });

  it('setState mergt, Medien', () => {
    const { apply, get } = setup();
    apply({ c: 'setState', key: 'a', value: 1 });
    apply({ c: 'setState', key: 'b', value: { x: [1] } });
    expect(get().state).toEqual({ a: 1, b: { x: [1] } });
    apply({ c: 'media', op: 'nextSlide' });
    apply({ c: 'media', op: 'prevSlide' });
    apply({ c: 'media', op: 'prevSlide' });
    expect(get().media?.slide).toBe(2);
    apply({ c: 'media', op: 'nextSlide' });
    expect(get().media?.slide).toBe(0);
    apply({ c: 'media', op: 'setImage', value: 'https://x/y.png' });
    apply({ c: 'media', op: 'setText', value: 'Hi' });
    expect(get().media).toMatchObject({ url: 'https://x/y.png', text: 'Hi' });
  });

  it('lehnt ungültige Argumente ab', () => {
    const { apply, get } = setup();
    const bad: unknown[] = [
      null,
      { c: 'nope' },
      { c: 'position', v: [1, 2, Number.NaN] },
      { c: 'position', v: [1, 2] },
      { c: 'position', v: [1, 2, 1e12] },
      { c: 'scale', v: [0, 1, 1] },
      { c: 'color', v: 'red' },
      { c: 'emissive', v: '#12345' },
      { c: 'particles', on: true, preset: 'laser' },
      { c: 'physics', mode: 'ghost' },
      { c: 'say', text: 5 },
      { c: 'setState', key: 'f', value: undefined },
      { c: 'setState', key: '__proto__', value: 1 },
      { c: 'setState', key: 'f', value: { fn: () => 1 } },
      { c: 'sound', name: 'boom' },
      { c: 'tone', frequency: 'a', duration: 1 },
      { c: 'media', op: 'setUrl', value: 'javascript:alert(1)' },
      { c: 'media', op: 'setUrl', value: 'https://x' }, // Entity hat Medien: gültig, siehe unten
    ];
    const results = bad.map((cmd) => {
      try {
        apply(cmd);
        return 'ok';
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
        return 'error';
      }
    });
    expect(results.slice(0, -1).every((r) => r === 'error')).toBe(true);
    expect(results.at(-1)).toBe('ok');
    expect(get().transform.pos).toEqual([0, 0, 0]);
  });

  it('wirft bei fehlender Entity oder fehlenden Medien', () => {
    const { deps, store } = setup();
    expect(() => applyCommand(deps, 'weg', { c: 'say', text: 'x' })).toThrow(CommandError);
    store.getState().addEntity({ id: 'p', ref: 'EntitySpec.box', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
    expect(() => applyCommand(deps, 'p', { c: 'media', op: 'setUrl', value: 'https://x' })).toThrow(/Medien/);
  });
});
