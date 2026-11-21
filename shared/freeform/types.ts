/**
 * Freiform: gekrümmte Flächen (Drehkörper, Sweep entlang Bogen-/Bézier-Pfad, Kontrollpunkt-Fläche) mit optionalen
 * booleschen Schnitten. Gespeichert wird nur ein kleiner Parametersatz im `state` der Entity (EntitySpec.freeform);
 * das Netz entsteht im Client (und in Tests) aus diesen Parametern.
 * VERTRAG: nur der Koordinator ändert diese Datei. Koordinaten lokal zur Entity, Ursprung am Boden (y = 0), Meter.
 */
export const FREEFORM_REF = 'EntitySpec.freeform';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** Punkt eines Grundriss-Pfades. `bulge` = Pfeilhöhe (Sagitta) des Bogens zum NÄCHSTEN Punkt in Metern; 0 = gerade, positiv = Bogen nach links (in Laufrichtung, von oben gesehen). */
export interface PathPoint {
  p: Vec2;
  bulge?: number;
}

/** Drehkörper: `profile` = Punkte [Radius, Höhe y] von unten nach oben, wird um die Y-Achse gedreht. */
export interface LatheParams {
  kind: 'lathe';
  profile: Vec2[];
  /** Überstrichener Winkel in Grad (Standard 360). */
  sweepDeg?: number;
  /** Startwinkel in Grad (Standard 0). */
  startDeg?: number;
  /** Segmente über den Winkel (Standard 48). */
  segments?: number;
  /** Verhältnis z/x für ovale Formen (Standard 1). */
  ellipse?: number;
}

/** Sweep: eine Wand bzw. Platte (Rechteck-Querschnitt Dicke × Höhe) entlang des Pfades. */
export interface SweepParams {
  kind: 'sweep';
  path: PathPoint[];
  closedPath?: boolean;
  /** Höhe am Anfang des Pfades. */
  height: number;
  /** Höhe am Ende (Standard = height; ergibt Verlauf, z. B. schwingende Decke). */
  heightEnd?: number;
  thickness: number;
  /** Höhe der Unterkante (Standard 0). */
  y0?: number;
  /** Segmente je Bogen (Standard 12). */
  segments?: number;
  /** Sinus-Welle seitlich zum Pfad (Lamellen, gewellte Wand). */
  wave?: { amplitude: number; length: number };
}

/** Kontrollpunkt-Fläche: Gitter `grid[zeile][spalte]` aus Kontrollpunkten (Bézier/B-Spline, Grad 1–3). */
export interface PatchParams {
  kind: 'patch';
  grid: Vec3[][];
  degree?: 1 | 2 | 3;
  /** Dicke (Rückseite + Rand); 0 = einseitige Fläche. */
  thickness?: number;
  /** Unterteilung [u, v] des Ergebnisnetzes (Standard [24, 24]). */
  subdivisions?: [number, number];
}

/** Boolescher Schnitt (Subtraktion) in lokalen Koordinaten der Freiform. */
export interface CutOp {
  shape: 'box' | 'cylinder' | 'sphere';
  pos: Vec3;
  /** Box: Breite/Höhe/Tiefe; Zylinder: [Durchmesser, Höhe, Durchmesser]; Kugel: Durchmesser je Achse. */
  size: Vec3;
  /** Drehung um Y in Grad. */
  rotY?: number;
}

export type FreeformShape = LatheParams | SweepParams | PatchParams;
export type FreeformState = FreeformShape & { cuts?: CutOp[] };

/** Fertiges Netz (Arrays flach: positions/normals je 3, uvs je 2 pro Vertex; indices = Dreiecke). */
export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export const FREEFORM_LIMITS = {
  maxPoints: 200,
  maxGrid: 16,
  maxSegments: 256,
  maxCuts: 8,
  maxSize: 200,
  maxVertices: 60000,
} as const;
