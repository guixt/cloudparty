/** Weltzusammenfassung für get_world. Alles Weltmaterial gilt als Daten und wird abgegrenzt. */
import { AI_LIMITS } from '../../../shared/aiTools';
import { DEFAULT_ISLAND, type EntitySpec, type Vec3 } from '../../../shared/types';
import type { WorldState } from '../../core/store';
import { PREFABS } from '../../world/entities/prefabs';
import { quatToEuler } from '../../scripting/runtime/commands';

export const MAX_SUMMARY_ENTITIES = 150;
export const DATA_OPEN = '<welt_daten>';
export const DATA_CLOSE = '</welt_daten>';

/** Umschließt Text mit der Daten-Abgrenzung; ein eingeschleustes Schlusszeichen wird entschärft. */
export function wrapData(text: string): string {
  return `${DATA_OPEN}\n${text.split(DATA_CLOSE).join('<\\/welt_daten>').split(DATA_OPEN).join('<welt_daten\\>')}\n${DATA_CLOSE}`;
}

const r = (n: number) => Math.round(n * 100) / 100;
const r3 = (v: Vec3): Vec3 => [r(v[0]), r(v[1]), r(v[2])];

export function entitySummary(e: EntitySpec) {
  const out: Record<string, unknown> = {
    id: e.id,
    name: e.name ?? '',
    ref: e.ref,
    position: r3(e.transform.pos),
    drehung_grad: r3(quatToEuler(e.transform.rot)),
    skalierung: r3(e.transform.scale),
  };
  if (e.material?.color) out.farbe = e.material.color;
  if (e.physics && e.physics.mode !== 'none') out.physik = e.physics.mode;
  if (e.script) out.skript = e.script.enabled ? 'ja' : 'aus';
  if (e.media) out.medien = e.media.kind;
  if (e.particles?.enabled) out.partikel = e.particles.preset;
  if (e.state && Object.keys(e.state).length > 0) out.zustand = e.state;
  return out;
}

export function prefabCatalog() {
  return PREFABS.map((p) => ({
    ref: p.ref,
    bezeichnung: p.label,
    kategorie: p.category,
    standard_skalierung: p.defaults.transform?.scale ?? [1, 1, 1],
    ursprung: (p.groundOffset ?? 0) > 0 ? 'Mitte' : 'Boden',
  }));
}

export function buildWorldSummary(state: WorldState, avatar: { position: Vec3; yaw: number } | null) {
  const island = state.world.island ?? DEFAULT_ISLAND;
  const all = state.order.map((id) => state.entities[id]).filter(Boolean);
  const shown = all.slice(0, MAX_SUMMARY_ENTITIES);
  const env = state.world.environment;
  return {
    welt: state.world.metadata.name,
    insel: { radius: island.radius, tiefe: island.depth, oberseite_y: 0 },
    umgebung: {
      himmel: env.sky,
      licht: { intensitaet: env.light.intensity, temperatur_k: env.light.temperatureK, richtung: env.light.direction },
    },
    avatar: avatar ? { position: r3(avatar.position), blickrichtung_yaw_grad: r(((avatar.yaw * 180) / Math.PI) % 360) } : null,
    anzahl_objekte: all.length,
    ...(all.length > shown.length ? { hinweis: `Nur die ersten ${shown.length} von ${all.length} Objekten gezeigt.` } : {}),
    objekte: shown.map(entitySummary),
    katalog: prefabCatalog(),
    grenzen: { max_koordinate: AI_LIMITS.maxCoordinate, min_groesse: AI_LIMITS.minSize, max_groesse: AI_LIMITS.maxSize },
  };
}
