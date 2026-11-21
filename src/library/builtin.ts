/** Mitgelieferte Bausteine, gebaut aus Prefabs (keine externen Dateien). Alle Teile stehen auf y = 0. */
import type { LibraryItem } from '../../shared/library';
import type { EntitySpec, Quat, Vec3 } from '../../shared/types';
import { createEntityFromPrefab } from '../world/entities/prefabs';
import { normalizeForItem, yawQuat } from './logic';

type Shape = 'box' | 'cylinder' | 'cone' | 'sphere';
interface PrimOpts {
  /** Unterkante (Höhe über dem Boden). */
  y?: number;
  rot?: Quat;
  emissive?: string;
  alpha?: number;
  name?: string;
  physics?: 'none' | 'static';
  particles?: EntitySpec['particles'];
  script?: string;
  state?: Record<string, unknown>;
}

const rotX = (deg: number): Quat => {
  const h = (deg * Math.PI) / 360;
  return [Math.sin(h), 0, 0, Math.cos(h)];
};
const rotZ = (deg: number): Quat => {
  const h = (deg * Math.PI) / 360;
  return [0, 0, Math.sin(h), Math.cos(h)];
};

/** Grundform mit Maßen `size` (Meter), Mitte bei x/z, Unterkante bei `y`. */
function prim(shape: Shape, x: number, z: number, size: Vec3, color: string, o: PrimOpts = {}): EntitySpec {
  const e = createEntityFromPrefab(`EntitySpec.${shape}`, [x, 0, z]);
  e.transform.scale = [...size];
  e.transform.pos = [x, (o.y ?? 0) + size[1] / 2, z];
  if (o.rot) e.transform.rot = o.rot;
  e.material = { color, ...(o.emissive ? { emissive: o.emissive } : {}), ...(o.alpha !== undefined ? { alpha: o.alpha } : {}) };
  if (o.name) e.name = o.name;
  e.physics = { mode: o.physics ?? 'static' };
  if (o.particles) e.particles = o.particles;
  if (o.script) e.script = { source: o.script, enabled: true };
  if (o.state) e.state = o.state;
  return e;
}
/** Zusammengesetztes Prefab (Ursprung am Boden). */
function part(ref: string, x: number, z: number, o: { y?: number; yaw?: number; scale?: number | Vec3; color?: string; state?: Record<string, unknown>; name?: string } = {}): EntitySpec {
  const e = createEntityFromPrefab(`EntitySpec.${ref}`, [x, o.y ?? 0, z]);
  if (o.yaw) e.transform.rot = yawQuat(o.yaw);
  if (o.scale !== undefined) e.transform.scale = typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : [...o.scale];
  if (o.color) e.material = { ...(e.material ?? {}), color: o.color };
  if (o.state) e.state = { ...(e.state ?? {}), ...o.state };
  if (o.name) e.name = o.name;
  return e;
}


