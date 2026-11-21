import { describe, expect, it } from 'vitest';
import type { EntitySpec } from '../../../shared/types';
import {
  deriveMotion, EMPTY_INPUT, GroundTracker, isSeat, jumpVelocity, MovedGate, movementSettings, movementVector,
  seatCount, seatPlacement, shouldRespawn, smoothYaw, standUpPosition, yawFromDirection, yawFromQuat, angleDelta,
} from './logic';
import { createDefaultWorld } from '../../../shared/defaultWorld';

const entity = (ref: string, over: Partial<EntitySpec> = {}): EntitySpec => ({
  id: 'e1', ref, transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, ...over,
});

describe('movementVector', () => {
  it('is zero without input', () => expect(movementVector(EMPTY_INPUT, [0, 1])).toEqual([0, 0]));
  it('forward follows the camera', () => {
    const [x, z] = movementVector({ ...EMPTY_INPUT, forward: true }, [0, 5]);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(1);
  });
  it('right is the camera right in a left-handed system', () => {
    const [x, z] = movementVector({ ...EMPTY_INPUT, right: true }, [0, 1]);
    expect(x).toBeCloseTo(1);
    expect(z).toBeCloseTo(0);
    const [x2, z2] = movementVector({ ...EMPTY_INPUT, right: true }, [1, 0]);
    expect(x2).toBeCloseTo(0);
    expect(z2).toBeCloseTo(-1);
  });
  it('normalizes diagonals and cancels opposite keys', () => {
    const [x, z] = movementVector({ ...EMPTY_INPUT, forward: true, right: true }, [0, 1]);
    expect(Math.hypot(x, z)).toBeCloseTo(1);
    expect(movementVector({ ...EMPTY_INPUT, forward: true, back: true }, [0, 1])).toEqual([0, 0]);
  });
});

describe('yaw helpers', () => {
  it('takes the short way round', () => {
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    const y = smoothYaw(3, -3, 0.5);
    expect(Math.abs(angleDelta(y, -3))).toBeLessThan(Math.abs(angleDelta(3, -3)));
  });
  it('maps direction and quaternion to yaw', () => {
    expect(yawFromDirection(1, 0)).toBeCloseTo(Math.PI / 2);
    const h = Math.SQRT1_2;
    expect(yawFromQuat([0, h, 0, h])).toBeCloseTo(Math.PI / 2);
    expect(yawFromQuat([0, 0, 0, 1])).toBeCloseTo(0);
  });
});

describe('movementSettings', () => {
  it('derives speeds and fly permission from rules', () => {
    const rules = createDefaultWorld().rules;
    const s = movementSettings(rules);
    expect(s.walkSpeed).toBe(5);
    expect(s.runSpeed).toBeCloseTo(9);
    expect(s.gravity).toBeCloseTo(9.81);
    expect(s.canFly).toBe(true);
    const off = movementSettings({ ...rules, gravity: { enabled: false }, abilities: [{ id: 'fly', enabled: false }] });
    expect(off.gravity).toBe(0);
    expect(off.canFly).toBe(false);
  });
  it('jump velocity reaches about the intended height', () => {
    const v = jumpVelocity(9.81, 1.25);
    expect((v * v) / (2 * 9.81)).toBeCloseTo(1.25, 1);
  });
});

describe('state machine', () => {
  const base = { sitting: false, flying: false, grounded: true, moving: false, running: false };
  it('derives motions by priority', () => {
    expect(deriveMotion(base)).toBe('idle');
    expect(deriveMotion({ ...base, moving: true })).toBe('walk');
    expect(deriveMotion({ ...base, moving: true, running: true })).toBe('run');
    expect(deriveMotion({ ...base, grounded: false })).toBe('jump');
    expect(deriveMotion({ ...base, grounded: false, flying: true })).toBe('fly');
    expect(deriveMotion({ ...base, flying: true, sitting: true })).toBe('sit');
  });
  it('ground tracker has coyote time', () => {
    const g = new GroundTracker(0.1);
    expect(g.update(true, 0.016)).toBe(true);
    expect(g.update(false, 0.05)).toBe(true);
    expect(g.update(false, 0.06)).toBe(false);
    expect(g.update(true, 0.016)).toBe(true);
  });
  it('respawns below -60', () => {
    expect(shouldRespawn(-59.9)).toBe(false);
    expect(shouldRespawn(-60.1)).toBe(true);
    expect(shouldRespawn(NaN)).toBe(true);
  });
});

describe('MovedGate', () => {
  const snap = (x: number) => ({ x, y: 0, z: 0, yaw: 0, motion: 'walk' as const, emoteKey: '' });
  it('throttles and sends a final update after stopping', () => {
    const g = new MovedGate(100);
    expect(g.step(snap(0), 0)).toBe(true);
    expect(g.step(snap(1), 30)).toBe(false);
    expect(g.step(snap(1), 60)).toBe(false);
    expect(g.step(snap(1), 110)).toBe(true); // nachgeholt
    expect(g.step(snap(1), 300)).toBe(false); // unverändert
  });
});

describe('seats', () => {
  it('recognises benches, chairs and state.seats', () => {
    expect(isSeat(entity('EntitySpec.bench'))).toBe(true);
    expect(isSeat(entity('EntitySpec.chair'))).toBe(true);
    expect(isSeat(entity('EntitySpec.box'))).toBe(false);
    expect(isSeat(entity('EntitySpec.box', { state: { seats: 2 } }))).toBe(true);
    expect(isSeat(entity('EntitySpec.box', { state: { seats: 0 } }))).toBe(false);
    expect(seatCount(entity('EntitySpec.chair'))).toBe(1);
  });
  it('places prefab seats at floor level facing the entity forward', () => {
    const p = seatPlacement(entity('EntitySpec.chair', { transform: { pos: [3, 0, 2], rot: [0, Math.SQRT1_2, 0, Math.SQRT1_2], scale: [1, 1, 1] } }))!;
    expect(p.position).toEqual([3, 0, 2]);
    expect(p.yaw).toBeCloseTo(Math.PI / 2);
  });
  it('places generic seats on top of the box', () => {
    const p = seatPlacement(entity('EntitySpec.box', { state: { seats: 1 }, transform: { pos: [0, 0.5, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } }))!;
    expect(p.position[1]).toBeCloseTo(0.5 + 0.5 - 0.45);
  });
  it('picks the slot nearest to the click', () => {
    const bench = entity('EntitySpec.bench', { state: { seats: 3 } });
    const left = seatPlacement(bench, [-0.5, 0, 0])!;
    const right = seatPlacement(bench, [0.5, 0, 0])!;
    expect(left.slot).toBe(0);
    expect(right.slot).toBe(2);
    expect(left.position[0]).toBeLessThan(right.position[0]);
    expect(seatPlacement(bench)!.slot).toBe(1);
  });
  it('stands up in front of the seat', () => {
    const p = standUpPosition({ position: [0, 0, 0], yaw: 0 }, 1);
    expect(p[2]).toBeCloseTo(1);
  });
});
