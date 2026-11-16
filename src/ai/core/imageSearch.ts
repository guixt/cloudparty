/**
 * Bildsuche für die KI: Wikimedia Commons und Openverse (beide ohne Key, mit Lizenzangabe).
 * Die Antworten sind fremde Daten: Titel und Autoren werden gekürzt und nie als Anweisung behandelt.
 * Die Parser sind reine Funktionen (mit nachgestellten Antworten getestet).
 */
export type ImageSource = 'wikimedia' | 'openverse';

export interface ImageHit {
  /** Kurzer Verweis für use_image (gilt nur in dieser Sitzung). */
  id: string;
  title: string;
  /** Adresse, von der das Bild heruntergeladen wird (verkleinerte Fassung). */
  fetchUrl: string;
  /** Seite des Bildes beim Anbieter. */
  pageUrl: string;
  author: string;
  license: string;
  source: ImageSource;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Entfernt HTML-Tags und die häufigsten Entitäten (Wikimedia liefert Autoren als HTML). */
export function stripHtml(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const httpUrl = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
};
const OK_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function wikimediaUrl(query: string, count: number): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(count),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime|size',
    iiurlwidth: '1024',
    format: 'json',
    origin: '*',
  });
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

export function openverseUrl(query: string, count: number): string {
  const params = new URLSearchParams({ q: query, page_size: String(count) });
  return `https://api.openverse.org/v1/images/?${params}`;
}

type Raw = Omit<ImageHit, 'id'>;

export function parseWikimedia(json: unknown): Raw[] {
  const pages = isObj(json) && isObj(json.query) && isObj(json.query.pages) ? Object.values(json.query.pages) : [];
  const sorted = pages.filter(isObj).sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
  const out: Raw[] = [];
  for (const page of sorted) {
    const info = Array.isArray(page.imageinfo) && isObj(page.imageinfo[0]) ? page.imageinfo[0] : null;
    if (!info || !OK_MIME.has(String(info.mime))) continue;
    const fetchUrl = httpUrl(info.thumburl) ?? httpUrl(info.url);
    if (!fetchUrl) continue;
    const meta = isObj(info.extmetadata) ? info.extmetadata : {};
    const field = (k: string) => (isObj(meta[k]) ? stripHtml((meta[k] as Record<string, unknown>).value) : '');
    out.push({
      title: clip(String(page.title ?? '').replace(/^File:/, '').replace(/\.[A-Za-z0-9]{3,4}$/, '').replace(/_/g, ' '), 100),
      fetchUrl,
      pageUrl: httpUrl(info.descriptionurl) ?? fetchUrl,
      author: clip(field('Artist') || 'unbekannt', 80),
      license: clip(field('LicenseShortName') || 'Lizenz unbekannt', 40),
      source: 'wikimedia',
    });
  }
  return out;
}

export function parseOpenverse(json: unknown): Raw[] {
  const results = isObj(json) && Array.isArray(json.results) ? json.results : [];
  const out: Raw[] = [];
  for (const r of results) {
    if (!isObj(r)) continue;
    const filetype = String(r.filetype ?? '').toLowerCase();
    if (filetype && !['jpg', 'jpeg', 'png', 'webp'].includes(filetype)) continue;
    const fetchUrl = httpUrl(r.thumbnail) ?? httpUrl(r.url);
    if (!fetchUrl) continue;
    const lic = String(r.license ?? '').toUpperCase();
    const ver = r.license_version ? ` ${String(r.license_version)}` : '';
    out.push({
      title: clip(stripHtml(r.title) || 'ohne Titel', 100),
      fetchUrl,
      pageUrl: httpUrl(r.foreign_landing_url) ?? fetchUrl,
      author: clip(stripHtml(r.creator) || 'unbekannt', 80),
      license: clip(lic ? `CC ${lic}${ver}` : 'Lizenz unbekannt', 40),
      source: 'openverse',
    });
  }
  return out;
}

// ---- Ergebnis-Speicher (Sitzung): ids → Treffer ----
const MAX_STORED = 60;
const store = new Map<string, ImageHit>();
let counter = 0;

export function rememberHits(raws: Raw[]): ImageHit[] {
  return raws.map((raw) => {
    counter += 1;
    const hit: ImageHit = { id: `bild${counter}`, ...raw };
    store.set(hit.id, hit);
    while (store.size > MAX_STORED) store.delete(store.keys().next().value as string);
    return hit;
  });
}
export const getHit = (id: string): ImageHit | undefined => store.get(id);
export const clearHits = (): void => {
  store.clear();
};

export async function searchImages(query: string, source: ImageSource | 'auto', count: number, signal?: AbortSignal): Promise<ImageHit[]> {
  const sources: ImageSource[] = source === 'auto' ? ['wikimedia', 'openverse'] : [source];
  const raws: Raw[] = [];
  let failures = 0;
  for (const s of sources) {
    try {
      const res = await fetch(s === 'wikimedia' ? wikimediaUrl(query, count) : openverseUrl(query, count), { signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      raws.push(...(s === 'wikimedia' ? parseWikimedia(await res.json()) : parseOpenverse(await res.json())));
    } catch (error) {
      if (signal?.aborted) throw error;
      failures += 1;
    }
    if (raws.length >= count) break;
  }
  if (raws.length === 0 && failures === sources.length) throw new Error('Die Bildsuche ist gerade nicht erreichbar.');
  return rememberHits(raws.slice(0, count));
}