function gartenhaus(): EntitySpec[] {
  const wall = '#f1e6d0';
  const wood = '#8a5a34';
  const out: EntitySpec[] = [
    prim('box', 0, 0, [4.4, 0.15, 3.9], '#8f8a80', { name: 'Fundament' }),
    prim('box', 0, -1.8, [4, 2.4, 0.2], wall, { y: 0.15, name: 'Rückwand' }),
    prim('box', -1.9, 0, [0.2, 2.4, 3.6], wall, { y: 0.15, name: 'Wand links' }),
    prim('box', 1.9, 0, [0.2, 2.4, 3.6], wall, { y: 0.15, name: 'Wand rechts' }),
    prim('box', -1.25, 1.8, [1.5, 2.4, 0.2], wall, { y: 0.15, name: 'Front links' }),
    prim('box', 1.25, 1.8, [1.5, 2.4, 0.2], wall, { y: 0.15, name: 'Front rechts' }),
    prim('box', 0, 1.8, [1.0, 0.5, 0.2], wall, { y: 2.05, name: 'Türsturz' }),
    prim('box', -0.55, 1.86, [0.1, 1.9, 0.12], wood, { y: 0.15, name: 'Türrahmen' }),
    prim('box', 0.55, 1.86, [0.1, 1.9, 0.12], wood, { y: 0.15, name: 'Türrahmen' }),
    prim('box', 0, 1.86, [1.2, 0.1, 0.12], wood, { y: 2.05, name: 'Türrahmen oben' }),
    prim('box', -1.99, 0, [0.04, 0.8, 1.1], '#bfe3ff', { y: 1.0, emissive: '#35546e', alpha: 0.85, name: 'Fenster', physics: 'none' }),
    prim('box', 1.99, 0, [0.04, 0.8, 1.1], '#bfe3ff', { y: 1.0, emissive: '#35546e', alpha: 0.85, name: 'Fenster', physics: 'none' }),
    prim('box', -2.12, 0, [0.28, 0.22, 1.3], '#7a4a2a', { y: 0.75, name: 'Blumenkasten' }),
    prim('box', 2.12, 0, [0.28, 0.22, 1.3], '#7a4a2a', { y: 0.75, name: 'Blumenkasten' }),
  ];
  const flowers = ['#ff5d73', '#ffd23f', '#ff8fd1'];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) out.push(prim('sphere', sx * 2.12, -0.45 + i * 0.45, [0.2, 0.2, 0.2], flowers[(i + (sx > 0 ? 1 : 0)) % 3], { y: 0.97, name: 'Blume', physics: 'none' }));
  }
  // Satteldach: zwei geneigte Platten
  out.push(prim('box', -1.15, 0, [2.75, 0.14, 4.3], '#b5472f', { y: 2.9, rot: rotZ(28), name: 'Dach links' }));
  out.push(prim('box', 1.15, 0, [2.75, 0.14, 4.3], '#b5472f', { y: 2.9, rot: rotZ(-28), name: 'Dach rechts' }));
  out[out.length - 2].transform.pos = [-1.16, 3.15, 0];
  out[out.length - 1].transform.pos = [1.16, 3.15, 0];
  // Giebelflächen unter dem Dach (Stufen, die der Dachschräge folgen)
  for (const z of [1.8, -1.8]) {
    const steps: [number, number, number][] = [[2.55, 0.25, 3.3], [2.8, 0.25, 2.4], [3.05, 0.25, 1.46], [3.3, 0.25, 0.5]];
    for (const [y, h, w] of steps) out.push(prim('box', 0, z, [w, h, 0.2], wall, { y, name: 'Giebel' }));
  }
  out.push(prim('box', 0, 2.3, [1.4, 0.06, 0.9], '#a79f93', { y: 0.01, name: 'Trittstein' }));
  return out;
}

function brunnen(): EntitySpec[] {
  return [
    prim('cylinder', 0, 0, [2.8, 0.7, 2.8], '#9a9da3', { name: 'Brunnenrand' }),
    prim('cylinder', 0, 0, [2.3, 0.05, 2.3], '#3f9be0', { y: 0.55, alpha: 0.8, emissive: '#0f3a63', name: 'Wasser', physics: 'none' }),
    prim('cylinder', 0, 0, [0.5, 1.7, 0.5], '#aeb1b7', { name: 'Säule' }),
    prim('cylinder', 0, 0, [1.3, 0.14, 1.3], '#9a9da3', { y: 1.4, name: 'Obere Schale' }),
    prim('cylinder', 0, 0, [1.05, 0.04, 1.05], '#3f9be0', { y: 1.5, alpha: 0.8, emissive: '#0f3a63', name: 'Wasser oben', physics: 'none' }),
    prim('sphere', 0, 0, [0.4, 0.4, 0.4], '#bcbfc5', { y: 1.7, name: 'Kugel' }),
  ];
}

function baumgruppe(): EntitySpec[] {
  return [
    part('tree', 0, 0, { scale: 1.2, name: 'Baum' }),
    part('tree', 3.2, 1.4, { scale: 0.9, name: 'Baum', state: { variant: 1 } }),
    part('tree', -2.8, 2.2, { scale: 1.0, name: 'Baum', state: { variant: 2 } }),
    part('tree', 1.2, -3.0, { scale: 0.8, name: 'Baum' }),
    part('rock', -1.2, 0.9, { scale: 0.7, name: 'Fels' }),
    part('rock', 2.2, -0.9, { scale: 0.5, name: 'Fels' }),
  ];
}

