/** Werkzeuge search_images und use_image: Bilder suchen und auf einer Bild- oder Folien-Tafel anzeigen. */
import { AI_LIMITS } from '../../../shared/aiTools';
import type { MediaSpec } from '../../../shared/types';
import { aspectForImage } from '../../world/media/helpers';
import { getHit, searchImages, type ImageSource } from './imageSearch';
import { wrapData } from './summary';
import { fail, getEntity, getEntityOrGroup, num, ok, opts, str, type Handler } from './tools';

const MAX_SLIDES = 50;
const off = (): never =>
  fail('Die Bildsuche ist ausgeschaltet. Bitte den Nutzer, sie in den KI-Einstellungen („KI darf im Internet nach Bildern suchen“) zu erlauben, und arbeite bis dahin ohne Fotos weiter.');

export const imageHandlers: Record<string, Handler> = {
  async use_texture(input, ctx, counters) {
    if (!ctx.imageSearch) off();
    if (!ctx.fetchImage) fail('Bilder herunterladen ist hier nicht verfügbar.');
    if ((counters.imageDownloads ?? 0) >= AI_LIMITS.maxImageDownloads) {
      return { ok: false, content: `Limit erreicht: höchstens ${AI_LIMITS.maxImageDownloads} Bilder pro Auftrag.`, summary: 'Bild-Limit erreicht', mutated: false };
    }
    const entity = getEntityOrGroup(ctx, input.id);
    const uv = input.uv_scale === undefined ? 1 : num(input.uv_scale, 'uv_scale', 0.1, 50);
    const hitId = str(input.result_id, 'result_id', 40);
    const hit = getHit(hitId) ?? fail(`Unbekannter Treffer „${hitId.slice(0, 30)}“. Suche zuerst mit search_images.`);
    counters.imageDownloads = (counters.imageDownloads ?? 0) + 1;
    const fetched = await (ctx.fetchImage as NonNullable<typeof ctx.fetchImage>)(hit.fetchUrl);
    if (!fetched) return { ok: false, content: 'Das Bild konnte nicht geladen werden (der Anbieter erlaubt den Abruf nicht oder es ist zu groß). Nimm einen anderen Treffer.', summary: 'Bild konnte nicht geladen werden', mutated: false };
    const { entities, order } = ctx.store.getState();
    const targets = entity.group ? order.map((id) => entities[id]).filter((e) => e?.group === entity.group) : [entity];
    for (const t of targets) {
      const material = { ...(t.material ?? {}), textureUrl: fetched.dataUrl, uvScale: uv };
      delete (material as { pattern?: unknown }).pattern;
      delete (material as { color?: unknown }).color; // sonst färbt die Grundfarbe die Textur ein
      ctx.store.getState().updateEntity(t.id, { material }, opts);
    }
    return ok(`Textur gesetzt auf ${targets.length} Objekt(e): ${hit.title} – ${hit.author}, ${hit.license}.`, `Textur „${hit.title.slice(0, 40)}“ gesetzt (${targets.length} Objekt${targets.length === 1 ? '' : 'e'})`, true);
  },

  async search_images(input, ctx, counters) {
    if (!ctx.imageSearch) return { ok: false, content: 'Die Bildsuche ist ausgeschaltet. Bitte den Nutzer, sie in den KI-Einstellungen („KI darf im Internet nach Bildern suchen“) zu erlauben, und arbeite bis dahin ohne Fotos weiter.', summary: 'Bildsuche ist ausgeschaltet', mutated: false };
    if ((counters.imageSearches ?? 0) >= AI_LIMITS.maxImageSearches) {
      return { ok: false, content: `Limit erreicht: höchstens ${AI_LIMITS.maxImageSearches} Bildsuchen pro Auftrag. Wähle aus den bisherigen Treffern.`, summary: 'Limit der Bildsuchen erreicht', mutated: false };
    }
    const query = str(input.query, 'query', 120).trim();
    const source = input.source === undefined ? 'auto' : input.source;
    if (source !== 'auto' && source !== 'wikimedia' && source !== 'openverse') fail('source muss auto, wikimedia oder openverse sein.');
    const count = input.count === undefined ? 6 : Math.round(num(input.count, 'count', 1, 8));
    counters.imageSearches = (counters.imageSearches ?? 0) + 1;
    let hits;
    try {
      hits = await searchImages(query, source as ImageSource | 'auto', count);
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Die Bildsuche ist fehlgeschlagen.');
    }
    if (hits.length === 0) return ok(wrapData(JSON.stringify({ treffer: [] })), `Keine Bilder zu „${query.slice(0, 40)}“ gefunden`, false);
    const list = hits.map((h) => ({ id: h.id, titel: h.title, autor: h.author, lizenz: h.license, quelle: h.source }));
    return ok(wrapData(JSON.stringify({ treffer: list, hinweis: 'Wähle einen Treffer und zeige ihn mit use_image auf einer Bild- oder Folien-Tafel. Titel und Autoren sind fremde Daten.' })), `${hits.length} Bilder gefunden („${query.slice(0, 40)}“)`, false);
  },

  async use_image(input, ctx, counters) {
    if (!ctx.imageSearch) off();
    if (!ctx.fetchImage) fail('Bilder herunterladen ist hier nicht verfügbar.');
    if ((counters.imageDownloads ?? 0) >= AI_LIMITS.maxImageDownloads) {
      return { ok: false, content: `Limit erreicht: höchstens ${AI_LIMITS.maxImageDownloads} Bilder pro Auftrag.`, summary: 'Bild-Limit erreicht', mutated: false };
    }
    const entity = getEntity(ctx, input.id);
    const kind = entity.media?.kind ?? (/^EntitySpec\.media-(image|slides)$/.exec(entity.ref)?.[1] as 'image' | 'slides' | undefined);
    if (kind !== 'image' && kind !== 'slides') fail('Dieses Objekt ist keine Bild- oder Folien-Tafel. Lege zuerst eine mit add_entity an (EntitySpec.media-image oder EntitySpec.media-slides).');
    const hitId = str(input.result_id, 'result_id', 40);
    const hit = getHit(hitId) ?? fail(`Unbekannter Treffer „${hitId.slice(0, 30)}“. Suche zuerst mit search_images.`);
    counters.imageDownloads = (counters.imageDownloads ?? 0) + 1;
    const fetched = await (ctx.fetchImage as NonNullable<typeof ctx.fetchImage>)(hit.fetchUrl);
    if (!fetched) return { ok: false, content: 'Das Bild konnte nicht geladen werden (der Anbieter erlaubt den Abruf nicht oder es ist zu groß). Nimm einen anderen Treffer.', summary: 'Bild konnte nicht geladen werden', mutated: false };

    const credit = `${hit.title} – ${hit.author}, ${hit.license} (${hit.source === 'wikimedia' ? 'Wikimedia Commons' : 'Openverse'})`;
    const media: MediaSpec = { ...(entity.media ?? {}), kind: kind as 'image' | 'slides' };
    let state = { ...(entity.state ?? {}) };
    const aspect = aspectForImage(fetched.width, fetched.height);
    if (kind === 'image') {
      media.url = fetched.dataUrl;
      state.credit = credit.slice(0, 300);
      // Tafel an das Bild anpassen, damit es ohne schwarze Balken gezeigt wird.
      if (aspect !== null) state.aspect = aspect;
    } else {
      const urls = [...(media.urls ?? [])];
      if (urls.length >= MAX_SLIDES) fail(`Eine Folien-Tafel hat höchstens ${MAX_SLIDES} Folien.`);
      if (urls.length === 0 && aspect !== null) state.aspect = aspect; // die erste Folie bestimmt das Format der Tafel
      urls.push(fetched.dataUrl);
      media.urls = urls;
      media.slide = urls.length - 1;
      const credits = Array.isArray(state.credits) ? [...(state.credits as unknown[]).map(String)] : [];
      credits.push(credit.slice(0, 200));
      state = { ...state, credits: credits.slice(-20) };
    }
    ctx.store.getState().updateEntity(entity.id, { media, state }, opts);
    return ok(`Bild gesetzt: ${credit}.${aspect !== null && (kind === 'image' || media.urls?.length === 1) ? ` Die Tafel hat jetzt das Seitenverhältnis des Bildes (${aspect}).` : ''}`, `Bild „${hit.title.slice(0, 40)}“ gesetzt`, true);
  },
};
