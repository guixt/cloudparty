/**
 * Katalog der platzierbaren Bausteine (Palette).
 *
 * INTEGRATIONSPUNKT FÜR DEN KOORDINATOR: Paket 4 (Entities) exportiert später
 * `PREFABS`, `getPrefab(ref)` und `createEntityFromPrefab(ref, pos)` aus
 * `src/world/entities/prefabs.ts`. Um die eigene Liste abzulösen, genügt es, in
 * dieser Datei `CATALOG` aus `PREFABS` abzuleiten (Label/Kategorie/Defaults) und
 * `createFromItem` auf `createEntityFromPrefab` umzustellen. Alles andere im
 * Build-Modus greift nur über `CATALOG`, `getCatalogItem`, `createFromItem`
 * und `catalogRefs` auf den Katalog zu. Bis dahin gilt die eingebaute Liste unten.
 */
import { newEntityId, type EntitySpec, type Vec3 } from '../../shared/types';
import type { PlacementAnchor } from './logic';

export type CatalogCategory = 'Grundformen' | 'Klemmbausteine' | 'Möbel' | 'Natur' | 'Licht' | 'Technik' | 'Medien' | 'Freiform';
export const CATEGORIES: CatalogCategory[] = ['Grundformen', 'Klemmbausteine', 'Möbel', 'Natur', 'Licht', 'Technik', 'Medien', 'Freiform'];

export interface CatalogItem {
  /** Eindeutiger Schlüssel (mehrere Einträge dürfen dieselbe ref nutzen). */
  key: string;
  ref: string;
  label: string;
  category: CatalogCategory;
  /** Zentrierte Grundform oder Bodenursprung (siehe docs/architecture.md, Regel 6). */
  anchor: PlacementAnchor;
  /** Höhe der Grundform bei Skalierung 1 (nur für anchor = 'center'). */
  baseHeight?: number;
  /** Zusätzliche Höhe über der Fläche (z. B. schwebendes Licht). */
  lift?: number;
  scale: Vec3;
  /** Vorgaben für die neue Entity (ohne id und transform). */
  defaults: Partial<Omit<EntitySpec, 'id' | 'ref' | 'transform'>>;
}

const solid = { mode: 'static' as const };

