/**
 * Reine Logik der Bibliothek (ohne Browser-Abhängigkeiten, daher gut testbar):
 * Gruppen, Fußpunkt-Normalisierung, Platzierung, Suche, Datei-Prüfung, KI-Antwort.
 */
import { LIBRARY_LIMITS, type LibraryFile, type LibraryItem, type LibraryItemMeta } from '../../shared/library';
import { newEntityId, type EntitySpec, type Quat, type Vec3 } from '../../shared/types';
import { entitySchema } from '../../shared/worldspec/schema';

/** Halbe Höhe der Grundformen bei Skalierung 1 (Ursprung = Mitte der Form). */
const PRIMITIVE_HALF_HEIGHT: Record<string, number> = {
  'EntitySpec.box': 0.5,
  'EntitySpec.sphere': 0.5,
  'EntitySpec.cylinder': 0.5,
  'EntitySpec.cone': 0.5,
  'EntitySpec.plane': 0.025,
  'EntitySpec.torus': 0.15,
};

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
export function yawQuat(degrees: number): Quat {
  const half = (degrees * Math.PI) / 360;
  return [0, Math.sin(half), 0, Math.cos(half)];
}
/** Drehung eines Vektors um die Y-Achse (Grad); positiv = gleiche Richtung wie `yawQuat`. */
export function rotateY(v: Vec3, degrees: number): Vec3 {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/**
 * Höhe der Unterkante einer Entity in Weltkoordinaten (Heuristik):
 * - Grundformen (Würfel, Kugel, Zylinder, Kegel, Platte, Ring): Ursprung = Mitte, Unterkante = pos.y minus halbe
 *   Höhe aus der Skalierung (bei Drehung wird die senkrechte Ausdehnung des gedrehten Quaders genommen).
 * - alle anderen Verweise (Bank, Baum, Laterne, Modell …): Ursprung liegt am Boden, Unterkante = pos.y.
 */
export function entityBottomY(entity: EntitySpec): number {
  const { pos, scale, rot } = entity.transform;
  const half = PRIMITIVE_HALF_HEIGHT[entity.ref];
  if (half === undefined) return pos[1];
  const [x, y, z, w] = rot;
  // Zweite Zeile der Rotationsmatrix: wie stark die lokalen Achsen nach oben zeigen.
  const row: Vec3 = [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)];
  const ext = Math.abs(row[0]) * (Math.abs(scale[0]) * 0.5) + Math.abs(row[1]) * (Math.abs(scale[1]) * half) + Math.abs(row[2]) * (Math.abs(scale[2]) * 0.5);
  return pos[1] - ext;
}

/** Erweitert die IDs um alle Mitglieder ihrer Gruppen; behält die Reihenfolge der Welt bei. */
export function expandGroups(ids: string[], entities: Record<string, EntitySpec>): string[] {
  const wanted = new Set(ids.filter((id) => entities[id]));
  const groups = new Set<string>();
  for (const id of wanted) {
    const g = entities[id]?.group;
    if (g) groups.add(g);
  }
  if (groups.size === 0) return [...wanted];
  const result = new Set(wanted);
  for (const entity of Object.values(entities)) if (entity.group && groups.has(entity.group)) result.add(entity.id);
  return [...result];
}

/** Fußpunkt (x/z-Mitte der Positionen) und Bodenhöhe (tiefste Unterkante). */
export function computePivot(entities: EntitySpec[]): { x: number; z: number; bottom: number } {
  if (entities.length === 0) return { x: 0, z: 0, bottom: 0 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, bottom = Infinity;
  for (const e of entities) {
    const [px, , pz] = e.transform.pos;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
    bottom = Math.min(bottom, entityBottomY(e));
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, bottom };
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** Kopiert und normalisiert Entities für einen Baustein (relative Positionen, lokale IDs, ohne Gruppen). */
export function normalizeForItem(source: EntitySpec[]): EntitySpec[] {
  const pivot = computePivot(source);
  return source.map((entity, index) => {
    const copy = structuredClone(entity) as EntitySpec;
    copy.id = `p${index + 1}`;
    delete copy.group;
    delete copy.groupName;
    const [x, y, z] = entity.transform.pos;
    copy.transform.pos = [round(x - pivot.x), round(y - pivot.bottom), round(z - pivot.z)];
    return copy;
  });
}

/** Erzeugt neue Entities aus Bausteinteilen (neue IDs, Drehung um den Fußpunkt, Versatz nach `at`). */
export function instantiateItem(entities: EntitySpec[], at: Vec3, yawDegrees: number, groupName: string, makeId: () => string = newEntityId): EntitySpec[] {
  const group = entities.length > 1 ? makeId() : undefined;
  const q = yawQuat(yawDegrees);
  return entities.map((source) => {
    const copy = structuredClone(source) as EntitySpec;
    copy.id = makeId();
    const rel = rotateY(source.transform.pos, yawDegrees);
    copy.transform.pos = [at[0] + rel[0], at[1] + rel[1], at[2] + rel[2]];
    if (yawDegrees % 360 !== 0) copy.transform.rot = quatMul(q, source.transform.rot);
    if (group) {
      copy.group = group;
      copy.groupName = groupName;
    } else {
      delete copy.group;
      delete copy.groupName;
    }
    return copy;
  });
}

// --- Suche ---------------------------------------------------------------------------------

export function toMeta(item: LibraryItem): LibraryItemMeta {
  const { entities: _entities, ...meta } = item;
  void _entities;
  return { ...meta, count: item.entities.length };
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Sucht in Name, Beschreibung und Tags (alle Wörter müssen vorkommen); `tag` filtert zusätzlich exakt. */
export function filterItems<T extends LibraryItemMeta>(items: T[], query = '', tag?: string | null): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (tag && !item.tags.includes(tag)) return false;
    if (words.length === 0) return true;
    const hay = fold(`${item.name} ${item.description} ${item.tags.join(' ')}`);
    return words.every((w) => hay.includes(w));
  });
}
export function allTags(items: LibraryItemMeta[]): string[] {
  const set = new Set<string>();
  for (const item of items) for (const t of item.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, 'de'));
}

