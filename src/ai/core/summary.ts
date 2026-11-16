/** Weltzusammenfassung für get_world. Alles Weltmaterial gilt als Daten und wird abgegrenzt. */
import { AI_LIMITS } from '../../../shared/aiTools';
import { DEFAULT_ISLAND, type EntitySpec, type Vec3 } from '../../../shared/types';
import type { WorldState } from '../../core/store';
import { PREFABS } from '../../world/entities/prefabs';
import { extraCatalog } from './refs';
import { quatToEuler } from '../../scripting/runtime/commands';
import { graphToCompact } from '../../../shared/graphCompact';

/** get_world zeigt den Graphen in Kompaktform (höchstens für diese Anzahl Objekte, je höchstens MAX_GRAPH_CHARS Zeichen). */
export const MAX_GRAPH_OBJECTS = 20;
export const MAX_GRAPH_CHARS = 3000;

export const MAX_SUMMARY_ENTITIES = 150;
export const DATA_OPEN = '<welt_daten>';
export const DATA_CLOSE = '</welt_daten>';

/** Umschließt Text mit der Daten-Abgrenzung; ein eingeschleustes Schlusszeichen wird entschärft. */
export function wrapData(text: string): string {
  return `${DATA_OPEN}\n${text.split(DATA_CLOSE).join('<\\/welt_daten>').split(DATA_OPEN).join('<welt_daten\\>')}\n${DATA_CLOSE}`;
}

const r = (n: number) => Math.round(n * 100) / 100;
const r3 = (v: Vec3): Vec3 => [r(v[0]), r(v[1]), r(v[2])];

export function entitySummary(e: EntitySpec, includeGraph = false) {
  const out: Record<string, unknown> = {
    id: e.id,
    name: e.name ?? '',
    ref: e.ref,
    position: r3(e.transform.pos),
    drehung_grad: r3(quatToEuler(e.transform.rot)),
    skalierung: r3(e.transform.scale),
  };
  if (e.material?.color) out.farbe = e.material.color;
  if (e.material?.preset) out.material_preset = e.material.preset;
  if (e.material?.pattern && e.material.pattern !== 'none') out.muster = e.material.pattern;
  if (e.material?.mirror) out.spiegel = true;
  if (e.material?.textureUrl) out.textur = true;
  const mat = e.material;
  if (mat) {
    const extra: Record<string, unknown> = {};
    if (mat.metallic !== undefined) extra.metallic = mat.metallic;
    if (mat.roughness !== undefined) extra.roughness = mat.roughness;
    if (mat.alpha !== undefined && mat.alpha !== 1) extra.alpha = mat.alpha;
    if (mat.emissive) extra.emissive = mat.emissive;
    if (mat.emissiveIntensity !== undefined) extra.emissiveIntensity = mat.emissiveIntensity;
    if (mat.uvScale !== undefined) extra.uvScale = mat.uvScale;
    if (mat.reflect !== undefined) extra.reflect = mat.reflect;
    if (mat.clearcoat !== undefined) extra.clearcoat = mat.clearcoat;
    if (mat.glass !== undefined) extra.glass = mat.glass;
    if (Object.keys(extra).length > 0) out.material_werte = extra;
  }
  if (e.physics && e.physics.mode !== 'none') out.physik = e.physics.mode;
  if (e.script) out.skript = e.script.enabled ? 'ja' : 'aus';
  if (e.group) {
    out.gruppe = e.group;
    if (e.groupName) out.gruppenname = e.groupName;
  }
  if (e.graph) {
    out.hat_graph = true;
    if (includeGraph) {
      try {
        const json = JSON.stringify(graphToCompact(e.graph));
        out.graph_kompakt = json.length <= MAX_GRAPH_CHARS ? JSON.parse(json) : `(zu groß: ${e.graph.nodes.length} Knoten)`;
      } catch {
        /* nicht lesbar */
      }
    }
  }
  if (e.media) {
    const m = e.media;
    out.medien = m.kind;
    const d: Record<string, unknown> = {};
    if (m.kind === 'slides') {
      d.folien = m.urls?.length ?? 0;
      d.aktuelle_folie = m.slide ?? 0;
    } else if (m.kind === 'text') {
      if (m.text) d.text = m.text.slice(0, 80);
    } else if (m.url) {
      d[m.kind === 'image' ? 'bild_gesetzt' : 'adresse_gesetzt'] = true;
    }
    if (Object.keys(d).length > 0) out.medien_details = d;
  }
  if (e.particles?.enabled) out.partikel = e.particles.preset;
  if (e.state && Object.keys(e.state).length > 0) out.zustand = e.state;
  return out;
}

export function prefabCatalog() {
  return [
    ...PREFABS.map((p) => ({
      ref: p.ref,
      bezeichnung: p.label,
      kategorie: p.category,
      standard_skalierung: p.defaults.transform?.scale ?? [1, 1, 1],
      ursprung: (p.groundOffset ?? 0) > 0 ? 'Mitte' : 'Boden',
    })),
    // Bausteine des Bauen-Menüs ohne Prefab-Registrierung, z. B. die Medien-Tafeln.
    ...extraCatalog(),
  ];
}

/** Gruppen ab dieser Mitgliederzahl erscheinen in get_world als eine Zeile (spart bei Steinbauten sehr viele Tokens). */
export const COLLAPSE_GROUP_AT = 3;