function lagerfeuer(): EntitySpec[] {
  const out: EntitySpec[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push(part('rock', Math.cos(a) * 1.0, Math.sin(a) * 1.0, { scale: [0.38, 0.32, 0.38], name: 'Stein' }));
  }
  out.push(prim('cylinder', 0, 0, [0.16, 1.0, 0.16], '#5b3a22', { y: 0.12, rot: rotZ(75), name: 'Holzscheit' }));
  out.push(prim('cylinder', 0, 0, [0.16, 1.0, 0.16], '#6a4528', { y: 0.12, rot: rotX(75), name: 'Holzscheit' }));
  out.push(prim('cylinder', 0, 0, [0.14, 0.9, 0.14], '#523620', { y: 0.2, rot: rotZ(-60), name: 'Holzscheit' }));
  out.push(prim('sphere', 0, 0, [0.5, 0.35, 0.5], '#ff7a2a', { y: 0.2, emissive: '#ff5a10', name: 'Flamme', physics: 'none', particles: { preset: 'fire', enabled: true } }));
  const light = part('light', 0, 0, { name: 'Feuerschein', color: '#ff9a45', state: { intensity: 1.3, range: 12 } });
  light.transform.pos = [0, 0.9, 0];
  out.push(light);
  return out;
}

function pavillon(): EntitySpec[] {
  const out: EntitySpec[] = [prim('cylinder', 0, 0, [5.6, 0.25, 5.6], '#c9c2b4', { name: 'Boden' })];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    out.push(prim('cylinder', Math.cos(a) * 2.4, Math.sin(a) * 2.4, [0.28, 2.6, 0.28], '#f1ece0', { y: 0.25, name: 'Säule' }));
  }
  out.push(prim('cylinder', 0, 0, [5.4, 0.2, 5.4], '#f1ece0', { y: 2.85, name: 'Gesims' }));
  out.push(prim('cone', 0, 0, [6.4, 1.8, 6.4], '#3f7f6a', { y: 3.05, name: 'Dach' }));
  out.push(prim('sphere', 0, 0, [0.3, 0.3, 0.3], '#e2c15a', { y: 4.85, name: 'Spitze' }));
  out.push(part('bench', 0, -1.2, { y: 0.25, yaw: 0, name: 'Bank' }));
  out.push(part('bench', 0, 1.2, { y: 0.25, yaw: 180, name: 'Bank' }));
  return out;
}

function laternenallee(): EntitySpec[] {
  const out: EntitySpec[] = [prim('box', 0, 0, [1.6, 0.05, 13.2], '#cdbd9a', { name: 'Weg' })];
  for (let i = 0; i < 5; i++) out.push(part('lantern', i % 2 === 0 ? -1.25 : 1.25, -6 + i * 3, { name: 'Laterne' }));
  return out;
}

function sitzecke(): EntitySpec[] {
  return [
    prim('box', 0, 0, [4.4, 0.04, 3.8], '#b6483f', { name: 'Teppich', physics: 'none' }),
    part('table', 0, 0, { y: 0.04, name: 'Tisch' }),
    part('bench', 0, 1.25, { y: 0.04, name: 'Bank' }),
    part('chair', 0, -1.1, { y: 0.04, yaw: 180, name: 'Stuhl' }),
    part('chair', 1.5, 0, { y: 0.04, yaw: 90, name: 'Stuhl' }),
    part('chair', -1.5, 0, { y: 0.04, yaw: -90, name: 'Stuhl' }),
  ];
}

