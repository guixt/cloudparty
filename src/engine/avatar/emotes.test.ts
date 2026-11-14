import { describe, expect, it } from 'vitest';
import { cancelForSitting, cancelOnMove, emoteKey, expireEmotes, startEmote } from './emotes';
import { applyEmote, basePose, emoteWeight, JOINTS, stepRate } from './poses';

describe('emotes', () => {
  it('starts a timed emote on its channel', () => {
    const c = startEmote({}, 'wave', 1000)!;
    expect(c.started?.channel).toBe('upperBody');
    expect(c.emotes.upperBody).toMatchObject({ name: 'wave', startedAt: 1000, durationMs: 2600 });
  });
  it('rejects unknown emotes and dance while sitting', () => {
    expect(startEmote({}, 'moonwalk', 0)).toBeNull();
    expect(startEmote({}, 'dance', 0, true)).toBeNull();
    expect(startEmote({}, 'wave', 0, true)).not.toBeNull();
  });
  it('expires timed emotes but keeps loops', () => {
    let e = startEmote({}, 'wave', 0)!.emotes;
    e = startEmote(e, 'dance', 0)!.emotes;
    const before = expireEmotes(e, 1000);
    expect(before.ended).toEqual([]);
    expect(before.emotes).toBe(e);
    const after = expireEmotes(e, 3000);
    expect(after.ended).toEqual([{ channel: 'upperBody', name: 'wave' }]);
    expect(Object.keys(after.emotes)).toEqual(['fullBody']);
  });
  it('dance toggles and cancels on move', () => {
    const on = startEmote({}, 'dance', 0)!.emotes;
    const off = startEmote(on, 'dance', 5)!;
    expect(off.emotes.fullBody).toBeUndefined();
    expect(off.started).toBeUndefined();
    expect(cancelOnMove(on).ended).toEqual([{ channel: 'fullBody', name: 'dance' }]);
    expect(cancelForSitting(on).emotes).toEqual({});
  });
  it('replaces another emote on the same channel', () => {
    const e = startEmote({}, 'wave', 0)!.emotes;
    const c = startEmote(e, 'raise-hand', 10)!;
    expect(c.ended).toEqual([{ channel: 'upperBody', name: 'wave' }]);
    expect(c.emotes.upperBody?.name).toBe('raise-hand');
    expect(emoteKey(c.emotes)).toContain('raise-hand');
  });
});

describe('poses', () => {
  it('has finite values for every motion', () => {
    for (const m of ['idle', 'walk', 'run', 'jump', 'fly', 'sit'] as const) {
      const p = basePose(m, { phase: 1.3, time: 2 });
      for (const j of JOINTS) for (const v of p.joints[j]) expect(Number.isFinite(v)).toBe(true);
      expect(Number.isFinite(p.offsetY)).toBe(true);
    }
  });
  it('wave raises the right arm; weight fades', () => {
    const p = basePose('idle', { phase: 0, time: 0 });
    const before = p.joints.shoulderR[2];
    applyEmote(p, 'wave', 0.5, 1);
    expect(p.joints.shoulderR[2]).toBeGreaterThan(before + 2);
    expect(emoteWeight(0, 2)).toBe(0);
    expect(emoteWeight(1, 2)).toBe(1);
    expect(emoteWeight(1.95, 2)).toBeLessThan(0.3);
    expect(emoteWeight(10, undefined)).toBe(1);
  });
  it('step rate is clamped', () => {
    expect(stepRate('walk', 5)).toBeGreaterThan(0.9);
    expect(stepRate('walk', 100)).toBeLessThanOrEqual(2.2);
    expect(stepRate('run', 9)).toBeLessThanOrEqual(3.1);
  });
});