/** Grober Rahmen aus Position ± halbe Skalierung (Näherung, ohne Drehung). */
function roughBounds(members: EntitySpec[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const e of members) {
    for (let i = 0; i < 3; i++) {
      const half = Math.max(e.transform.scale[i], 0.1) / 2;
      min[i] = Math.min(min[i], e.transform.pos[i] - half);
      max[i] = Math.max(max[i], e.transform.pos[i] + half);
    }
  }
  return { min: r3(min), max: r3(max) };
}

export function groupSummary(id: string, members: EntitySpec[]) {
  const refs = [...new Set(members.map((m) => m.ref.replace(/^EntitySpec\./, '')))].slice(0, 6);
  const colors = [...new Set(members.map((m) => m.material?.color).filter((c): c is string => !!c))].slice(0, 4);
  return { gruppe: id, gruppenname: members[0].groupName ?? '', anzahl: members.length, typen: refs, farben: colors, ...roughBounds(members), naeherung: true };
}

export function buildWorldSummary(state: WorldState, avatar: { position: Vec3; yaw: number } | null, opts: { group?: string; nameContains?: string } = {}) {
  const island = state.world.island ?? DEFAULT_ISLAND;
  const all = state.order.map((id) => state.entities[id]).filter(Boolean);
  const env = state.world.environment;
  let graphCount = 0;

  // Zeilen: lose Objekte einzeln, große Gruppen als eine Zeile (an der Stelle ihres ersten Mitglieds).
  const byGroup = new Map<string, EntitySpec[]>();
  for (const e of all) if (e.group) byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e]);
  let rows: Record<string, unknown>[];
  let hint: string | undefined;
  if (opts.group) {
    let members = byGroup.get(opts.group) ?? [];
    if (members.length === 0) {
      // Gruppenname (eindeutig) statt Gruppen-id
      const needle = opts.group.trim().toLowerCase();
      const named = all.filter((e) => e.group && (e.groupName ?? '').trim().toLowerCase() === needle);
      if (new Set(named.map((e) => e.group)).size === 1) members = named;
    }
    rows = members.slice(0, MAX_SUMMARY_ENTITIES).map((e) => entitySummary(e, false));
    hint = members.length === 0 ? `Keine Gruppe „${opts.group.slice(0, 40)}“.` : members.length > rows.length ? `Nur die ersten ${rows.length} von ${members.length} Mitgliedern gezeigt.` : undefined;
  } else {
    const needle = opts.nameContains?.toLowerCase();
    const seen = new Set<string>();
    const all2: Record<string, unknown>[] = [];
    for (const e of all) {
      if (e.group && (byGroup.get(e.group)?.length ?? 0) >= COLLAPSE_GROUP_AT) {
        if (seen.has(e.group)) continue;
        seen.add(e.group);
        const members = byGroup.get(e.group) ?? [];
        if (needle && !members.some((m) => `${m.name ?? ''} ${m.groupName ?? ''}`.toLowerCase().includes(needle))) continue;
        all2.push(groupSummary(e.group, members));
      } else {
        if (needle && !`${e.name ?? ''} ${e.groupName ?? ''}`.toLowerCase().includes(needle)) continue;
        all2.push(entitySummary(e, (graphCount += e.graph ? 1 : 0) <= MAX_GRAPH_OBJECTS));
      }
    }
    // Bei Überlauf bleiben die neuesten Zeilen (dort wird gerade gebaut).
    rows = all2.length > MAX_SUMMARY_ENTITIES ? all2.slice(-MAX_SUMMARY_ENTITIES) : all2;
    if (all2.length > rows.length) hint = `Nur die letzten ${rows.length} von ${all2.length} Zeilen gezeigt (ältere weggelassen; filtere mit name_contains).`;
    else if (byGroup.size > 0) hint = 'Gruppen mit mindestens 3 Teilen stehen als eine Zeile (Maße nur grob). Die Gruppen-id gilt für get_bounds, clone_group, use_texture, remove_entity und update_entity; get_world mit group=<id> listet die Mitglieder.';
  }
  if (opts.group || opts.nameContains) {
    // Gefilterte Abfrage: ohne Katalog, Umgebung und Grenzen (spart Tokens und Cache-Schreiben).
    return {
      welt: state.world.metadata.name,
      anzahl_objekte: all.length,
      ...(hint ? { hinweis: hint } : {}),
      objekte: rows,
    };
  }
  return {
    welt: state.world.metadata.name,
    insel: { radius: island.radius, tiefe: island.depth, oberseite_y: 0 },
    umgebung: {
      himmel: env.sky,
      licht: { intensitaet: env.light.intensity, temperatur_k: env.light.temperatureK, richtung: env.light.direction },
    },
    avatar: avatar ? { position: r3(avatar.position), blickrichtung_yaw_grad: r(((avatar.yaw * 180) / Math.PI) % 360) } : null,
    anzahl_objekte: all.length,
    ...(hint ? { hinweis: hint } : {}),
    objekte: rows,
    katalog: prefabCatalog(),
    grenzen: { max_koordinate: AI_LIMITS.maxCoordinate, min_groesse: AI_LIMITS.minSize, max_groesse: AI_LIMITS.maxSize },
  };
}
