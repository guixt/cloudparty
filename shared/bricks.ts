/**
 * Klemmbaustein-Maßsystem (rein, ohne Engine): Noppenraster, Höhen in Platten, Stapelhöhe.
 * 1 Noppe = 0,25 m; Platte = 0,1 m hoch, Stein = 3 Platten (0,3 m). Ursprung eines Steins:
 * Mitte der Grundfläche, Unterkante (wie die zusammengesetzten Bausteine).
 */
export const STUD = 0.25;
export const PLATE_H = 0.1;
export const STUD_DIAMETER = 0.15;
export const STUD_HEIGHT = 0.06;
export const BRICK_REF = 'EntitySpec.brick';
export const MAX_BRICK_STUDS = 16;

/**
 * Arten: stein, platte, fliese (glatt), schraeg (Schrägstein, Noppen nur hinten), bogen (abgerundete Schräge),
 * schraeg_um (umgedrehte Schräge), viertel (Viertelrundung, w = d), bogenlauf (Radlauf: Länge d ≥ 4, Dicke w),
 * rund (Rundstein, w = d), rundplatte (runde Platte, w = d), kuppel (Halbkugel, w = d), rad (Rad: Achse längs x, Breite 1, Durchmesser d).
 */
export type BrickKind = 'stein' | 'platte' | 'fliese' | 'schraeg' | 'bogen' | 'schraeg_um' | 'viertel' | 'bogenlauf' | 'rund' | 'rundplatte' | 'kuppel' | 'rad';
export const BRICK_KINDS: readonly BrickKind[] = ['stein', 'platte', 'fliese', 'schraeg', 'bogen', 'schraeg_um', 'viertel', 'bogenlauf', 'rund', 'rundplatte', 'kuppel', 'rad'];

/** Höhe in Platten (Stein 3, Platte, Fliese und Rundplatte 1; Rad und Kuppel nach Größe). */
export function kindPlates(kind: BrickKind, d = 2): number {
  if (kind === 'rad') return Math.round(d * (STUD / PLATE_H)); // Durchmesser d Noppen
  if (kind === 'kuppel') return Math.max(2, Math.round((d * STUD) / 2 / PLATE_H)); // Halbkugel: Höhe = Radius
  return kind === 'platte' || kind === 'fliese' || kind === 'rundplatte' ? 1 : 3;
}
export function kindHasStuds(kind: BrickKind): boolean {
  return kind !== 'fliese' && kind !== 'rad' && kind !== 'kuppel';
}

