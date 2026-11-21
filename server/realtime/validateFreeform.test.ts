import { describe, expect, it } from 'vitest';
import { validateEntity } from './validate';

const entity = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  ref: 'EntitySpec.freeform',
  transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
  ...over,
});

describe('Freiform-Entities', () => {
  it('nimmt gültigen State an', () => {
    expect(validateEntity(entity({ state: { kind: 'sweep', path: [{ p: [0, 0] }, { p: [4, 0] }], height: 2.4, thickness: 0.2 } })).ok).toBe(true);
  });
  it('lehnt ungültigen oder fehlenden State ab, ohne Absturz', () => {
    const r = validateEntity(entity({ state: { kind: 'kugel' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Freiform/);
    expect(validateEntity(entity()).ok).toBe(false);
  });
  it('lehnt zu große Entities ab', () => {
    const r = validateEntity(entity({ state: { kind: 'sweep', path: [], pad: 'x'.repeat(250_000) } }));
    expect(r.ok).toBe(false);
  });
});