// --- Eingaben prüfen -----------------------------------------------------------------------

export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    const s = typeof t === 'string' ? t.trim().slice(0, 40) : '';
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, LIBRARY_LIMITS.maxTags);
}
export function parseTags(text: string): string[] {
  return cleanTags(text.split(/[,;]/));
}
export function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('Bitte einen Namen für den Baustein angeben.');
  if (trimmed.length > LIBRARY_LIMITS.maxNameLength) throw new Error(`Der Name darf höchstens ${LIBRARY_LIMITS.maxNameLength} Zeichen lang sein.`);
  return trimmed;
}

export function sanitizeEntity(raw: unknown): EntitySpec | null {
  const result = entitySchema.safeParse(raw);
  return result.success ? (result.data as EntitySpec) : null;
}

/** Prüft den Inhalt einer Bausteindatei. Wirft Error mit deutscher Meldung. */
export function parseLibraryFile(text: string): LibraryItem[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON und kann nicht als Baustein gelesen werden.');
  }
  const file = data as Partial<LibraryFile> | null;
  if (!file || typeof file !== 'object' || file.format !== 'cloudparty-library') throw new Error('Das ist keine Cloudparty-Bausteindatei (Format „cloudparty-library“ erwartet).');
  if (file.version !== 1) throw new Error(`Die Dateiversion ${String(file.version)} wird nicht unterstützt (erwartet: 1).`);
  if (!Array.isArray(file.items) || file.items.length === 0) throw new Error('Die Datei enthält keine Bausteine.');
  if (file.items.length > LIBRARY_LIMITS.maxItems) throw new Error(`Die Datei enthält zu viele Bausteine (höchstens ${LIBRARY_LIMITS.maxItems}).`);
  const now = Date.now();
  return file.items.map((raw, index) => {
    const where = `Baustein ${index + 1}`;
    const item = raw as Partial<LibraryItem> | null;
    if (!item || typeof item !== 'object') throw new Error(`${where}: ungültiger Eintrag.`);
    if (typeof item.name !== 'string') throw new Error(`${where}: Name fehlt.`);
    const name = validateName(item.name);
    if (!Array.isArray(item.entities) || item.entities.length === 0) throw new Error(`${where} („${name}“): enthält keine Objekte.`);
    if (item.entities.length > LIBRARY_LIMITS.maxEntitiesPerItem) throw new Error(`${where} („${name}“): zu viele Objekte (höchstens ${LIBRARY_LIMITS.maxEntitiesPerItem}).`);
    const entities: EntitySpec[] = [];
    for (const [i, e] of item.entities.entries()) {
      const clean = sanitizeEntity(e);
      if (!clean) throw new Error(`${where} („${name}“): Objekt ${i + 1} ist ungültig.`);
      entities.push(clean);
    }
    const thumbnail = typeof item.thumbnail === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(item.thumbnail) && item.thumbnail.length < 400_000 ? item.thumbnail : undefined;
    return {
      id: typeof item.id === 'string' && item.id ? item.id : newEntityId('lib'),
      name,
      description: typeof item.description === 'string' ? item.description.slice(0, 1000) : '',
      tags: cleanTags(item.tags),
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
      thumbnail,
      count: entities.length,
      entities,
    };
  });
}

// --- KI-Beschriftung -----------------------------------------------------------------------

export interface AiLabel {
  name: string;
  description: string;
  tags: string[];
}
/** Liest die Antwort der KI defensiv (reines JSON, Codeblock oder Text drumherum). */
export function parseAiLabel(text: string): AiLabel | null {
  const candidates: string[] = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) candidates.push(fenced[1]);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  candidates.push(text);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim()) as Record<string, unknown>;
      if (!obj || typeof obj !== 'object') continue;
      const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, LIBRARY_LIMITS.maxNameLength) : '';
      if (!name) continue;
      const tags = Array.isArray(obj.tags) ? cleanTags(obj.tags) : typeof obj.tags === 'string' ? parseTags(obj.tags) : [];
      return { name, description: typeof obj.description === 'string' ? obj.description.trim().slice(0, 300) : '', tags };
    } catch {
      /* nächster Kandidat */
    }
  }
  return null;
}

export function describeEntitiesForAi(entities: EntitySpec[]): string {
  return entities
    .slice(0, 60)
    .map((e) => `- ${e.name ?? e.ref} (${e.ref.replace('EntitySpec.', '')}${e.material?.color ? `, ${e.material.color}` : ''}${e.particles ? `, Partikel ${e.particles.preset}` : ''}${e.script || e.graph ? ', mit Skript' : ''})`)
    .join('\n');
}

export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return `${base || 'Baustein'}.cloudparty-baustein.json`;
}
