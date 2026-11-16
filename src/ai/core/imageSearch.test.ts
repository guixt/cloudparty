import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LIMITS } from '../../../shared/aiTools';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { FIT_STEPS, dataUrlBytes } from './imageFetch';
import { clearHits, getHit, parseOpenverse, parseWikimedia, searchImages, stripHtml, wikimediaUrl } from './imageSearch';
import { executeTool, type RunCounters, type ToolContext } from './tools';

const wikimedia = {
  query: {
    pages: {
      '22': { title: 'File:Zweiter_Wald.jpg', index: 2, imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/2.jpg', url: 'https://upload.wikimedia.org/2.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Zweiter_Wald.jpg', mime: 'image/jpeg', extmetadata: { Artist: { value: '<a href="x">Max &amp; Moritz</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
      '11': { title: 'File:Erster_Wald.png', index: 1, imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/1.png', url: 'https://upload.wikimedia.org/1.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Erster_Wald.png', mime: 'image/png', extmetadata: {} }] },
      '33': { title: 'File:Logo.svg', index: 3, imageinfo: [{ thumburl: 'https://upload.wikimedia.org/thumb/3.png', mime: 'image/svg+xml', extmetadata: {} }] },
      '44': { title: 'File:Kaputt.jpg', index: 4, imageinfo: [{ thumburl: 'javascript:alert(1)', url: 'ftp://x', mime: 'image/jpeg' }] },
      '55': { title: 'File:OhneInfo.jpg', index: 5 },
    },
  },
};
const openverse = {
  results: [
    { id: 'a', title: 'Berg <b>See</b>', thumbnail: 'https://api.openverse.org/v1/images/a/thumb/', url: 'https://x.org/a.jpg', creator: 'Ana', license: 'by', license_version: '2.0', foreign_landing_url: 'https://flickr.com/a', filetype: 'jpg' },
    { id: 'b', title: 'Animation', thumbnail: 'https://api.openverse.org/v1/images/b/thumb/', creator: null, license: 'cc0', filetype: 'gif' },
    { id: 'c', title: 'Nur Original', url: 'https://x.org/c.png', license: 'by-sa', license_version: '4.0' },
    'müll',
  ],
};

describe('Parser', () => {
  it('Wikimedia: sortiert nach Index, nur jpeg/png/webp, bereinigt HTML, ignoriert Kaputtes', () => {
    const hits = parseWikimedia(wikimedia);
    expect(hits.map((h) => h.title)).toEqual(['Erster Wald', 'Zweiter Wald']);
    expect(hits[1]).toMatchObject({ author: 'Max & Moritz', license: 'CC BY-SA 4.0', fetchUrl: 'https://upload.wikimedia.org/thumb/2.jpg', source: 'wikimedia' });
    expect(hits[0]).toMatchObject({ author: 'unbekannt', license: 'Lizenz unbekannt' });
    expect(parseWikimedia(null)).toEqual([]);
    expect(parseWikimedia({ query: { pages: 'x' } })).toEqual([]);
  });

  it('Openverse: Vorschaubild bevorzugt, GIFs und Müll fallen weg, Lizenz lesbar', () => {
    const hits = parseOpenverse(openverse);
    expect(hits.map((h) => h.title)).toEqual(['Berg See', 'Nur Original']);
    expect(hits[0]).toMatchObject({ author: 'Ana', license: 'CC BY 2.0', fetchUrl: 'https://api.openverse.org/v1/images/a/thumb/', source: 'openverse' });
    expect(hits[1].fetchUrl).toBe('https://x.org/c.png');
    expect(parseOpenverse({})).toEqual([]);
  });

  it('stripHtml und Wikimedia-URL', () => {
    expect(stripHtml('<b>Hallo</b>&nbsp; &lt;Welt&gt;')).toContain('Hallo');
    expect(wikimediaUrl('red fox', 5)).toContain('gsrlimit=5');
    expect(wikimediaUrl('red fox', 5)).toContain('origin=*');
  });
});

describe('Bildgrößen', () => {
  it('Schritte werden kleiner, Größenberechnung der Daten-URL', () => {
    for (let i = 1; i < FIT_STEPS.length; i++) expect(FIT_STEPS[i].width <= FIT_STEPS[i - 1].width && FIT_STEPS[i].quality <= FIT_STEPS[i - 1].quality).toBe(true);
    expect(dataUrlBytes('data:image/jpeg;base64,' + 'A'.repeat(400))).toBe(300);
  });
});

function mockFetchJson(map: Record<string, unknown | number>) {
  const calls: string[] = [];
  (globalThis as { fetch: unknown }).fetch = vi.fn(async (url: string) => {
    calls.push(url);
    const key = Object.keys(map).find((k) => url.includes(k));
    const v = key ? map[key] : 404;
    if (typeof v === 'number') return new Response('x', { status: v });
    return new Response(JSON.stringify(v), { status: 200 });
  });
  return calls;
}

describe('searchImages', () => {
  beforeEach(() => clearHits());
  afterEach(() => vi.restoreAllMocks());

  it('auto: nimmt Wikimedia, füllt mit Openverse auf, vergibt Kurz-ids', async () => {
    const calls = mockFetchJson({ 'commons.wikimedia.org': wikimedia, 'api.openverse.org': openverse });
    const hits = await searchImages('forest', 'auto', 5);
    expect(hits).toHaveLength(4);
    expect(calls).toHaveLength(2);
    expect(new Set(hits.map((h) => h.id)).size).toBe(4);
    expect(getHit(hits[0].id)?.title).toBe('Erster Wald');
  });

  it('ein Anbieter ausgefallen: der andere liefert; beide ausgefallen: Fehler', async () => {
    mockFetchJson({ 'commons.wikimedia.org': 503, 'api.openverse.org': openverse });
    expect((await searchImages('x', 'auto', 5)).length).toBe(2);
    mockFetchJson({ 'commons.wikimedia.org': 503, 'api.openverse.org': 500 });
    await expect(searchImages('x', 'auto', 5)).rejects.toThrow(/nicht erreichbar/);
  });
});

function setup(opts: { imageSearch?: boolean; fetched?: string | null } = {}) {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const fetchImage = vi.fn(async () => (opts.fetched === undefined ? 'data:image/jpeg;base64,AAAA' : opts.fetched));
  const ctx: ToolContext = { store, bus, getAvatar: () => null, confirm: async () => true, imageSearch: opts.imageSearch ?? true, fetchImage };
  const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  const run = (name: string, input: unknown) => executeTool(name, input, ctx, counters);
  const board = async (ref = 'EntitySpec.media-image') => {
    // Die Medien-Prefabs werden erst vom Medien-Modul registriert; im Test legen wir die Tafel direkt an.
    const id = `tafel-${store.getState().order.length}`;
    const kind = ref.endsWith('slides') ? 'slides' : 'image';
    store.getState().addEntity({ id, ref, name: 'Tafel', transform: { pos: [0, 0, 5], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, media: { kind } }, { source: 'local' });
    return store.getState().entities[id];
  };
  return { store, run, board, fetchImage, counters };
}

describe('Werkzeuge search_images / use_image', () => {
  beforeEach(() => {
    clearHits();
    mockFetchJson({ 'commons.wikimedia.org': wikimedia, 'api.openverse.org': openverse });
  });

  it('ausgeschaltet: verständliche Meldung, keine Anfrage', async () => {
    const t = setup({ imageSearch: false });
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const r = await t.run('search_images', { query: 'forest' });
    expect(r.ok).toBe(false);
    expect(r.content).toContain('ausgeschaltet');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await t.run('use_image', { id: 'x', result_id: 'bild1' })).ok).toBe(false);
  });

  it('Suche liefert eine Liste als Daten (nur ids, Titel, Autor, Lizenz – keine Adressen)', async () => {
    const t = setup();
    const r = await t.run('search_images', { query: 'forest', count: 3 });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('welt_daten');
    expect(r.content).toContain('Erster Wald');
    expect(r.content).not.toContain('upload.wikimedia.org');
  });

  it('Bild auf Bild-Tafel: Daten-URL, Quelle am Objekt', async () => {
    const t = setup();
    const board = await t.board();
    const s = await t.run('search_images', { query: 'forest' });
    const id = /"id":"(bild\d+)"/.exec(s.content)![1];
    const r = await t.run('use_image', { id: board.id, result_id: id });
    expect(r.ok).toBe(true);
    const e = t.store.getState().entities[board.id];
    expect(e.media).toMatchObject({ kind: 'image', url: 'data:image/jpeg;base64,AAAA' });
    expect(String(e.state?.credit)).toContain('Erster Wald');
    expect(t.fetchImage).toHaveBeenCalledWith('https://upload.wikimedia.org/thumb/1.png');
  });

  it('Folien-Tafel: Bild wird angehängt, aktuelle Folie ist die neue', async () => {
    const t = setup();
    const board = await t.board('EntitySpec.media-slides');
    const s = await t.run('search_images', { query: 'forest' });
    const ids = [...s.content.matchAll(/"id":"(bild\d+)"/g)].map((m) => m[1]);
    await t.run('use_image', { id: board.id, result_id: ids[0] });
    await t.run('use_image', { id: board.id, result_id: ids[1] });
    const e = t.store.getState().entities[board.id];
    expect(e.media?.urls).toHaveLength(2);
    expect(e.media?.slide).toBe(1);
    expect((e.state?.credits as string[]).length).toBe(2);
  });

  it('Fehler: falsches Objekt, unbekannter Treffer, Download schlägt fehl', async () => {
    const t = setup();
    await t.run('add_entity', { ref: 'EntitySpec.box', position: [0, 1, 0], name: 'Klotz' });
    const box = t.store.getState().order.map((id) => t.store.getState().entities[id]).find((e) => e.ref === 'EntitySpec.box')!;
    const s = await t.run('search_images', { query: 'forest' });
    const id = /"id":"(bild\d+)"/.exec(s.content)![1];
    expect((await t.run('use_image', { id: box.id, result_id: id })).content).toContain('keine Bild- oder Folien-Tafel');
    const board = await t.board();
    expect((await t.run('use_image', { id: board.id, result_id: 'bild9999' })).content).toContain('Unbekannter Treffer');

    const bad = setup({ fetched: null });
    const b2 = await bad.board();
    const s2 = await bad.run('search_images', { query: 'forest' });
    const r = await bad.run('use_image', { id: b2.id, result_id: /"id":"(bild\d+)"/.exec(s2.content)![1] });
    expect(r.ok).toBe(false);
    expect(r.content).toContain('anderen Treffer');
    expect(bad.store.getState().entities[b2.id].media?.url).toBeUndefined();
  });

  it('Limits pro Auftrag', async () => {
    const t = setup();
    for (let i = 0; i < AI_LIMITS.maxImageSearches; i++) expect((await t.run('search_images', { query: `q${i}` })).ok).toBe(true);
    const over = await t.run('search_images', { query: 'zu viel' });
    expect(over.ok).toBe(false);
    expect(over.content).toContain('Limit');
    const board = await t.board();
    const s = await t.run('search_images', { query: 'neu' }); // zählt nicht, schon über dem Limit
    expect(s.ok).toBe(false);
    t.counters.imageDownloads = AI_LIMITS.maxImageDownloads;
    expect((await t.run('use_image', { id: board.id, result_id: 'bild1' })).content).toContain('Limit');
  });

  it('ungültige Eingaben', async () => {
    const t = setup();
    expect((await t.run('search_images', {})).ok).toBe(false);
    expect((await t.run('search_images', { query: 'x', source: 'google' })).ok).toBe(false);
    expect((await t.run('search_images', { query: 'x', count: 50 })).ok).toBe(false);
  });
});

describe('Medien-Tafeln anlegen', () => {
  it('add_entity kennt die Tafeln des Bauen-Menüs (media-image, media-slides) und der Katalog nennt sie', async () => {
    const t = setup();
    const r = await t.run('add_entity', { ref: 'EntitySpec.media-image', position: [0, 0, 8], name: 'Waldbild' });
    expect(r.ok).toBe(true);
    const e = t.store.getState().order.map((id) => t.store.getState().entities[id]).find((x) => x.name === 'Waldbild')!;
    expect(e.media?.kind).toBe('image');
    expect((await t.run('add_entity', { ref: 'EntitySpec.media-slides', position: [4, 0, 8] })).ok).toBe(true);
    expect((await t.run('array', { ref: 'EntitySpec.media-text', pattern: 'line', count: 2, start: [0, 0, 12], step: [3, 0, 0] })).ok).toBe(true);
    const { prefabCatalog } = await import('./summary');
    expect(prefabCatalog().some((p) => p.ref === 'EntitySpec.media-image')).toBe(true);
    expect((await t.run('add_entity', { ref: 'EntitySpec.gibt-es-nicht', position: [0, 0, 0] })).ok).toBe(false);
  });
});
