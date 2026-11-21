import { describe, expect, it } from 'vitest';
import { PREFAB_REFS } from '../../shared/types';
import { CATALOG, CATEGORIES, catalogRefs, createFromItem, getCatalogItem } from './catalog';

describe('Katalog', () => {
  it('deckt jede PREFAB_REF ab', () => {
    for (const ref of PREFAB_REFS) expect(catalogRefs()).toContain(ref);
  });
  it('hat eindeutige Schlüssel, gültige Kategorien und bekannte Refs', () => {
    expect(new Set(CATALOG.map((i) => i.key)).size).toBe(CATALOG.length);
    for (const item of CATALOG) {
      expect(CATEGORIES).toContain(item.category);
      expect(PREFAB_REFS as readonly string[]).toContain(item.ref);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
  it('erzeugt Entities mit Vorgaben und eindeutiger id', () => {
    const a = createFromItem(getCatalogItem('bench')!, [1, 0, 2], 0);
    const b = createFromItem(getCatalogItem('bench')!, [1, 0, 2], 0);
    expect(a.id).not.toBe(b.id);
    expect(a.state).toEqual({ seats: 3 });
    expect(a.physics?.mode).toBe('static');
    expect(a.transform.pos).toEqual([1, 0, 2]);
    expect(createFromItem(getCatalogItem('media-image')!, [0, 0, 0], 0).media?.kind).toBe('image');
  });
});