export interface BrickState {
  w: number;
  d: number;
  kind: BrickKind;
  /** false = ganz ohne Noppen (verdeckte Lagen). */
  studs: boolean;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Liest `w`, `d`, `kind` (und `studs`) aus einem freien `state`-Objekt (ungültiges wird zu Standardwerten). */
export function brickState(state: Record<string, unknown> | undefined): BrickState {
  const kind = BRICK_KINDS.includes(state?.kind as BrickKind) ? (state!.kind as BrickKind) : 'stein';
  let w = clampInt(state?.w, 1, MAX_BRICK_STUDS, 2);
  let d = clampInt(state?.d, 1, MAX_BRICK_STUDS, 4);
  if (kind === 'rund' || kind === 'rundplatte' || kind === 'viertel' || kind === 'kuppel') d = w;
  if (kind === 'schraeg' || kind === 'bogen' || kind === 'schraeg_um') d = Math.max(2, d);
  if (kind === 'bogenlauf') d = Math.max(4, d);
  if (kind === 'kuppel') {
    w = Math.max(2, w);
    d = w;
  }
  if (kind === 'rad') {
    w = 1;
    d = Math.min(8, Math.max(2, d - (d % 2))); // gerader Durchmesser, damit die Höhe auf das Plattenraster passt
  }
  return { w, d, kind, studs: state?.studs !== false };
}

/**
 * Noppen-Positionen (x, z relativ zur Mitte der Grundfläche, in Metern) einer Art.
 * Schräge/Bogen: nur die hintere Reihe (−z); Viertel: Zellen innerhalb der Rundung (Ecke bei −x/−z); rund: Mitte.
 */
export function studSpots(s: BrickState): [number, number][] {
  if (!s.studs || !kindHasStuds(s.kind)) return [];
  const out: [number, number][] = [];
  const cx = (i: number) => (i + 0.5 - s.w / 2) * STUD;
  const cz = (j: number) => (j + 0.5 - s.d / 2) * STUD;
  if (s.kind === 'rund') return [[0, 0]];
  if (s.kind === 'rundplatte' || s.kind === 'viertel') {
    for (let i = 0; i < s.w; i++) {
      for (let j = 0; j < s.d; j++) {
        if (s.kind === 'rundplatte') {
          if (s.w <= 2 ? i === 0 && j === 0 : Math.hypot(cx(i), cz(j)) <= (s.w * STUD) / 2 - 0.6 * STUD) out.push([s.w <= 2 ? 0 : cx(i), s.w <= 2 ? 0 : cz(j)]);
        } else if (Math.hypot((i + 0.5) * STUD, (j + 0.5) * STUD) <= s.w * STUD - 0.35 * STUD) out.push([cx(i), cz(j)]);
      }
    }
    return out;
  }
  const rows = s.kind === 'schraeg' || s.kind === 'bogen' ? 1 : s.d;
  for (let i = 0; i < s.w; i++) for (let j = 0; j < rows; j++) out.push([cx(i), cz(j)]);
  return out;
}

/** Maße in Metern (ohne Noppen). */
export function brickSize(s: BrickState): [number, number, number] {
  return [s.w * STUD, kindPlates(s.kind, s.d) * PLATE_H, s.d * STUD];
}

/** Grundfläche im Noppenraster: Ecke (gx, gz) und Ausdehnung (w, d), schon um 90° gedreht. */
export interface Footprint {
  gx: number;
  gz: number;
  w: number;
  d: number;
}
export interface PlacedBrick extends Footprint {
  /** Unterkante in Platten (ganzzahlig, ab Höhe 0). */
  level: number;
  plates: number;
}

/** Weltposition (Mitte der Grundfläche, Unterkante) eines Steins. */
export function brickWorldPos(b: PlacedBrick, origin: [number, number, number]): [number, number, number] {
  return [origin[0] + (b.gx + b.w / 2) * STUD, origin[1] + b.level * PLATE_H, origin[2] + (b.gz + b.d / 2) * STUD];
}

/** Stapelhöhe: Oberkante (in Platten) der höchsten Steine, die die Fläche überlappen; 0 wenn nichts darunter liegt. */
export function restLevel(fp: Footprint, others: readonly PlacedBrick[]): number {
  let top = 0;
  for (const o of others) {
    const overlap = fp.gx < o.gx + o.w && o.gx < fp.gx + fp.w && fp.gz < o.gz + o.d && o.gz < fp.gz + fp.d;
    if (overlap) top = Math.max(top, o.level + o.plates);
  }
  return top;
}

/** Zerlegt eine Länge in Steinlängen (4, 3, 2, 1). `shift` > 0 beginnt mit einem Stein dieser Länge (versetzte Fugen). */
export function tile1D(length: number, shift = 0): number[] {
  const out: number[] = [];
  let rest = Math.max(0, Math.floor(length));
  if (shift > 0 && rest > shift) {
    out.push(shift);
    rest -= shift;
  }
  while (rest > 0) {
    const n = Math.min(4, rest);
    // Keine 1er-Reste, wenn sich ein 2+2 / 3+... vermeiden lässt.
    if (rest - n === 1 && n > 2) {
      out.push(n - 1);
      rest -= n - 1;
    } else {
      out.push(n);
      rest -= n;
    }
  }
  return out;
}

/** Eine Schicht eines Rechtecks (cols × rows Noppen) als Liste von Footprints. hollow = nur ein einreihiger Rand. */
export function layerFootprints(cols: number, rows: number, layer: number, hollow: boolean): Footprint[] {
  const shift = layer % 2 === 0 ? 0 : 2;
  const out: Footprint[] = [];
  const strip = (gx0: number, gz: number, length: number, alongX: boolean, sh: number) => {
    let at = 0;
    for (const n of tile1D(length, sh)) {
      out.push(alongX ? { gx: gx0 + at, gz, w: n, d: 1 } : { gx: gx0, gz: gz + at, w: 1, d: n });
      at += n;
    }
  };
  if (hollow) {
    strip(0, 0, cols, true, shift);
    if (rows > 1) strip(0, rows - 1, cols, true, shift);
    if (rows > 2) {
      strip(0, 1, rows - 2, false, shift);
      if (cols > 1) strip(cols - 1, 1, rows - 2, false, shift);
    }
  } else {
    for (let r = 0; r < rows; r++) strip(0, r, cols, true, r % 2 === 0 ? shift : (shift + 2) % 4);
  }
  return out;
}

/** Grundfläche und Höhe eines vorhandenen Steins im Noppenraster relativ zu `origin` (nur 90°-Drehungen sind genau). */
export function placedFromEntity(e: { ref: string; state?: Record<string, unknown>; transform: { pos: readonly number[]; rot: readonly number[] } }, origin: [number, number, number]): PlacedBrick | undefined {
  if (e.ref !== BRICK_REF) return undefined;
  const st = brickState(e.state);
  const [, qy, , qw] = e.transform.rot;
  const swap = Math.abs(Math.sin(2 * Math.atan2(qy, qw))) > 0.7;
  const w = swap ? st.d : st.w;
  const d = swap ? st.w : st.d;
  const gx = Math.round((e.transform.pos[0] - origin[0]) / STUD - w / 2);
  const gz = Math.round((e.transform.pos[2] - origin[2]) / STUD - d / 2);
  return { gx, gz, w, d, level: Math.round((e.transform.pos[1] - origin[1]) / PLATE_H), plates: kindPlates(st.kind, st.d) };
}


/** Boden aus möglichst großen Platten (bis 16 × 16 Noppen): wenige Teile statt Mauerverband. */
export function floorFootprints(cols: number, rows: number, maxSide = MAX_BRICK_STUDS): Footprint[] {
  const split = (len: number): number[] => {
    const out: number[] = [];
    let rest = Math.max(0, Math.floor(len));
    while (rest > 0) {
      const n = Math.min(maxSide, rest);
      out.push(rest - n === 1 && n > 2 ? n - 1 : n);
      rest -= out[out.length - 1];
    }
    return out;
  };
  const out: Footprint[] = [];
  let z = 0;
  for (const d of split(rows)) {
    let x = 0;
    for (const w of split(cols)) {
      out.push({ gx: x, gz: z, w, d });
      x += w;
    }
    z += d;
  }
  return out;
}

export type ProfileEdge = 'none' | 'slope' | 'curve';
export interface ProfileSegment {
  /** Länge in Noppen längs z. */
  len: number;
  /** Höhe in Platten über `base` (≥ 1). */
  h: number;
  /** Rand zum Segmentanfang (−z) bzw. -ende (+z): Schrägstein oder Bogenstein statt eines Quaders. */
  edgeBefore?: ProfileEdge;
  edgeAfter?: ProfileEdge;
  color?: string;
}
export interface ProfilePiece extends Footprint {
  level: number;
  kind: BrickKind;
  /** Drehung in Grad (0, 90, 180, 270). */
  rot: number;
  segment: number;
  studs: boolean;
}

/** Teilt eine Strecke in Stücke von höchstens `max` Noppen (ohne 1er-Reste, wenn vermeidbar). */
function chunks(len: number, max = MAX_BRICK_STUDS): number[] {
  const out: number[] = [];
  let rest = Math.floor(len);
  while (rest > 0) {
    let n = Math.min(max, rest);
    if (rest - n === 1 && n > 2) n -= 1;
    out.push(n);
    rest -= n;
  }
  return out;
}

/**
 * Seitenprofil als Höhenverlauf: Segmente längs z (in Noppen), Breite `width` längs x. Je Segment entstehen unten Platten (Rest von h/3) und darüber
 * Steinlagen; die Lagen unter der obersten haben keine Noppen. Mit edge_before/edge_after wird die äußerste 2-Noppen-Reihe der obersten Lage durch einen
 * Schräg- bzw. Bogenstein ersetzt (Anfang: fällt nach −z, Ende: nach +z). Koordinaten relativ zur Ecke (0, 0).
 */
export function profilePieces(width: number, segments: readonly ProfileSegment[], base = 0): ProfilePiece[] {
  const out: ProfilePiece[] = [];
  let z = 0;
  segments.forEach((seg, index) => {
    const len = Math.max(1, Math.floor(seg.len));
    const h = Math.max(1, Math.floor(seg.h));
    const remainder = h % 3;
    const bricks = Math.floor(h / 3);
    const layers: { level: number; plates: number }[] = [];
    let level = base;
    for (let i = 0; i < remainder; i++) layers.push({ level: level++, plates: 1 });
    for (let i = 0; i < bricks; i++) {
      layers.push({ level, plates: 3 });
      level += 3;
    }
    const topIndex = layers.length - 1;
    layers.forEach((layer, li) => {
      const top = li === topIndex;
      const kind: BrickKind = layer.plates === 3 ? 'stein' : 'platte';
      const useBefore = top && layer.plates === 3 && seg.edgeBefore && seg.edgeBefore !== 'none' && len >= 3;
      const useAfter = top && layer.plates === 3 && seg.edgeAfter && seg.edgeAfter !== 'none' && len >= 3;
      const startRow = useBefore ? 2 : 0;
      const endRow = len - (useAfter ? 2 : 0);
      // Hauptfläche: möglichst große Stücke.
      let zz = z + startRow;
      for (const d of chunks(endRow - startRow)) {
        let xx = 0;
        for (const w of chunks(width)) {
          out.push({ gx: xx, gz: zz, w, d, level: layer.level, kind, rot: 0, segment: index, studs: top });
          xx += w;
        }
        zz += d;
      }
      // Ränder
      const edgePiece = (edge: ProfileEdge | undefined, gz: number, rot: number) => {
        let xx = 0;
        for (const w of chunks(width)) {
          out.push({ gx: xx, gz, w, d: 2, level: layer.level, kind: edge === 'curve' ? 'bogen' : 'schraeg', rot, segment: index, studs: true });
          xx += w;
        }
      };
      if (useBefore) edgePiece(seg.edgeBefore, z, 180);
      if (useAfter) edgePiece(seg.edgeAfter, z + len - 2, 0);
    });
    z += len;
  });
  return out;
}
