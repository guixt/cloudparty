/**
 * Reine Hilfsfunktionen der Medien-Flächen (ohne Babylon/DOM, gut testbar).
 */
import type { MediaKind, MediaSpec } from '../../../shared/types';

// ---------------------------------------------------------------- Refs/Arten

export const MEDIA_REFS: Record<string, MediaKind> = {
  'EntitySpec.media-image': 'image',
  'EntitySpec.media-web': 'web',
  'EntitySpec.media-video': 'video',
  'EntitySpec.media-slides': 'slides',
  'EntitySpec.media-text': 'text',
};

export function mediaKindOfRef(ref: string): MediaKind | null {
  return MEDIA_REFS[ref] ?? null;
}

export const KIND_LABELS: Record<MediaKind, string> = {
  image: 'Bild',
  web: 'Webseite',
  video: 'Video',
  slides: 'Folien',
  text: 'Text',
};

// ---------------------------------------------------------------- URLs

export type UrlClass =
  | { type: 'empty' }
  | { type: 'invalid'; reason: string }
  | { type: 'image' | 'video' | 'web'; url: string }
  | { type: 'youtube' | 'vimeo'; url: string; embedUrl: string };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i;
const YT_ID = /^[A-Za-z0-9_-]{6,15}$/;

/** Baut aus einer YouTube-Seiten-URL die Embed-URL (oder null). */
export function youtubeEmbedUrl(u: URL): string | null {
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
  } else return null;
  if (!id || !YT_ID.test(id)) return null;
  return `https://www.youtube.com/embed/${id}`;
}

/** Baut aus einer Vimeo-Seiten-URL die Embed-URL (oder null). */
export function vimeoEmbedUrl(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const idPart = host === 'player.vimeo.com' ? (parts[0] === 'video' ? parts[1] : undefined) : parts.find((p) => /^\d+$/.test(p));
  if (!idPart || !/^\d+$/.test(idPart)) return null;
  return `https://player.vimeo.com/video/${idPart}`;
}

/**
 * Prüft und klassifiziert eine URL. Erlaubt sind http(s) und data:image/data:video;
 * alles andere (javascript:, file:, blob: …) wird abgelehnt. Relative URLs werden
 * gegen `base` aufgelöst, falls angegeben.
 */
