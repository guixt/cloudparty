// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LIBRARY_LIMITS } from '../../shared/library';
import { entitySchema } from '../../shared/worldspec/schema';
import type { EntitySpec } from '../../shared/types';
import type { GameContext } from '../core/context';
import { EventBus } from '../core/events';
import { createWorldStore } from '../core/store';
import { builtinItems } from './builtin';
import { allTags, computePivot, entityBottomY, expandGroups, filterItems, instantiateItem, normalizeForItem, parseAiLabel, parseLibraryFile, rotateY, toMeta } from './logic';
import { createLibrary } from './service';
import { memoryStorage, openStorage } from './store';
import { projectPolygons, polygonsOf, solidsOf } from './thumbnail';

const box = (id: string, pos: [number, number, number], extra: Partial<EntitySpec> = {}): EntitySpec => ({
  id,
  ref: 'EntitySpec.box',
  transform: { pos, rot: [0, 0, 0, 1], scale: [1, 1, 1] },
  material: { color: '#ff0000' },
  ...extra,
});
const bench = (id: string, pos: [number, number, number]): EntitySpec => ({ ...box(id, pos), ref: 'EntitySpec.bench' });

function setup() {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const events: string[] = [];
  bus.on('history.group.begin', () => events.push('begin'));
  bus.on('history.group.end', () => events.push('end'));
  bus.on('entity.added', () => events.push('add'));
  const ctx = { store, bus } as unknown as GameContext;
  const lib = createLibrary(ctx, { storage: memoryStorage(), defaultSpot: () => [10, 0, 20], thumbnail: () => 'data:image/jpeg;base64,AAAA', download: () => undefined });
  return { store, bus, lib, events };
}

describe('Fußpunkt und Boden', () => {
  it('Grundformen: Unterkante aus der Skalierung, Bank am Ursprung', () => {
    expect(entityBottomY(box('a', [0, 0.5, 0]))).toBeCloseTo(0);
    const big = box('b', [0, 2, 0]);
    big.transform.scale = [1, 4, 1];
    expect(entityBottomY(big)).toBeCloseTo(0);
    expect(entityBottomY(bench('c', [0, 0.3, 0]))).toBe(0.3);
  });
  it('gedrehter Würfel hat die Unterkante der Diagonale', () => {
    const e = box('a', [0, 1, 0]);
    const s = Math.sin(Math.PI / 8); // 45° um z
    e.transform.rot = [0, 0, s, Math.cos(Math.PI / 8)];
    expect(entityBottomY(e)).toBeCloseTo(1 - Math.SQRT1_2, 4);
  });
  it('normalisiert x/z auf die Mitte und y auf die tiefste Unterkante', () => {
    const list = normalizeForItem([box('a', [10, 5.5, 4]), box('b', [14, 7.5, 8], { group: 'g', groupName: 'G' })]);
    expect(computePivot([box('a', [10, 5.5, 4]), box('b', [14, 7.5, 8])])).toEqual({ x: 12, z: 6, bottom: 5 });
    expect(list.map((e) => e.transform.pos)).toEqual([[-2, 0.5, -2], [2, 2.5, 2]]);
    expect(list.map((e) => e.id)).toEqual(['p1', 'p2']);
    expect(list[1].group).toBeUndefined();
  });
});