export const CATALOG: CatalogItem[] = [
  { key: 'box', ref: 'EntitySpec.box', label: 'Würfel', category: 'Grundformen', anchor: 'center', scale: [1, 1, 1],
    defaults: { material: { color: '#e8734a' }, physics: solid } },
  { key: 'sphere', ref: 'EntitySpec.sphere', label: 'Kugel', category: 'Grundformen', anchor: 'center', scale: [1, 1, 1],
    defaults: { material: { color: '#4da3ff' }, physics: solid } },
  { key: 'cylinder', ref: 'EntitySpec.cylinder', label: 'Zylinder', category: 'Grundformen', anchor: 'center', scale: [1, 1, 1],
    defaults: { material: { color: '#6fcf6f' }, physics: solid } },
  { key: 'cone', ref: 'EntitySpec.cone', label: 'Kegel', category: 'Grundformen', anchor: 'center', scale: [1, 1, 1],
    defaults: { material: { color: '#f2c94c' }, physics: solid } },
  { key: 'plane', ref: 'EntitySpec.plane', label: 'Platte', category: 'Grundformen', anchor: 'center', baseHeight: 0.05, scale: [2, 1, 2],
    defaults: { material: { color: '#d9dee8' }, physics: solid } },
  { key: 'torus', ref: 'EntitySpec.torus', label: 'Ring', category: 'Grundformen', anchor: 'center', baseHeight: 0.3, scale: [1, 1, 1],
    defaults: { material: { color: '#b06ef0' }, physics: solid } },
  { key: 'crate-dynamic', ref: 'EntitySpec.box', label: 'Holzkiste', category: 'Grundformen', anchor: 'center', scale: [1, 1, 1],
    defaults: { name: 'Kiste', material: { color: '#c98a4b' }, physics: { mode: 'dynamic', mass: 1, friction: 0.6, restitution: 0.1 } } },
  { key: 'ball-bouncy', ref: 'EntitySpec.sphere', label: 'Hüpfball', category: 'Grundformen', anchor: 'center', scale: [0.8, 0.8, 0.8],
    defaults: { name: 'Hüpfball', material: { color: '#ff5d73' }, physics: { mode: 'dynamic', mass: 0.5, friction: 0.4, restitution: 0.85 } } },

  { key: 'brick-2x4', ref: 'EntitySpec.brick', label: 'Stein 2×4', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Stein 2×4', material: { color: '#d93a2f', preset: 'lack' }, physics: solid, state: { w: 2, d: 4, kind: 'stein' } } },
  { key: 'brick-2x2', ref: 'EntitySpec.brick', label: 'Stein 2×2', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Stein 2×2', material: { color: '#2f6fd9', preset: 'lack' }, physics: solid, state: { w: 2, d: 2, kind: 'stein' } } },
  { key: 'brick-1x2', ref: 'EntitySpec.brick', label: 'Stein 1×2', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Stein 1×2', material: { color: '#f2c230', preset: 'lack' }, physics: solid, state: { w: 1, d: 2, kind: 'stein' } } },
  { key: 'plate-4x8', ref: 'EntitySpec.brick', label: 'Platte 4×8', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Platte 4×8', material: { color: '#3aa655', preset: 'lack' }, physics: solid, state: { w: 4, d: 8, kind: 'platte' } } },
  { key: 'plate-2x4', ref: 'EntitySpec.brick', label: 'Platte 2×4', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Platte 2×4', material: { color: '#f2f2f2', preset: 'lack' }, physics: solid, state: { w: 2, d: 4, kind: 'platte' } } },
  { key: 'tile-2x2', ref: 'EntitySpec.brick', label: 'Fliese 2×2', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Fliese 2×2', material: { color: '#222222', preset: 'lack' }, physics: solid, state: { w: 2, d: 2, kind: 'fliese' } } },

  { key: 'slope-2x2', ref: 'EntitySpec.brick', label: 'Schrägstein 2×2', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Schrägstein 2×2', material: { color: '#d93a2f', preset: 'lack' }, physics: solid, state: { w: 2, d: 2, kind: 'schraeg' } } },
  { key: 'slope-2x3', ref: 'EntitySpec.brick', label: 'Schrägstein 2×3', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Schrägstein 2×3', material: { color: '#2f6fd9', preset: 'lack' }, physics: solid, state: { w: 2, d: 3, kind: 'schraeg' } } },
  { key: 'round-2x2', ref: 'EntitySpec.brick', label: 'Rundstein 2×2', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Rundstein 2×2', material: { color: '#f2c230', preset: 'lack' }, physics: solid, state: { w: 2, d: 2, kind: 'rund' } } },
  { key: 'wheel-small', ref: 'EntitySpec.brick', label: 'Rad klein', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Rad klein', material: { color: '#c8ccd2', preset: 'lack' }, physics: solid, state: { w: 1, d: 2, kind: 'rad' } } },
  { key: 'wheel-big', ref: 'EntitySpec.brick', label: 'Rad groß', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Rad groß', material: { color: '#c8ccd2', preset: 'lack' }, physics: solid, state: { w: 1, d: 4, kind: 'rad' } } },
  { key: 'curve-2x3', ref: 'EntitySpec.brick', label: 'Bogenstein 2×3', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Bogenstein 2×3', material: { color: '#e0338a', preset: 'lack' }, physics: solid, state: { w: 2, d: 3, kind: 'bogen' } } },
  { key: 'curve-4x4', ref: 'EntitySpec.brick', label: 'Bogenstein 4×4', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Bogenstein 4×4', material: { color: '#e0338a', preset: 'lack' }, physics: solid, state: { w: 4, d: 4, kind: 'bogen' } } },
  { key: 'slope-inv-2x2', ref: 'EntitySpec.brick', label: 'Schräge umgedreht 2×2', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Schräge umgedreht 2×2', material: { color: '#2f6fd9', preset: 'lack' }, physics: solid, state: { w: 2, d: 2, kind: 'schraeg_um' } } },
  { key: 'quarter-2', ref: 'EntitySpec.brick', label: 'Viertelrund 2×2', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Viertelrund 2×2', material: { color: '#3aa655', preset: 'lack' }, physics: solid, state: { w: 2, d: 2, kind: 'viertel' } } },
  { key: 'arch-1x6', ref: 'EntitySpec.brick', label: 'Radlauf 1×6', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Radlauf 1×6', material: { color: '#222222', preset: 'lack' }, physics: solid, state: { w: 1, d: 6, kind: 'bogenlauf' } } },
  { key: 'roundplate-2', ref: 'EntitySpec.brick', label: 'Rundplatte 2×2', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Rundplatte 2×2', material: { color: '#f2c230', preset: 'lack' }, physics: solid, state: { w: 2, d: 2, kind: 'rundplatte' } } },
  { key: 'dome-4', ref: 'EntitySpec.brick', label: 'Kuppel 4×4', category: 'Klemmbausteine', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Kuppel 4×4', material: { color: '#f2f2f2', preset: 'lack' }, physics: solid, state: { w: 4, d: 4, kind: 'kuppel' } } },
  { key: 'bench', ref: 'EntitySpec.bench', label: 'Bank', category: 'Möbel', anchor: 'ground', scale: [1, 1, 1],
    defaults: { material: { color: '#a8743f' }, physics: solid, state: { seats: 3 } } },
  { key: 'chair', ref: 'EntitySpec.chair', label: 'Stuhl', category: 'Möbel', anchor: 'ground', scale: [1, 1, 1],
    defaults: { material: { color: '#c0563b' }, physics: solid, state: { seats: 1 } } },
  { key: 'table', ref: 'EntitySpec.table', label: 'Tisch', category: 'Möbel', anchor: 'ground', scale: [1, 1, 1],
    defaults: { material: { color: '#b98a58' }, physics: solid } },

  { key: 'tree', ref: 'EntitySpec.tree', label: 'Baum', category: 'Natur', anchor: 'ground', scale: [1, 1, 1],
    defaults: { physics: solid } },
  { key: 'rock', ref: 'EntitySpec.rock', label: 'Felsen', category: 'Natur', anchor: 'ground', scale: [1, 1, 1],
    defaults: { material: { color: '#8d8f94' }, physics: solid } },
  { key: 'campfire', ref: 'EntitySpec.cylinder', label: 'Feuer', category: 'Natur', anchor: 'center', scale: [0.8, 0.3, 0.8],
    defaults: { name: 'Feuerstelle', material: { color: '#4a3b32' }, physics: solid, particles: { preset: 'fire', enabled: true, rate: 60 } } },

  { key: 'lantern', ref: 'EntitySpec.lantern', label: 'Laterne', category: 'Licht', anchor: 'ground', scale: [1, 1, 1],
    defaults: { material: { color: '#ffd37a', emissive: '#ffb347' }, physics: solid, state: { on: true, intensity: 1 } } },
  { key: 'light', ref: 'EntitySpec.light', label: 'Licht', category: 'Licht', anchor: 'ground', lift: 2, scale: [1, 1, 1],
    defaults: { material: { color: '#fff1c2' }, state: { on: true, intensity: 1 } } },
  { key: 'glow-sphere', ref: 'EntitySpec.sphere', label: 'Leuchtball', category: 'Licht', anchor: 'center', scale: [0.6, 0.6, 0.6],
    defaults: { name: 'Leuchtkugel', material: { color: '#9fe8ff', emissive: '#4dc9ff' } } },

  { key: 'avatar-spawn', ref: 'EntitySpec.avatar-spawn', label: 'Startpunkt', category: 'Technik', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Startpunkt' } },
  { key: 'sign', ref: 'EntitySpec.sign', label: 'Schild', category: 'Technik', anchor: 'ground', scale: [1, 1, 1],
    defaults: { material: { color: '#c79a63' }, physics: solid, state: { text: 'Hallo!' } } },
  { key: 'trigger', ref: 'EntitySpec.box', label: 'Zone', category: 'Technik', anchor: 'center', scale: [3, 2, 3],
    defaults: { name: 'Auslöser', material: { color: '#4cd08a', alpha: 0.25 }, physics: { mode: 'trigger' } } },
  { key: 'model', ref: 'EntitySpec.model', label: '3D-Modell', category: 'Technik', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: '3D-Modell', modelUrl: '' } },

  { key: 'media-image', ref: 'EntitySpec.media-image', label: 'Bild', category: 'Medien', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Bild', media: { kind: 'image' }, physics: solid } },
  { key: 'media-web', ref: 'EntitySpec.media-web', label: 'Webseite', category: 'Medien', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Webseite', media: { kind: 'web' }, physics: solid } },
  { key: 'media-video', ref: 'EntitySpec.media-video', label: 'Video', category: 'Medien', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Video', media: { kind: 'video' }, physics: solid } },
  { key: 'media-slides', ref: 'EntitySpec.media-slides', label: 'Folien', category: 'Medien', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Folien', media: { kind: 'slides', urls: [], slide: 0 }, physics: solid } },
  { key: 'media-text', ref: 'EntitySpec.media-text', label: 'Text', category: 'Medien', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Text', media: { kind: 'text', text: 'Hallo Welt' }, physics: solid } },
  // Wasser und Spiegel (Paket 23). Größe über scale: x/z = Ausdehnung, y = Tiefe bzw. Dicke.
  { key: 'water', ref: 'EntitySpec.water', label: 'Wasser', category: 'Natur', anchor: 'ground', scale: [8, 1, 8],
    defaults: { name: 'Wasser', material: { color: '#2c9fd9' }, state: { waves: 0.4 }, physics: { mode: 'trigger' } } },
  { key: 'mirror', ref: 'EntitySpec.mirror', label: 'Spiegel', category: 'Technik', anchor: 'ground', scale: [2.4, 2.4, 1],
    defaults: { name: 'Spiegel', material: { preset: 'spiegel', mirror: true }, physics: solid } },
  { key: 'waterfall', ref: 'EntitySpec.waterfall', label: 'Wasserfall', category: 'Natur', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Wasserfall', material: { color: '#a8def5' }, physics: { mode: 'none' } } },
  // Freiform: gekrümmte Flächen aus Parametern (shared/freeform). Ursprung am Boden.
  { key: 'freeform-arc-wall', ref: 'EntitySpec.freeform', label: 'Freiform: Bogenwand', category: 'Freiform', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Bogenwand', material: { preset: 'holz' }, physics: solid,
      state: { kind: 'sweep', path: [{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], height: 2.4, thickness: 0.2 } } },
  { key: 'freeform-bowl', ref: 'EntitySpec.freeform', label: 'Freiform: Schale (Drehkörper)', category: 'Freiform', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Schale', material: { color: '#d8c7a0', preset: 'lack' }, physics: solid,
      state: { kind: 'lathe', profile: [[0, 0], [0.5, 0], [0.9, 0.3], [1.2, 0.7], [1.3, 0.8]], segments: 48 } } },
  { key: 'freeform-canopy', ref: 'EntitySpec.freeform', label: 'Freiform: Decke (Fläche)', category: 'Freiform', anchor: 'ground', scale: [1, 1, 1],
    defaults: { name: 'Decke', material: { color: '#9bb7d4' }, physics: solid,
      state: { kind: 'patch', degree: 2, thickness: 0.1, subdivisions: [24, 24], grid: [
        [[0, 2, 0], [2, 3, 0], [4, 2, 0]],
        [[0, 2.8, 2], [2, 4, 2], [4, 2.8, 2]],
        [[0, 2, 4], [2, 3, 4], [4, 2, 4]],
      ] } } },
];

export function getCatalogItem(key: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.key === key);
}
export function catalogRefs(): string[] {
  return [...new Set(CATALOG.map((item) => item.ref))];
}
export function labelForRef(ref: string): string {
  if (ref === 'EntitySpec.freeform') return 'Freiform';
  return CATALOG.find((item) => item.ref === ref && item.key === ref.replace('EntitySpec.', ''))?.label ?? CATALOG.find((item) => item.ref === ref)?.label ?? ref;
}

/** Erzeugt eine neue Entity aus einem Katalogeintrag; `pos` ist der Auflagepunkt auf der Fläche. */
export function createFromItem(item: CatalogItem, surface: Vec3, y: number): EntitySpec {
  const entity: EntitySpec = {
    id: newEntityId(),
    ref: item.ref,
    transform: { pos: [surface[0], y, surface[2]], rot: [0, 0, 0, 1], scale: [...item.scale] },
    ...structuredClone(item.defaults),
  };
  if (!entity.name) entity.name = item.label;
  // Medien-Tafeln zeigen mit ihrer Vorderseite nach +Z; die Standardkamera blickt von -Z, daher um 180° um Y gedreht.
  if (item.category === 'Medien' && item.ref.startsWith('EntitySpec.media-')) entity.transform.rot = [0, 1, 0, 0];
  return entity;
}