export function classifyUrl(raw: string | undefined | null, base?: string): UrlClass {
  const text = (raw ?? '').trim();
  if (!text) return { type: 'empty' };
  if (/^data:/i.test(text)) {
    if (/^data:image\//i.test(text)) return { type: 'image', url: text };
    if (/^data:video\//i.test(text)) return { type: 'video', url: text };
    return { type: 'invalid', reason: 'Nur Bild- und Video-Daten sind erlaubt.' };
  }
  let u: URL;
  try {
    u = base ? new URL(text, base) : new URL(text);
  } catch {
    return { type: 'invalid', reason: 'Das ist keine gültige Adresse.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { type: 'invalid', reason: 'Nur http- und https-Adressen sind erlaubt.' };
  }
  const yt = youtubeEmbedUrl(u);
  if (yt) return { type: 'youtube', url: u.href, embedUrl: yt };
  const vm = vimeoEmbedUrl(u);
  if (vm) return { type: 'vimeo', url: u.href, embedUrl: vm };
  if (IMAGE_EXT.test(u.pathname)) return { type: 'image', url: u.href };
  if (VIDEO_EXT.test(u.pathname)) return { type: 'video', url: u.href };
  return { type: 'web', url: u.href };
}

/** Wie die Fläche eine URL darstellt: Textur (image/video) oder iframe (web). */
export type Resolved =
  | { mode: 'none' }
  | { mode: 'error'; reason: string }
  | { mode: 'image' | 'video'; url: string }
  | { mode: 'web'; url: string; pageUrl: string };

/** Entscheidet je nach Art, wie eine URL dargestellt wird. */
export function resolveSource(kind: MediaKind, raw: string | undefined, base?: string): Resolved {
  const c = classifyUrl(raw, base);
  if (c.type === 'empty') return { mode: 'none' };
  if (c.type === 'invalid') return { mode: 'error', reason: c.reason };
  if (kind === 'image' || kind === 'slides') {
    if (c.type === 'image' || c.type === 'web') return { mode: 'image', url: c.url };
    return { mode: 'error', reason: 'Das ist kein Bild.' };
  }
  if (kind === 'video') {
    if (c.type === 'youtube' || c.type === 'vimeo') return { mode: 'web', url: c.embedUrl, pageUrl: c.url };
    if (c.type === 'video' || c.type === 'web') return { mode: 'video', url: c.url };
    return { mode: 'error', reason: 'Das ist kein Video.' };
  }
  if (kind === 'web') {
    if (c.type === 'youtube' || c.type === 'vimeo') return { mode: 'web', url: c.embedUrl, pageUrl: c.url };
    if (c.type === 'image' && c.url.startsWith('data:')) return { mode: 'error', reason: 'Daten-Adressen sind hier nicht erlaubt.' };
    return { mode: 'web', url: c.url, pageUrl: c.url };
  }
  return { mode: 'none' };
}

/** Kurzform einer URL für Anzeigen (data-URLs werden gekürzt). */
export function shortUrl(url: string, max = 60): string {
  if (url.startsWith('data:')) return `${url.slice(0, url.indexOf(',') > 0 ? url.indexOf(',') : 20)} (eingebettet)`;
  const clean = url.replace(/^https?:\/\//, '');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// ---------------------------------------------------------------- Folien

/** Wendet eine Verschiebung auf den Folienindex an (mit Umlauf). */
export function wrapSlide(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const raw = Math.trunc(index) + Math.trunc(delta);
  return ((raw % count) + count) % count;
}

/** Aktuellen Folienindex der Spezifikation, begrenzt auf die Liste. */
export function currentSlide(media: MediaSpec | undefined): number {
  const n = media?.urls?.length ?? 0;
  if (n === 0) return 0;
  return wrapSlide(media?.slide ?? 0, 0, n);
}

/** Indizes der Nachbarfolien zum Vorladen. */
export function neighbourSlides(index: number, count: number): number[] {
  if (count <= 1) return [];
  return [...new Set([wrapSlide(index, 1, count), wrapSlide(index, -1, count)])].filter((i) => i !== index);
}

// ---------------------------------------------------------------- Maße

/** Passt Inhalt (Seitenverhältnis) in eine Box ein; Ergebnis als Anteil 0..1 der Box. */
export function letterbox(contentAspect: number, boxAspect: number): { w: number; h: number } {
  if (!(contentAspect > 0) || !(boxAspect > 0)) return { w: 1, h: 1 };
  if (contentAspect >= boxAspect) return { w: 1, h: boxAspect / contentAspect };
  return { w: contentAspect / boxAspect, h: 1 };
}

/** Größe eines Bildes nach Verkleinerung auf höchstens `max` Pixel Kantenlänge (nie vergrößern). */
export function downscaleSize(width: number, height: number, max = 1600): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const factor = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

export interface BoardSize {
  width: number;
  height: number;
}
/** Maße der Tafel in Metern (vor Skalierung). Standard 16:9 mit 1,8 m Höhe, Text-Schild 2 × 1 m. */
export function boardSize(kind: MediaKind, aspectOverride?: unknown): BoardSize {
  const height = kind === 'text' ? 1 : 1.8;
  const defaultAspect = kind === 'text' ? 2 : 16 / 9;
  const a = typeof aspectOverride === 'number' && aspectOverride >= 0.2 && aspectOverride <= 8 ? aspectOverride : defaultAspect;
  return { width: height * a, height };
}

// ---------------------------------------------------------------- Text

export type MeasureFn = (text: string, fontSize: number) => number;

/** Bricht Text in Zeilen um (Zeilenumbrüche bleiben, zu lange Wörter werden getrennt). */
export function wrapText(measure: MeasureFn, text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      let rest = word;
      while (measure(rest, fontSize) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut), fontSize) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

export interface FittedText {
  fontSize: number;
  lines: string[];
  lineHeight: number;
  truncated: boolean;
}
/** Wählt die größte Schrift (max → min), bei der der Text in die Box passt; kürzt notfalls mit „…". */
export function fitText(measure: MeasureFn, text: string, boxW: number, boxH: number, maxFont = 140, minFont = 16, lineFactor = 1.25): FittedText {
  for (let size = maxFont; size >= minFont; size -= Math.max(1, Math.round(size * 0.06))) {
    const lines = wrapText(measure, text, size, boxW);
    if (lines.length * size * lineFactor <= boxH) return { fontSize: size, lines, lineHeight: size * lineFactor, truncated: false };
  }
  const lines = wrapText(measure, text, minFont, boxW);
  const fit = Math.max(1, Math.floor(boxH / (minFont * lineFactor)));
  if (lines.length <= fit) return { fontSize: minFont, lines, lineHeight: minFont * lineFactor, truncated: false };
  const kept = lines.slice(0, fit);
  let last = kept[fit - 1] ?? '';
  while (last.length > 0 && measure(`${last}…`, minFont) > boxW) last = last.slice(0, -1);
  kept[fit - 1] = `${last}…`;
  return { fontSize: minFont, lines: kept, lineHeight: minFont * lineFactor, truncated: true };
}

/** Wandelt #rgb/#rrggbb in [r,g,b] (0..255); bei Fehler null. */
export function parseHexColor(hex: string | undefined): [number, number, number] | null {
  if (!hex) return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Textfarbe mit gutem Kontrast zum Hintergrund. */
export function contrastTextColor(background: string | undefined): string {
  const rgb = parseHexColor(background);
  if (!rgb) return '#1b1f27';
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return lum > 0.35 ? '#1b1f27' : '#ffffff';
}

// ---------------------------------------------------------------- Homografie

export type Point2 = [number, number];
export type Quad = [Point2, Point2, Point2, Point2];

/**
 * Berechnet die projektive Abbildung H (3x3, zeilenweise, h33 = 1), die die vier
 * Quellpunkte auf die vier Zielpunkte abbildet. null bei entartetem Viereck.
 */
export function computeHomography(src: Quad, dst: Quad): number[] | null {
  // Gleichungssystem 8x8 für h11..h32.
  const a: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    a.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    a.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 8; r += 1) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 8; r += 1) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      if (f === 0) continue;
      for (let c = col; c < 9; c += 1) a[r][c] -= f * a[col][c];
    }
  }
  const h = a.map((row, i) => row[8] / row[i]);
  if (h.some((v) => !Number.isFinite(v))) return null;
  return [...h, 1];
}

/** Wendet die Homografie auf einen Punkt an. */
export function applyHomography(h: number[], x: number, y: number): Point2 {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/** CSS-`matrix3d(...)` (spaltenweise) für die Homografie; mit `transform-origin: 0 0` anzuwenden. */
export function homographyToMatrix3d(h: number[]): string {
  const m = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]];
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(10))).join(',')})`;
}

/** Wendet ein matrix3d-Muster (wie von homographyToMatrix3d) auf einen Punkt an (für Tests). */
export function applyMatrix3d(css: string, x: number, y: number): Point2 {
  const m = css
    .replace(/^matrix3d\(|\)$/g, '')
    .split(',')
    .map(Number);
  const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
}

/** Rechteck (0,0)-(w,h) → Viereck als Homografie → matrix3d-Text; null bei entartetem Ziel. */
export function quadToMatrix3d(w: number, h: number, dst: Quad): string | null {
  const hom = computeHomography(
    [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ],
    dst,
  );
  return hom ? homographyToMatrix3d(hom) : null;
}