function wegweiser(): EntitySpec[] {
  const out: EntitySpec[] = [prim('cylinder', 0, 0, [0.7, 0.15, 0.7], '#8d8f93', { name: 'Sockel' }), prim('box', 0, 0, [0.16, 2.8, 0.16], '#6b4a2b', { y: 0.15, name: 'Pfosten' })];
  const boards: [number, number, string][] = [[2.5, 20, '#d9a05b'], [2.05, -35, '#e07a5f'], [1.6, 70, '#6fb3d9']];
  for (const [y, yaw, color] of boards) {
    const q = yawQuat(yaw);
    const rotate = (x: number, z: number): [number, number] => [x * Math.cos((yaw * Math.PI) / 180) + z * Math.sin((yaw * Math.PI) / 180), -x * Math.sin((yaw * Math.PI) / 180) + z * Math.cos((yaw * Math.PI) / 180)];
    const [bx, bz] = rotate(0.6, 0);
    out.push(prim('box', bx, bz, [1.2, 0.3, 0.06], color, { y, rot: q, name: 'Wegschild' }));
    const [tx, tz] = rotate(1.3, 0);
    out.push(prim('cone', tx, tz, [0.3, 0.3, 0.06], color, { y, rot: quatMulZ(q), name: 'Pfeilspitze' }));
  }
  return out;
}
/** Kegel liegend nach +x ausrichten (um z drehen), danach Gier. */
function quatMulZ(yaw: Quat): Quat {
  const z = rotZ(-90);
  const [ax, ay, az, aw] = yaw;
  const [bx, by, bz, bw] = z;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

function rutsche(): EntitySpec[] {
  const wood = '#c98a4b';
  const red = '#e0483a';
  const out: EntitySpec[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(prim('box', sx * 0.65, sz * 0.65, [0.14, 1.7, 0.14], wood, { name: 'Pfosten' }));
  out.push(prim('box', 0, 0, [1.5, 0.12, 1.5], '#e5b04a', { y: 1.65, name: 'Plattform' }));
  for (const sx of [-1, 1]) out.push(prim('box', sx * 0.7, 0, [0.06, 0.6, 1.4], red, { y: 1.77, name: 'Geländer' }));
  out.push(prim('box', 0, -0.7, [1.4, 0.6, 0.06], red, { y: 1.77, name: 'Geländer' }));
  // Rutsche (nach +z geneigt)
  const len = 3.3;
  const rise = 1.7;
  const theta = (Math.asin(rise / len) * 180) / Math.PI;
  const run = Math.sqrt(len * len - rise * rise);
  const slide = prim('box', 0, 0.75 + run / 2, [0.9, 0.08, len], '#3da5e0', { rot: rotX(theta), name: 'Rutsche' });
  slide.transform.pos = [0, 1.7 - rise / 2 + 0.02, 0.75 + run / 2];
  out.push(slide);
  for (const sx of [-1, 1]) {
    const edge = prim('box', sx * 0.48, 0.75 + run / 2, [0.06, 0.2, len], red, { rot: rotX(theta), name: 'Rutschenrand' });
    edge.transform.pos = [sx * 0.48, 1.7 - rise / 2 + 0.12, 0.75 + run / 2];
    out.push(edge);
  }
  // Leiter auf der Rückseite
  for (const sx of [-1, 1]) out.push(prim('box', sx * 0.3, -1.1, [0.07, 1.7, 0.07], wood, { name: 'Leiterholm', rot: rotX(12) }));
  for (let i = 0; i < 5; i++) out.push(prim('box', 0, -1.1 + (0.25 + i * 0.32 - 0.85) * 0.21, [0.6, 0.06, 0.06], wood, { y: 0.25 + i * 0.32, name: 'Sprosse' }));
  return out;
}

const DISCO_COLORS = ['#ff3b6b', '#ffb02e', '#3bd16f', '#2ea8ff', '#a45bff'];
const DISCO_SCRIPT = (offset: number) => `// Farbwechsel-Kachel: wechselt alle 0,7 Sekunden die Farbe
const farben = ${JSON.stringify(DISCO_COLORS).replace(/"/g, "'")};
let i = ${offset};
function wechseln() {
  i = (i + 1) % farben.length;
  self.setColor(farben[i]);
  self.setEmissive(farben[i]);
}
function onStart() {
  wechseln();
  setInterval(wechseln, 700);
}
`;
function discoBoden(): EntitySpec[] {
  const out: EntitySpec[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const k = (r + c) % 5;
      out.push(prim('box', (c - 1) * 1.05, (r - 1) * 1.05, [1.0, 0.12, 1.0], DISCO_COLORS[k], { name: 'Disco-Kachel', script: DISCO_SCRIPT(k), emissive: DISCO_COLORS[k] }));
    }
  return out;
}

const CONFETTI_SCRIPT = `// Konfetti-Knopf: Klick lässt es 4 Sekunden Konfetti regnen
let aktiv = false;
function onClick(avatar) {
  if (aktiv) return;
  aktiv = true;
  self.setParticles(true, 'confetti');
  world.playSound('pop');
  setTimeout(function () {
    self.setParticles(false, 'confetti');
    aktiv = false;
  }, 4000);
}
`;
function konfettiKnopf(): EntitySpec[] {
  return [
    prim('cylinder', 0, 0, [0.8, 0.9, 0.8], '#6c7a89', { name: 'Sockel' }),
    prim('cylinder', 0, 0, [0.6, 0.12, 0.6], '#f5d142', { y: 0.9, name: 'Ring' }),
    prim('cylinder', 0, 0, [0.46, 0.14, 0.46], '#ff3b5c', { y: 1.02, emissive: '#7a0f24', name: 'Konfetti-Knopf', script: CONFETTI_SCRIPT, particles: { preset: 'confetti', enabled: false } }),
  ];
}

function blumenbeet(): EntitySpec[] {
  const out: EntitySpec[] = [prim('box', 0, 0, [3.0, 0.3, 1.4], '#7a5a3a', { name: 'Beetrand' }), prim('box', 0, 0, [2.8, 0.06, 1.2], '#4a2f1d', { y: 0.28, name: 'Erde', physics: 'none' })];
  const colors = ['#ff5d73', '#ffd23f', '#ff8fd1', '#8e6bd8', '#ffffff'];
  for (let i = 0; i < 12; i++) {
    const x = -1.2 + (i % 6) * 0.48;
    const z = i < 6 ? -0.28 : 0.28;
    out.push(prim('cylinder', x, z, [0.04, 0.4, 0.04], '#3f8a3a', { y: 0.3, physics: 'none', name: 'Stiel' }));
    out.push(prim('sphere', x, z, [0.22, 0.22, 0.22], colors[i % colors.length], { y: 0.66, physics: 'none', name: 'Blüte' }));
  }
  return out;
}

function zaun(): EntitySpec[] {
  const out: EntitySpec[] = [];
  for (let i = 0; i < 6; i++) out.push(prim('box', -2.5 + i, 0, [0.12, 1.1, 0.12], '#9b6b3e', { name: 'Zaunpfosten' }));
  for (const y of [0.3, 0.75]) out.push(prim('box', 0, 0, [5.1, 0.1, 0.06], '#b98550', { y, name: 'Zaunlatte' }));
  return out;
}

interface Def {
  id: string;
  name: string;
  description: string;
  tags: string[];
  build: () => EntitySpec[];
}
const DEFS: Def[] = [
  { id: 'builtin-gartenhaus', name: 'Gartenhaus', description: 'Kleines Haus mit Satteldach, Türöffnung und Blumenkästen unter den Fenstern.', tags: ['Gebäude', 'Haus'], build: gartenhaus },
  { id: 'builtin-brunnen', name: 'Brunnen', description: 'Steinbrunnen mit zwei Wasserschalen.', tags: ['Deko', 'Natur'], build: brunnen },
  { id: 'builtin-baumgruppe', name: 'Baumgruppe', description: 'Vier Bäume und zwei Felsen.', tags: ['Natur'], build: baumgruppe },
  { id: 'builtin-lagerfeuer', name: 'Lagerfeuer', description: 'Feuerstelle mit Flammen, Funkenflug und warmem Licht.', tags: ['Licht', 'Natur', 'Effekt'], build: lagerfeuer },
  { id: 'builtin-pavillon', name: 'Pavillon', description: 'Sechseckiger Pavillon mit zwei Bänken.', tags: ['Gebäude', 'Deko'], build: pavillon },
  { id: 'builtin-laternenallee', name: 'Laternenallee', description: 'Weg mit fünf Laternen.', tags: ['Licht', 'Deko'], build: laternenallee },
  { id: 'builtin-sitzecke', name: 'Sitzecke', description: 'Tisch mit Bank, drei Stühlen und Teppich.', tags: ['Möbel'], build: sitzecke },
  { id: 'builtin-wegweiser', name: 'Wegweiser', description: 'Pfosten mit drei Richtungsschildern.', tags: ['Deko'], build: wegweiser },
  { id: 'builtin-rutsche', name: 'Spielplatz-Rutsche', description: 'Turm mit Leiter und Rutsche.', tags: ['Spielplatz'], build: rutsche },
  { id: 'builtin-disco', name: 'Disco-Boden', description: 'Neun Kacheln, die per Skript ihre Farbe wechseln.', tags: ['Skript', 'Effekt', 'Party'], build: discoBoden },
  { id: 'builtin-konfetti', name: 'Konfetti-Knopf', description: 'Ein Klick auf den roten Knopf lässt Konfetti regnen (Skript).', tags: ['Skript', 'Effekt', 'Party'], build: konfettiKnopf },
  { id: 'builtin-blumenbeet', name: 'Blumenbeet', description: 'Beet mit bunten Blumen.', tags: ['Natur', 'Deko'], build: blumenbeet },
  { id: 'builtin-zaun', name: 'Zaun', description: 'Fünf Meter Holzzaun.', tags: ['Deko'], build: zaun },
];

let cache: LibraryItem[] | null = null;
/** Alle mitgelieferten Bausteine (einmal gebaut, danach aus dem Speicher). */
export function builtinItems(): LibraryItem[] {
  if (!cache) {
    cache = DEFS.map((def) => {
      const entities = normalizeForItem(def.build());
      return { id: def.id, name: def.name, description: def.description, tags: def.tags, createdAt: 0, updatedAt: 0, builtin: true, count: entities.length, entities };
    });
  }
  return cache;
}