describe('Gruppen und Platzierung (rein)', () => {
  it('expandGroups nimmt alle Mitglieder mit', () => {
    const entities = { a: box('a', [0, 0, 0], { group: 'g' }), b: box('b', [1, 0, 0], { group: 'g' }), c: box('c', [2, 0, 0]) };
    expect(expandGroups(['a'], entities).sort()).toEqual(['a', 'b']);
    expect(expandGroups(['c', 'x'], entities)).toEqual(['c']);
  });
  it('instantiateItem: neue IDs, eine Gruppe, Drehung um den Fußpunkt', () => {
    const parts = normalizeForItem([box('a', [-2, 0.5, 0]), box('b', [2, 0.5, 0])]);
    const out = instantiateItem(parts, [10, 1, 20], 90, 'Test');
    expect(out[0].id).not.toBe(out[1].id);
    expect(out[0].id).not.toBe('p1');
    expect(new Set(out.map((e) => e.group)).size).toBe(1);
    expect(out[0].groupName).toBe('Test');
    // (-2,0,0) um 90° -> (0,0,2)
    expect(out[0].transform.pos[0]).toBeCloseTo(10);
    expect(out[0].transform.pos[2]).toBeCloseTo(22);
    expect(out[0].transform.pos[1]).toBeCloseTo(1.5);
    expect(out[0].transform.rot[1]).toBeCloseTo(Math.SQRT1_2);
    expect(rotateY([1, 0, 0], 90)[2]).toBeCloseTo(-1);
  });
  it('Einzelteile bekommen keine Gruppe', () => {
    const [e] = instantiateItem([box('p1', [0, 0.5, 0], { group: 'x' })], [0, 0, 0], 0, 'N');
    expect(e.group).toBeUndefined();
  });
});

describe('Dienst: speichern und platzieren', () => {
  it('Rundreise: speichern, platzieren, ein Undo-Schritt, Auswahl', async () => {
    const { store, lib, events } = setup();
    const s = store.getState();
    s.addEntity(box('a', [4, 0.5, 4], { group: 'g1', groupName: 'Alt' }));
    s.addEntity(box('b', [6, 0.5, 4], { group: 'g1', groupName: 'Alt' }));
    s.addEntity(box('c', [30, 0.5, 30]));
    s.select('a');
    events.length = 0;
    const meta = await lib.save({ name: '  Paar ', tags: ['x', 'X', 'y'] });
    expect(meta.name).toBe('Paar');
    expect(meta.count).toBe(2);
    expect(meta.tags).toEqual(['x', 'y']);
    const saved = await lib.get(meta.id);
    expect(saved?.entities.map((e) => e.transform.pos)).toEqual([[-1, 0.5, 0], [1, 0.5, 0]]);
    const ids = await lib.place(meta.id, { yawDegrees: 0 });
    expect(ids).toHaveLength(2);
    expect(events).toEqual(['begin', 'add', 'add', 'end']);
    const placed = ids.map((id) => store.getState().entities[id]);
    expect(placed.map((e) => e.transform.pos)).toEqual([[9, 0.5, 20], [11, 0.5, 20]]);
    expect(placed[0].group).toBeTruthy();
    expect(placed[0].group).toBe(placed[1].group);
    expect(placed[0].group).not.toBe('g1');
    expect(placed[0].groupName).toBe('Paar');
    expect(store.getState().selectedIds).toEqual(ids);
  });
  it('Gültigkeitsprüfungen', async () => {
    const { store, lib } = setup();
    await expect(lib.save({ name: 'x', ids: [] })).rejects.toThrow('nichts ausgewählt');
    store.getState().addEntity(box('a', [0, 0.5, 0]));
    await expect(lib.save({ name: '  ', ids: ['a'] })).rejects.toThrow('Namen');
    await expect(lib.save({ name: 'n'.repeat(81), ids: ['a'] })).rejects.toThrow('80');
    const m = await lib.save({ name: 'Eins', ids: ['a'] });
    store.getState().setCanBuild(false);
    await expect(lib.place(m.id)).rejects.toThrow('bauen');
  });
  it('Limit Objekte pro Baustein', async () => {
    const { store, lib } = setup();
    const ids: string[] = [];
    for (let i = 0; i <= LIBRARY_LIMITS.maxEntitiesPerItem; i++) {
      store.getState().addEntity(box(`e${i}`, [i, 0.5, 0]));
      ids.push(`e${i}`);
    }
    await expect(lib.save({ name: 'viele', ids })).rejects.toThrow('höchstens 300');
  });
  it('Aktualisieren, Löschen, eingebaute sind geschützt, Abonnenten', async () => {
    const { store, lib } = setup();
    store.getState().addEntity(box('a', [0, 0.5, 0]));
    let calls = 0;
    const off = lib.subscribe(() => calls++);
    const m = await lib.save({ name: 'A', ids: ['a'] });
    await lib.update(m.id, { name: 'B', tags: ['t'] });
    expect((await lib.get(m.id))?.name).toBe('B');
    await expect(lib.update('builtin-brunnen', { name: 'X' })).rejects.toThrow('Mitgelieferte');
    await expect(lib.remove('builtin-brunnen')).rejects.toThrow('Mitgelieferte');
    await lib.remove(m.id);
    expect(await lib.get(m.id)).toBeUndefined();
    expect(calls).toBe(3);
    off();
  });
  it('Suche und Tag-Filter, Eingebaute zuerst', async () => {
    const { store, lib } = setup();
    store.getState().addEntity(box('a', [0, 0.5, 0]));
    await lib.save({ name: 'Mein Turm', description: 'Hoch', tags: ['Burg'], ids: ['a'] });
    const all = await lib.list();
    expect(all[0].builtin).toBe(true);
    expect(all.at(-1)?.name).toBe('Mein Turm');
    expect((await lib.list('mein turm')).map((i) => i.name)).toEqual(['Mein Turm']);
    expect((await lib.list('burg hoch')).length).toBe(1);
    expect(filterItems(all, '', 'Burg')).toHaveLength(1);
    expect(allTags(all)).toContain('Burg');
    expect((await lib.list('garten')).some((i) => i.name === 'Gartenhaus')).toBe(true);
  });
});

