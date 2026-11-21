import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../shared/avatar';
import { createDefaultWorld } from '../../shared/defaultWorld';
import type { EntitySpec } from '../../shared/types';
import { Room, type Outgoing } from './room';

const ent = (id: string, x = 0): EntitySpec => ({ id, ref: 'EntitySpec.box', transform: { pos: [x, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } });
const state = (x: number) => ({ position: [x, 0, 0] as [number, number, number], yaw: 0, motion: 'walk' as const, emotes: {} });

function setup(canBuild: (u?: string) => boolean = () => true, extra: { maxEntities?: number; maxMembers?: number } = {}) {
  const clock = { t: 1_000_000 };
  const room = new Room('t', createDefaultWorld('T', 't'), { canBuild, now: () => clock.t, ...extra });
  const join = (base: string, userId?: string) => {
    const r = room.addMember({ baseId: base, userId, name: base, appearance: DEFAULT_APPEARANCE });
    if (!r.ok) throw new Error('join');
    return r;
  };
  return { room, clock, join };
}
const types = (out: Outgoing[]) => out.map((o) => o.msg.type);

describe('Room Beitritt', () => {
  it('sendet welcome und avatar.joined', () => {
    const { join } = setup();
    const a = join('a');
    expect(types(a.out)).toEqual(['welcome']);
    const b = join('b');
    expect(types(b.out)).toEqual(['welcome', 'avatar.joined']);
    const welcome = b.out[0].msg;
    expect(welcome.type === 'welcome' && welcome.avatars.map((x) => x.id)).toEqual(['a']);
    expect(b.out[1].to).toEqual(['a']);
  });
  it('vergibt eindeutige Sitzungs-IDs', () => {
    const { join } = setup();
    expect(join('u_1').id).toBe('u_1');
    expect(join('u_1').id).toBe('u_1#2');
    expect(join('u_1').id).toBe('u_1#3');
  });
  it('lehnt volle Räume ab', () => {
    const { room, join } = setup(() => true, { maxMembers: 2 });
    join('a');
    join('b');
    const r = room.addMember({ baseId: 'c', name: 'c', appearance: DEFAULT_APPEARANCE });
    expect(r.ok === false && r.error.type === 'error' && r.error.code === 'full').toBe(true);
  });
  it('Austritt benachrichtigt die anderen', () => {
    const { room, join } = setup();
    join('a');
    join('b');
    expect(room.removeMember('b')).toEqual([{ to: ['a'], msg: { type: 'avatar.left', id: 'b' } }]);
    expect(room.removeMember('a')).toEqual([]);
  });
});

describe('Room Avatare', () => {
  it('fasst Updates pro Takt zusammen', () => {
    const { room, join } = setup();
    join('a');
    join('b');
    for (let i = 0; i < 5; i++) room.handle('a', { type: 'avatar', state: state(i) });
    const out = room.tick();
    expect(out).toHaveLength(1);
    expect(out[0].to).toEqual(['b']);
    expect(out[0].msg.type === 'avatar.update' && out[0].msg.state.position[0]).toBe(4);
    expect(room.tick()).toEqual([]);
  });
  it('begrenzt die Rate auf ca. 30/s', () => {
    const { room, join, clock } = setup();
    join('a');
    join('b');
    let accepted = 0;
    for (let i = 0; i < 100; i++) {
      room.handle('a', { type: 'avatar', state: state(i) });
      if (room.tick().length) accepted++;
    }
    expect(accepted).toBe(30);
    clock.t += 1000;
    room.handle('a', { type: 'avatar', state: state(1) });
    expect(room.tick()).toHaveLength(1);
  });
});

describe('Room Chat', () => {
  it('sendet an alle inklusive Absender', () => {
    const { room, join } = setup();
    join('a');
    join('b');
    const out = room.handle('a', { type: 'chat', text: '  hi ' });
    expect(out[0].to.sort()).toEqual(['a', 'b']);
    expect(out[0].msg.type === 'chat' && out[0].msg.text).toBe('hi');
    expect(room.handle('a', { type: 'chat', text: '   ' })).toEqual([]);
  });
  it('limitiert auf 5 Nachrichten pro 5 s', () => {
    const { room, join } = setup();
    join('a');
    for (let i = 0; i < 5; i++) expect(room.handle('a', { type: 'chat', text: 'x' })[0].msg.type).toBe('chat');
    const out = room.handle('a', { type: 'chat', text: 'x' });
    expect(out[0].msg.type === 'error' && out[0].msg.code).toBe('rate-limit');
    // Fehler werden gedrosselt
    expect(room.handle('a', { type: 'chat', text: 'x' })).toEqual([]);
  });
});

describe('Room Bauen', () => {
  it('wendet Änderungen an und verteilt sie mit by', () => {
    const { room, join } = setup();
    join('a');
    join('b');
    const out = room.handle('a', { type: 'entity.upsert', entity: ent('x') });
    expect(out).toEqual([{ to: ['b'], msg: { type: 'entity.upsert', entity: ent('x'), by: 'a' } }]);
    expect(room.dirty).toBe(true);
    room.handle('a', { type: 'entity.upsert', entity: ent('x', 5) });
    expect(room.world.entities.filter((e) => e.id === 'x')).toHaveLength(1);
    expect(room.world.entities.find((e) => e.id === 'x')?.transform.pos[0]).toBe(5);
    expect(types(room.handle('a', { type: 'entity.remove', id: 'x' }))).toEqual(['entity.remove']);
    expect(room.handle('a', { type: 'entity.remove', id: 'x' })).toEqual([]);
  });
  it('verweigert ohne Baurecht und schickt den Zustand zurück', () => {
    let allowed = false;
    const { room, join } = setup(() => allowed);
    join('a');
    join('b');
    // Neuerstellung abgelehnt -> entity.remove
    let out = room.handle('b', { type: 'entity.upsert', entity: ent('n') });
    expect(out.map((o) => o.msg.type)).toEqual(['error', 'entity.remove']);
    expect(out.every((o) => o.to[0] === 'b')).toBe(true);
    expect(room.world.entities.find((e) => e.id === 'n')).toBeUndefined();
    expect(room.dirty).toBe(false);
    // Existierende Entity -> Serverversion
    allowed = true;
    room.handle('a', { type: 'entity.upsert', entity: ent('x', 1) });
    allowed = false;
    out = room.handle('b', { type: 'entity.upsert', entity: ent('x', 9) });
    const back = out.find((o) => o.msg.type === 'entity.upsert')?.msg;
    expect(back && back.type === 'entity.upsert' && back.entity.transform.pos[0]).toBe(1);
    // Entfernen abgelehnt -> upsert
    out = room.handle('b', { type: 'entity.remove', id: 'x' });
    expect(out.map((o) => o.msg.type)).toContain('entity.upsert');
    expect(room.world.entities.some((e) => e.id === 'x')).toBe(true);
    // Umgebung
    out = room.handle('b', { type: 'environment', environment: { ...room.world.environment, audio: { volume: 0 } } });
    expect(out.map((o) => o.msg.type)).toContain('environment');
    expect(room.world.environment.audio.volume).not.toBe(0);
  });
  it('prüft Rechte bei jeder Nachricht neu', () => {
    let allowed = true;
    const { room, join } = setup(() => allowed);
    join('a');
    expect(types(room.handle('a', { type: 'entity.upsert', entity: ent('q') }))).toEqual([]);
    expect(room.world.entities.some((e) => e.id === 'q')).toBe(true);
    allowed = false;
    expect(types(room.handle('a', { type: 'entity.remove', id: 'q' }))).toContain('error');
  });
  it('begrenzt die Anzahl der Entities', () => {
    const { room, join } = setup(() => true, { maxEntities: 3 });
    join('a');
    const base = room.world.entities.length;
    for (let i = base; i < 3; i++) room.handle('a', { type: 'entity.upsert', entity: ent(`n${i}`) });
    const out = room.handle('a', { type: 'entity.upsert', entity: ent('zu-viel') });
    expect(out.map((o) => o.msg.type)).toEqual(['error', 'entity.remove']);
    // Vorhandene dürfen weiter geändert werden
    expect(room.handle('a', { type: 'entity.upsert', entity: ent(room.world.entities[0].id, 2) })).toEqual([]);
  });
  it('limitiert Bauaktionen auf 60/s', () => {
    const { room, join } = setup();
    join('a');
    for (let i = 0; i < 60; i++) room.handle('a', { type: 'entity.upsert', entity: ent('x', i) });
    expect(types(room.handle('a', { type: 'entity.upsert', entity: ent('x', 99) }))).toEqual(['error']);
  });
});

describe('Room Signale', () => {
  it('leitet an die anderen weiter', () => {
    const { room, join } = setup();
    join('a');
    join('b');
    const out = room.handle('a', { type: 'signal', channel: 'boom', data: { n: 1 } });
    expect(out).toEqual([{ to: ['b'], msg: { type: 'signal', channel: 'boom', data: { n: 1 }, from: 'a' } }]);
  });
});
