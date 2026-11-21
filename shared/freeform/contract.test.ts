import { describe, expect, it } from 'vitest';
import { buildFreeformMesh, freeformBounds, sanitizeFreeformState, type FreeformState } from './index';

describe('Freiform-Vertrag (Platzhalter)', () => {
  const states: FreeformState[] = [
    { kind: 'lathe', profile: [[0.5, 0], [0.5, 1]] },
    { kind: 'sweep', path: [{ p: [0, 0] }, { p: [2, 0] }], height: 2.4, thickness: 0.2 },
    { kind: 'patch', grid: [[[0, 0, 0], [1, 0, 0]], [[0, 0, 1], [1, 0, 1]]] },
  ];
  it('jede Art liefert ein Netz mit passenden Arrays', () => {
    for (const s of states) {
      const m = buildFreeformMesh(s);
      expect(m.positions.length % 3).toBe(0);
      expect(m.normals.length).toBe(m.positions.length);
      expect(m.uvs.length / 2).toBe(m.positions.length / 3);
      expect(m.indices.length % 3).toBe(0);
    }
  });
  it('Hülle und Prüfung', () => {
    expect(freeformBounds(states[0]).max[1]).toBeGreaterThan(0);
    expect(() => sanitizeFreeformState({ kind: 'quatsch' })).toThrow();
  });
});