describe('Export und Import', () => {
  it('Rundreise über Datei, ID-Konflikt ergibt neue ID', async () => {
    const { store } = setup();
    store.getState().addEntity(box('a', [0, 0.5, 0]));
    let text = '';
    let fileName = '';
    const ctx = { store, bus: new EventBus() } as unknown as GameContext;
    const download = (name: string, t: string) => {
      fileName = name;
      text = t;
    };
    const lib1 = createLibrary(ctx, { storage: memoryStorage(), thumbnail: () => undefined, download });
    const m1 = await lib1.save({ name: 'Ex', ids: ['a'] });
    await lib1.exportItems([m1.id]);
    expect(fileName).toBe('Ex.cloudparty-baustein.json');
    const lib2 = createLibrary(ctx, { storage: memoryStorage(), thumbnail: () => undefined, download });
    const file = new File([text], 'x.json');
    const added = await lib2.importFile(file);
    expect(added[0].name).toBe('Ex');
    expect(added[0].id).toBe(m1.id);
    const again = await lib2.importFile(file);
    expect(again[0].id).not.toBe(added[0].id);
    await lib2.exportItems(['builtin-zaun']);
    expect(JSON.parse(text).items[0].builtin).toBeUndefined();
  });
  it('lehnt fehlerhafte Dateien mit deutschen Meldungen ab', () => {
    const good = { id: 'i', name: 'N', description: '', tags: [], createdAt: 1, updatedAt: 1, count: 1, entities: [box('p1', [0, 0.5, 0])] };
    const file = (o: unknown) => JSON.stringify(o);
    expect(() => parseLibraryFile('kein json')).toThrow('kein gültiges JSON');
    expect(() => parseLibraryFile(file({ format: 'x', version: 1, items: [] }))).toThrow('keine Cloudparty-Bausteindatei');
    expect(() => parseLibraryFile(file({ format: 'cloudparty-library', version: 2, items: [good] }))).toThrow('Dateiversion');
    expect(() => parseLibraryFile(file({ format: 'cloudparty-library', version: 1, items: [] }))).toThrow('keine Bausteine');
    expect(() => parseLibraryFile(file({ format: 'cloudparty-library', version: 1, items: [{ ...good, name: '' }] }))).toThrow('Namen');
    expect(() => parseLibraryFile(file({ format: 'cloudparty-library', version: 1, items: [{ ...good, entities: [] }] }))).toThrow('keine Objekte');
    expect(() => parseLibraryFile(file({ format: 'cloudparty-library', version: 1, items: [{ ...good, entities: [{ id: 'x' }] }] }))).toThrow('ungültig');
    const many = Array.from({ length: 301 }, (_, i) => box(`p${i}`, [0, 0.5, 0]));
    expect(() => parseLibraryFile(file({ format: 'cloudparty-library', version: 1, items: [{ ...good, entities: many }] }))).toThrow('zu viele');
    const items = parseLibraryFile(file({ format: 'cloudparty-library', version: 1, items: [{ ...good, entities: [{ ...box('p1', [0, 0.5, 0]), fremd: 1 }], thumbnail: 'javascript:alert(1)' }] }));
    expect(items[0].entities[0]).not.toHaveProperty('fremd');
    expect(items[0].thumbnail).toBeUndefined();
  });
});

