/** Prüfung und Bereinigung eines Freiform-States nach FREEFORM_LIMITS. Wirft `Error` mit deutscher Meldung bei Unbrauchbarem. */
import {
  FREEFORM_LIMITS as L,
  type CutOp,
  type FreeformState,
  type LatheParams,
  type PatchParams,
  type PathPoint,
  type SweepParams,
  type Vec2,
  type Vec3,
} from './types';

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Optionale Zahl: undefined/null → Standard; sonst endlich und geklemmt. */
function num(v: unknown, name: string, def: number, min: number, max: number): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Freiform: ${name} muss eine endliche Zahl sein.`);
  return Math.min(max, Math.max(min, v));
}

/** Pflichtzahl. */
function req(v: unknown, name: string, min: number, max: number): number {
  if (v === undefined || v === null) throw new Error(`Freiform: ${name} fehlt.`);
  return num(v, name, 0, min, max);
}

function vec2(v: unknown, name: string, min: number, max: number): Vec2 {
  if (!Array.isArray(v) || v.length < 2) throw new Error(`Freiform: ${name} muss [a, b] sein.`);
  return [num(v[0], name, 0, min, max), num(v[1], name, 0, min, max)];
}

function vec3(v: unknown, name: string, min: number, max: number): Vec3 {
  if (!Array.isArray(v) || v.length < 3) throw new Error(`Freiform: ${name} muss [x, y, z] sein.`);
  return [num(v[0], name, 0, min, max), num(v[1], name, 0, min, max), num(v[2], name, 0, min, max)];
}

function bool(v: unknown): boolean | undefined {
  return v === undefined || v === null ? undefined : !!v;
}

function sanitizeLathe(r: Rec): LatheParams {
  if (!Array.isArray(r.profile)) throw new Error('Freiform: Drehkörper braucht ein Profil (Liste von [Radius, y]).');
  if (r.profile.length < 2) throw new Error('Freiform: Das Profil braucht mindestens 2 Punkte.');
  if (r.profile.length > L.maxPoints) throw new Error(`Freiform: Das Profil hat höchstens ${L.maxPoints} Punkte.`);
  const profile = r.profile.map((q, i): Vec2 => {
    const [rad, y] = vec2(q, `profile[${i}]`, -L.maxSize, L.maxSize);
    return [Math.max(0, rad), y];
  });
  return {
    kind: 'lathe',
    profile,
    sweepDeg: num(r.sweepDeg, 'sweepDeg', 360, 1, 360),
    startDeg: num(r.startDeg, 'startDeg', 0, -360, 360),
    segments: Math.round(num(r.segments, 'segments', 48, 3, L.maxSegments)),
    ellipse: num(r.ellipse, 'ellipse', 1, 0.05, 20),
  };
}

function sanitizeSweep(r: Rec): SweepParams {
  if (!Array.isArray(r.path)) throw new Error('Freiform: Sweep braucht einen Pfad (Liste von Punkten).');
  const closed = bool(r.closedPath) ?? false;
  const minPts = closed ? 3 : 2;
  if (r.path.length < minPts) throw new Error(`Freiform: Der Pfad braucht mindestens ${minPts} Punkte${closed ? ' (geschlossen)' : ''}.`);
  if (r.path.length > L.maxPoints) throw new Error(`Freiform: Der Pfad hat höchstens ${L.maxPoints} Punkte.`);
  const path = r.path.map((q, i): PathPoint => {
    if (!isRec(q)) throw new Error(`Freiform: path[${i}] muss ein Objekt { p: [x, z], bulge? } sein.`);
    return { p: vec2(q.p, `path[${i}].p`, -L.maxSize, L.maxSize), bulge: num(q.bulge, `path[${i}].bulge`, 0, -L.maxSize, L.maxSize) };
  });
  const height = req(r.height, 'height', -Infinity, L.maxSize);
  if (height <= 0) throw new Error('Freiform: height muss größer als 0 sein.');
  const thickness = req(r.thickness, 'thickness', -Infinity, L.maxSize);
  if (thickness <= 0) throw new Error('Freiform: thickness (Dicke) muss größer als 0 sein.');
  const out: SweepParams = {
    kind: 'sweep',
    path,
    closedPath: closed,
    height,
    heightEnd: num(r.heightEnd, 'heightEnd', height, 0, L.maxSize),
    thickness,
    y0: num(r.y0, 'y0', 0, -L.maxSize, L.maxSize),
    segments: Math.round(num(r.segments, 'segments', 12, 1, L.maxSegments)),
  };
  if (r.wave !== undefined && r.wave !== null) {
    if (!isRec(r.wave)) throw new Error('Freiform: wave muss { amplitude, length } sein.');
    const length = req(r.wave.length, 'wave.length', -Infinity, L.maxSize);
    if (length <= 0) throw new Error('Freiform: wave.length muss größer als 0 sein.');
    out.wave = { amplitude: num(r.wave.amplitude, 'wave.amplitude', 0, -L.maxSize, L.maxSize), length: Math.max(0.02, length) };
  }
  return out;
}

function sanitizePatch(r: Rec): PatchParams {
  if (!Array.isArray(r.grid)) throw new Error('Freiform: Fläche braucht ein Gitter grid[zeile][spalte] aus [x, y, z].');
  const rows = r.grid.length;
  if (rows < 2) throw new Error('Freiform: Das Gitter braucht mindestens 2 Zeilen.');
  if (rows > L.maxGrid) throw new Error(`Freiform: Das Gitter hat höchstens ${L.maxGrid} Zeilen.`);
  const grid: Vec3[][] = r.grid.map((row, i) => {
    if (!Array.isArray(row)) throw new Error(`Freiform: grid[${i}] muss eine Liste von Punkten sein.`);
    if (row.length > L.maxGrid) throw new Error(`Freiform: Das Gitter hat höchstens ${L.maxGrid} Spalten.`);
    return row.map((q, k) => vec3(q, `grid[${i}][${k}]`, -L.maxSize, L.maxSize));
  });
  const cols = grid[0].length;
  if (cols < 2) throw new Error('Freiform: Das Gitter braucht mindestens 2 Spalten.');
  if (grid.some((row) => row.length !== cols)) throw new Error('Freiform: Alle Gitterzeilen müssen gleich viele Punkte haben.');
  const maxDeg = Math.min(3, rows - 1, cols - 1);
  const degree = Math.min(maxDeg, Math.round(num(r.degree, 'degree', 3, 1, 3))) as 1 | 2 | 3;
  let su = 24;
  let sv = 24;
  if (r.subdivisions !== undefined && r.subdivisions !== null) {
    const s = vec2(r.subdivisions, 'subdivisions', 1, L.maxSegments);
    su = Math.round(s[0]);
    sv = Math.round(s[1]);
  }
  while ((su + 1) * (sv + 1) * 2 > L.maxVertices && (su > 1 || sv > 1)) {
    if (su >= sv) su = Math.max(1, Math.floor(su / 2));
    else sv = Math.max(1, Math.floor(sv / 2));
  }
  return { kind: 'patch', grid, degree, thickness: num(r.thickness, 'thickness', 0, 0, L.maxSize), subdivisions: [su, sv] };
}

const CUT_EXAMPLE = '{"shape":"box","pos":[3,1,0],"size":[1.2,2.1,1],"rotY":0}';
const SHAPE_ALIASES: Record<string, CutOp['shape']> = {
  box: 'box', quader: 'box', rechteck: 'box', rect: 'box', cube: 'box', würfel: 'box', wuerfel: 'box', tür: 'box', fenster: 'box',
  cylinder: 'cylinder', zylinder: 'cylinder', rund: 'cylinder', rohr: 'cylinder',
  sphere: 'sphere', kugel: 'sphere',
};

/** Drei Zahlen aus einer Liste [x, y, z] oder einem Objekt ({x,y,z} / {width,height,depth} / {breite,hoehe,tiefe}); sonst undefined. */
function triple(v: unknown, keys: string[][]): Vec3 | undefined {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) return [v[0], v[1], v[2]];
  if (isRec(v)) {
    for (const set of keys) {
      const t = set.map((k) => v[k]);
      if (t.every((n) => typeof n === 'number' && Number.isFinite(n))) return t as Vec3;
    }
  }
  return undefined;
}

function sanitizeCut(raw: unknown, i: number): CutOp {
  const where = `Freiform: cuts[${i}]`;
  if (!isRec(raw)) throw new Error(`${where} muss ein Objekt sein. Richtig ist z. B. ${CUT_EXAMPLE}`);
  const problems: string[] = [];
  const rawShape = typeof raw.shape === 'string' ? raw.shape.trim().toLowerCase() : '';
  const shape = SHAPE_ALIASES[rawShape];
  if (!shape) problems.push(`shape ${raw.shape === undefined ? 'fehlt' : `„${String(raw.shape).slice(0, 30)}“ ist unbekannt`} (erlaubt: box, cylinder, sphere)`);
  const size = triple(raw.size ?? raw.groesse ?? raw.größe ?? raw.dimensions, [['x', 'y', 'z'], ['width', 'height', 'depth'], ['breite', 'hoehe', 'tiefe'], ['breite', 'höhe', 'tiefe']]) ?? (typeof raw.width === 'number' && typeof raw.height === 'number' && typeof raw.depth === 'number' ? ([raw.width, raw.height, raw.depth] as Vec3) : undefined);
  if (!size) problems.push('size fehlt oder ist keine Liste aus 3 Zahlen [Breite, Höhe, Tiefe] in m');
  else if (size.some((s) => s <= 0 || s > L.maxSize)) problems.push(`size muss in jeder Richtung zwischen 0 und ${L.maxSize} m liegen (angegeben: ${size.join(', ')})`);
  const pos = triple(raw.pos ?? raw.position ?? raw.center ?? raw.mitte, [['x', 'y', 'z']]);
  if (!pos) problems.push('pos fehlt oder ist keine Liste aus 3 Zahlen [x, y, z] (Mitte des Schnitts in m, relativ zum Fußpunkt der Freiform)');
  else if (pos.some((p) => Math.abs(p) > L.maxSize)) problems.push(`pos liegt außerhalb von ±${L.maxSize} m`);
  const rotRaw = raw.rotY ?? raw.rot_y ?? raw.rotation ?? raw.rotY_degrees ?? raw.rotation_degrees;
  let rotY = 0;
  if (rotRaw !== undefined && rotRaw !== null) {
    if (typeof rotRaw !== 'number' || !Number.isFinite(rotRaw) || Math.abs(rotRaw) > 360) problems.push('rotY muss eine Zahl zwischen −360 und 360 (Grad um die Senkrechte) sein');
    else rotY = rotRaw;
  }
  if (problems.length > 0) throw new Error(`${where} ist ungültig: ${problems.join('; ')}. Erhalten: ${JSON.stringify(raw).slice(0, 140)}. Richtig ist z. B. ${CUT_EXAMPLE} (pos = Mitte, size = [Breite, Höhe, Tiefe]).`);
  return { shape: shape as CutOp['shape'], pos: pos as Vec3, size: size as Vec3, rotY };
}

/** Prüft und klemmt einen Freiform-State (Zahlen endlich, Punktzahlen und Maße begrenzt); wirft einen verständlichen Fehler bei Unbrauchbarem. Gibt eine bereinigte Kopie zurück. */
export function sanitizeFreeformState(raw: unknown): FreeformState {
  if (!isRec(raw)) throw new Error('Freiform: state fehlt.');
  let shape: FreeformState;
  switch (raw.kind) {
    case 'lathe':
      shape = sanitizeLathe(raw);
      break;
    case 'sweep':
      shape = sanitizeSweep(raw);
      break;
    case 'patch':
      shape = sanitizePatch(raw);
      break;
    default:
      throw new Error('Freiform: kind muss lathe, sweep oder patch sein.');
  }
  if (raw.cuts !== undefined && raw.cuts !== null) {
    if (!Array.isArray(raw.cuts)) throw new Error('Freiform: cuts muss eine Liste sein.');
    if (raw.cuts.length > L.maxCuts) throw new Error(`Freiform: höchstens ${L.maxCuts} Schnitte erlaubt.`);
    if (raw.cuts.length > 0) shape.cuts = raw.cuts.map(sanitizeCut);
  }
  return shape;
}
