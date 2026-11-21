import { describe, expect, it } from 'vitest';
import { MAX_USER_IMAGES, toImageBlocks } from './userImages';

const png = 'data:image/png;base64,iVBORw0KGgo=';

describe('Bilder des Nutzers', () => {
  it('wandelt gültige Daten-URLs in Bildblöcke', () => {
    expect(toImageBlocks([png, 'data:image/jpeg;base64,/9j/4AAQ'])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' } },
    ]);
  });
  it('verwirft Ungültiges, Fremdes, Zu-Großes und begrenzt die Anzahl', () => {
    expect(toImageBlocks(['http://x/y.png', 'data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,***', 42 as unknown as string])).toEqual([]);
    expect(toImageBlocks(['data:image/png;base64,' + 'A'.repeat(2_100_000)])).toEqual([]);
    expect(toImageBlocks(Array.from({ length: 9 }, () => png))).toHaveLength(MAX_USER_IMAGES);
    expect(toImageBlocks(undefined)).toEqual([]);
  });
});
