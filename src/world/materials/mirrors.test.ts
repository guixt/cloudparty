import { describe, expect, it } from 'vitest';
import { pickActive } from './mirrors';

describe('pickActive', () => {
  it('nimmt die nächsten sichtbaren Spiegel in Reichweite, höchstens zwei', () => {
    const set = pickActive([
      { id: 'a', dist: 30, visible: true },
      { id: 'b', dist: 5, visible: true },
      { id: 'c', dist: 10, visible: true },
      { id: 'd', dist: 2, visible: false },
      { id: 'e', dist: 60, visible: true },
    ]);
    expect([...set].sort()).toEqual(['b', 'c']);
  });
});
