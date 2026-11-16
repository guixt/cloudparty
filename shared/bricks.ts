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

/** stein, platte, fliese (ohne Noppen), schraeg (Dachstein: Noppen nur in der hinteren Reihe), rund (Rundstein, w = d, eine Noppe in der Mitte), rad (Rad: Achse längs x, Breite 1 Noppe, Durchmesser d Noppen). */
export type BrickKind = 'stein' | 'platte' | 'fliese' | 'schraeg' | 'rund' | 'rad';
export const BRICK_KINDS: readonly BrickKind[] = ['stein', 'platte', 'fliese', 'schraeg', 'rund', 'rad'];

/** Höhe in Platten (Stein 3, Platte und Fliese 1). */
export function kindPlates(kind: BrickKind, d = 2): number {
  if (kind === 'rad') return Math.round(d * (STUD / PLATE_H)); // Durchmesser d Noppen
  return kind === 'platte' || kind === 'fliese' ? 1 : 3;
}
export function kindHasStuds(kind: BrickKind): boolean {
  return kind !== 'fliese' && kind !== 'rad';
}

export interface BrickState {
  w: number;
  d: number;
  kind: BrickKind;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Liest `w`, `d`, `kind` aus einem freien `state`-Objekt (ungültiges wird zu Standardwerten). */
export function brickState(state: Record<string, unknown> | undefined): BrickState {
  const kind = BRICK_KINDS.includes(state?.kind as BrickKind) ? (state!.kind as BrickKind) : 'stein';
  let w = clampInt(state?.w, 1, MAX_BRICK_STUDS, 2);
  let d = clampInt(state?.d, 1, MAX_BRICK_STUDS, 4);
  if (kind === 'rund') d = w;
  if (kind === 'schraeg') d = Math.max(2, d);
  if (kind === 'rad') {
    w = 1;
    d = Math.min(8, Math.max(2, d - (d % 2))); // gerader Durchmesser, damit die Höhe auf das Plattenraster passt
  }
  return { w, d, kind };
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

