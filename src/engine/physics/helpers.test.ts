import { describe, expect, it } from 'vitest';
import {
  aabbOverlap, capsuleOverlapsAabb, clampImpulse, ContactTracker, gravityFor, inflateAabb, pairKey,
  pushImpulse, resolvePhysics, shapeKindForRef, Throttle,
} from './helpers';

describe('shapeKindForRef', () => {
  it('wählt Primitive für Grundformen', () => {
    expect(shapeKindForRef('EntitySpec.box', 'dynamic')).toBe('box');
    expect(shapeKindForRef('EntitySpec.sphere', 'static')).toBe('sphere');
    expect(shapeKindForRef('EntitySpec.cylinder', 'dynamic')).toBe('cylinder');
  });
  it('nutzt Hülle (dynamisch) oder Netz (statisch) sonst', () => {
    expect(shapeKindForRef('EntitySpec.cone', 'dynamic')).toBe('convex');
    expect(shapeKindForRef('EntitySpec.tree', 'static')).toBe('mesh');
  });
  it('Trigger sind immer Boxen', () => {
    expect(shapeKindForRef('EntitySpec.tree', 'trigger')).toBe('box');
  });
});

describe('Überlappung', () => {
  const box = { min: [0, 0, 0], max: [1, 1, 1] } as const;
  it('AABB', () => {
    expect(aabbOverlap(box as never, { min: [0.5, 0.5, 0.5], max: [2, 2, 2] })).toBe(true);
    expect(aabbOverlap(box as never, { min: [1.1, 0, 0], max: [2, 1, 1] })).toBe(false);
    expect(aabbOverlap(inflateAabb(box as never, 0.2), { min: [1.1, 0, 0], max: [2, 1, 1] })).toBe(true);
  });
  it('Kapsel gegen Box', () => {
    expect(capsuleOverlapsAabb([0.5, 0, 0.5], box as never)).toBe(true);
    expect(capsuleOverlapsAabb([1.2, 0, 0.5], box as never)).toBe(true);
    expect(capsuleOverlapsAabb([1.5, 0, 0.5], box as never)).toBe(false);
    // Avatar steht auf der Box
    expect(capsuleOverlapsAabb([0.5, 1, 0.5], inflateAabb(box as never, 0.05))).toBe(true);
    // Avatar weit über der Box
    expect(capsuleOverlapsAabb([0.5, 3, 0.5], box as never)).toBe(false);
    // Avatar-Kopf unter einer hohen Box
    expect(capsuleOverlapsAabb([0.5, -3, 0.5], box as never)).toBe(false);
  });
});

describe('ContactTracker', () => {
  it('meldet Beginn und Ende genau einmal', () => {
    const tracker = new ContactTracker<string>();
    expect(tracker.update(['a'])).toEqual({ began: ['a'], ended: [] });
    expect(tracker.update(['a'])).toEqual({ began: [], ended: [] });
    expect(tracker.update(['a', 'b'])).toEqual({ began: ['b'], ended: [] });
    expect(tracker.update(['b'])).toEqual({ began: [], ended: ['a'] });
    expect(tracker.clear()).toEqual(['b']);
    expect(tracker.update(['b']).began).toEqual(['b']);
  });
});

describe('Drosselung', () => {
  it('Throttle lässt pro Schlüssel nur im Intervall durch', () => {
    const throttle = new Throttle(100);
    expect(throttle.allow('x', 0)).toBe(true);
    expect(throttle.allow('x', 50)).toBe(false);
    expect(throttle.allow('y', 50)).toBe(true);
    expect(throttle.allow('x', 120)).toBe(true);
  });
  it('pairKey ist symmetrisch', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });
  it('clampImpulse begrenzt die Länge', () => {
    const v = clampImpulse([300, 0, 400], 50);
    expect(Math.hypot(...v)).toBeCloseTo(50);
    expect(clampImpulse([1, 2, 3], 50)).toEqual([1, 2, 3]);
    expect(clampImpulse([NaN, 0, 0], 5)).toEqual([0, 0, 0]);
  });
});

describe('Sonstiges', () => {
  it('pushImpulse zeigt vom Avatar weg', () => {
    const v = pushImpulse([0, 0, 0], [2, 0, 0], 2);
    expect(v[0]).toBeGreaterThan(0);
    expect(v[1]).toBeGreaterThan(0);
    expect(v[2]).toBeCloseTo(0);
  });
  it('gravityFor', () => {
    expect(gravityFor({ gravity: { enabled: false, strength: 5 } })).toBe(0);
    expect(gravityFor({ gravity: { enabled: true } })).toBe(9.81);
    expect(gravityFor({ gravity: { enabled: true, strength: 3 } })).toBe(3);
  });
  it('resolvePhysics nutzt Standardwerte', () => {
    expect(resolvePhysics(undefined)).toEqual({ mass: 1, friction: 0.6, restitution: 0.2 });
    expect(resolvePhysics({ mass: 4, restitution: 0.7 })).toEqual({ mass: 4, friction: 0.6, restitution: 0.7 });
  });
});