describe('Eingebaute Bausteine', () => {
  const items = builtinItems();
  it('mindestens zehn, eindeutige IDs, alle gültig und auf dem Boden', () => {
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const item of items) {
      expect(item.builtin).toBe(true);
      expect(item.entities.length).toBeGreaterThan(0);
      expect(item.entities.length).toBeLessThanOrEqual(LIBRARY_LIMITS.maxEntitiesPerItem);
      for (const e of item.entities) {
        expect(entitySchema.safeParse(e).success, `${item.name}/${e.name}`).toBe(true);
        expect(entityBottomY(e), `${item.name}/${e.name}`).toBeGreaterThanOrEqual(-1e-3);
      }
      const bottoms = item.entities.map(entityBottomY);
      expect(Math.min(...bottoms), item.name).toBeLessThan(0.01);
      const meta = toMeta(item);
      expect(meta.count).toBe(item.entities.length);
    }
  });
  it('Lagerfeuer hat Feuer, Disco-Boden und Konfetti haben Skripte', () => {
    const by = (name: string) => items.find((i) => i.name === name)!;
    expect(by('Lagerfeuer').entities.some((e) => e.particles?.preset === 'fire')).toBe(true);
    expect(by('Lagerfeuer').entities.some((e) => e.ref === 'EntitySpec.light')).toBe(true);
    expect(by('Disco-Boden').entities.every((e) => e.script?.source.includes('setColor'))).toBe(true);
    expect(by('Konfetti-Knopf').entities.some((e) => e.script?.source.includes('confetti'))).toBe(true);
    expect(by('Laternenallee').entities.filter((e) => e.ref === 'EntitySpec.lantern')).toHaveLength(5);
  });
  it('Skripte sind syntaktisch gültig', () => {
    for (const item of items) for (const e of item.entities) if (e.script) expect(() => new Function(e.script!.source)).not.toThrow();
  });
  it('Vorschau-Geometrie ist für alle erzeugbar', () => {
    for (const item of items) {
      const { drawn, bounds } = projectPolygons(polygonsOf(solidsOf(item.entities)));
      expect(drawn.length, item.name).toBeGreaterThan(5);
      expect(Number.isFinite(bounds.minX)).toBe(true);
    }
  });
});

describe('KI-Beschriftung', () => {
  it('liest reines JSON, Codeblöcke und Text drumherum', () => {
    const want = { name: 'Haus', description: 'Ein Haus.', tags: ['Haus', 'Garten'] };
    expect(parseAiLabel(JSON.stringify(want))).toEqual(want);
    expect(parseAiLabel('Hier:\n```json\n' + JSON.stringify(want) + '\n```\nViel Spaß')).toEqual(want);
    expect(parseAiLabel('Vorschlag {"name":"A","tags":"x, y"} fertig')).toEqual({ name: 'A', description: '', tags: ['x', 'y'] });
    expect(parseAiLabel('Keine Ahnung')).toBeNull();
    expect(parseAiLabel('{"name": 5}')).toBeNull();
    expect(parseAiLabel('{"name":"' + 'x'.repeat(200) + '"}')?.name).toHaveLength(80);
  });
});

describe('Speicher', () => {
  it('IndexedDB speichert und löscht', async () => {
    const storage = await openStorage();
    const item = { id: 'idb1', name: 'N', description: '', tags: [], createdAt: 1, updatedAt: 1, count: 1, entities: [box('p1', [0, 0.5, 0])] };
    await storage.put(item);
    expect((await storage.readAll()).some((i) => i.id === 'idb1')).toBe(true);
    await storage.remove('idb1');
    expect((await storage.readAll()).some((i) => i.id === 'idb1')).toBe(false);
  });
});
