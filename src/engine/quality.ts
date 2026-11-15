/**
 * Grafik-Qualitätsstufen. Tabelle und Schnittstelle gehören dem Koordinator; Paket 26 ergänzt Überschreibungen (Overrides),
 * Automatik (qualityAuto.ts) und die Oberfläche (src/ui/graphics). Alle anderen Pakete LESEN nur
 * (`ctx.quality.features()` und `ctx.quality.onChange`) und schalten ihre Effekte danach um.
 */

export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export interface QualityFeatures {
  /** Kantenlänge der Schatten-Textur in Pixeln. */
  shadowMapSize: number;
  /** Weiche Schatten (PCF) statt harter. */
  softShadows: boolean;
  /** Kantenlänge der Reflexionssonde (Cubemap) in Pixeln; 0 = keine Sonde. */
  probeSize: number;
  /** Mindestabstand zwischen zwei Aktualisierungen der Sonde in Sekunden (0 = nur bei Änderungen der Umgebung). */
  probeUpdateSeconds: number;
  /** Umgebungs-Verdeckung (SSAO). */
  ssao: boolean;
  /** Sonnenstrahlen (volumetrisch). */
  godRays: boolean;
  /** Tiefenschärfe (nur im Fotomodus sinnvoll). */
  depthOfField: boolean;
  /** Bloom/Glow. */
  bloom: boolean;
  glow: boolean;
  fxaa: boolean;
  /** Echtzeit-Spiegel (`material.mirror`); 0 = aus, sonst Kantenlänge der Spiegel-Textur. */
  mirrorSize: number;
  /** Wasser: echte Spiegelung (Renderziel) mit Kantenlänge; 0 = nur Umgebungs-Spiegelung. */
  waterReflectionSize: number;
  /** Wasser: Lichtbrechung (zweites Renderziel). */
  waterRefraction: boolean;
  /** Dichte des Grases 0..1 (0 = keins). */
  grassDensity: number;
  /** Faktor auf die Partikelzahl (0..1). */
  particleScale: number;
  /** Höchstzahl gleichzeitig eingeschalteter Punktlichter. */
  maxPointLights: number;
  /** Auflösungs-Skalierung: 1 = volle Auflösung, 2 = halbe Breite/Höhe (Babylon: setHardwareScalingLevel). */
  hardwareScaling: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityFeatures> = {
  low: {
    shadowMapSize: 1024, softShadows: false, probeSize: 32, probeUpdateSeconds: 0, ssao: false, godRays: false, depthOfField: false,
    bloom: false, glow: false, fxaa: true, mirrorSize: 0, waterReflectionSize: 0, waterRefraction: false,
    grassDensity: 0, particleScale: 0.4, maxPointLights: 3, hardwareScaling: 1.5,
  },
  medium: {
    shadowMapSize: 1024, softShadows: true, probeSize: 64, probeUpdateSeconds: 4, ssao: false, godRays: false, depthOfField: false,
    bloom: true, glow: true, fxaa: true, mirrorSize: 256, waterReflectionSize: 256, waterRefraction: false,
    grassDensity: 0.35, particleScale: 0.7, maxPointLights: 4, hardwareScaling: 1,
  },
  high: {
    shadowMapSize: 2048, softShadows: true, probeSize: 128, probeUpdateSeconds: 2, ssao: true, godRays: true, depthOfField: false,
    bloom: true, glow: true, fxaa: true, mirrorSize: 512, waterReflectionSize: 512, waterRefraction: true,
    grassDensity: 0.7, particleScale: 1, maxPointLights: 6, hardwareScaling: 1,
  },
  ultra: {
    shadowMapSize: 4096, softShadows: true, probeSize: 256, probeUpdateSeconds: 1, ssao: true, godRays: true, depthOfField: true,
    bloom: true, glow: true, fxaa: true, mirrorSize: 1024, waterReflectionSize: 1024, waterRefraction: true,
    grassDensity: 1, particleScale: 1, maxPointLights: 8, hardwareScaling: 1,
  },
};

export const QUALITY_STORAGE_KEY = 'cloudparty.quality';
/** true, wenn der Nutzer die Stufe selbst gewählt hat (Automatik dann aus). */
export const QUALITY_MANUAL_KEY = 'cloudparty.quality.manual';

export const QUALITY_OVERRIDES_KEY = 'cloudparty.quality.overrides';

type NumberRange = { min: number; max: number; int?: boolean };
/** Zulässige Überschreibungen: true = Wahrheitswert, sonst Zahl im Bereich. */
export const OVERRIDE_RULES: { [K in keyof QualityFeatures]: QualityFeatures[K] extends boolean ? 'boolean' : NumberRange } = {
  shadowMapSize: { min: 256, max: 8192, int: true },
  softShadows: 'boolean',
  probeSize: { min: 0, max: 1024, int: true },
  probeUpdateSeconds: { min: 0, max: 60 },
  ssao: 'boolean',
  godRays: 'boolean',
  depthOfField: 'boolean',
  bloom: 'boolean',
  glow: 'boolean',
  fxaa: 'boolean',
  mirrorSize: { min: 0, max: 2048, int: true },
  waterReflectionSize: { min: 0, max: 2048, int: true },
  waterRefraction: 'boolean',
  grassDensity: { min: 0, max: 1 },
  particleScale: { min: 0, max: 1 },
  maxPointLights: { min: 0, max: 16, int: true },
  hardwareScaling: { min: 1, max: 4 },
};

/** Prüft ein Roh-Objekt gegen die Regeln. `clamp`: Zahlen begrenzen statt verwerfen. Unbekannte/ungültige Einträge entfallen. */
export function sanitizeOverrides(raw: unknown, clamp = false): Partial<QualityFeatures> {
  const out: Record<string, boolean | number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(OVERRIDE_RULES, key)) continue;
    const rule = OVERRIDE_RULES[key as keyof QualityFeatures];
    if (rule === 'boolean') {
      if (typeof value === 'boolean') out[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      let n = rule.int ? Math.round(value) : value;
      if (clamp) n = Math.min(rule.max, Math.max(rule.min, n));
      else if (n < rule.min || n > rule.max) continue;
      out[key] = n;
    }
  }
  return out as Partial<QualityFeatures>;
}

export interface QualityApi {
  get(): QualityLevel;
  /** Stufe, gemischt mit den Überschreibungen. */
  features(): QualityFeatures;
  /** Setzt die Stufe (manual = vom Nutzer gewählt, schaltet die Automatik aus). */
  set(level: QualityLevel, options?: { manual?: boolean }): void;
  /** Läuft die Automatik noch (Nutzer hat nicht selbst gewählt)? */
  isAuto(): boolean;
  /** Automatik wieder einschalten (löscht die manuelle Wahl). */
  setAuto(): void;
  /** Einzelne Merkmale, die der Nutzer abweichend von der Stufe gesetzt hat. */
  getOverrides(): Partial<QualityFeatures>;
  /** Mischt `patch` in die Überschreibungen (Wert `undefined` entfernt den Eintrag); `null` löscht alle. */
  setOverrides(patch: Partial<QualityFeatures> | null): void;
  /** Meldet jede Änderung der Stufe oder der Überschreibungen; Rückgabe meldet ab. */
  onChange(listener: (level: QualityLevel, features: QualityFeatures) => void): () => void;
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Speicher gesperrt */
  }
}

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

function loadOverrides(): Partial<QualityFeatures> {
  const raw = readStorage(QUALITY_OVERRIDES_KEY);
  if (!raw) return {};
  try {
    return sanitizeOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** Umsetzung des Vertrags (Standard „high"). */
export function createQualityController(initial?: QualityLevel): QualityApi {
  const stored = readStorage(QUALITY_STORAGE_KEY);
  let level: QualityLevel = initial ?? (isQualityLevel(stored) ? stored : 'high');
  let manual = readStorage(QUALITY_MANUAL_KEY) === '1';
  let overrides = loadOverrides();
  let merged: QualityFeatures = { ...QUALITY_PRESETS[level], ...overrides };
  const listeners = new Set<(level: QualityLevel, features: QualityFeatures) => void>();
  const emit = () => {
    merged = { ...QUALITY_PRESETS[level], ...overrides };
    for (const listener of [...listeners]) listener(level, merged);
  };
  return {
    get: () => level,
    features: () => merged,
    set(next, options) {
      if (options?.manual) {
        manual = true;
        writeStorage(QUALITY_MANUAL_KEY, '1');
      }
      writeStorage(QUALITY_STORAGE_KEY, next);
      if (next === level) return;
      level = next;
      emit();
    },
    isAuto: () => !manual,
    setAuto() {
      manual = false;
      writeStorage(QUALITY_MANUAL_KEY, null);
    },
    getOverrides: () => ({ ...overrides }),
    setOverrides(patch) {
      let next: Record<string, unknown>;
      if (patch === null) next = {};
      else {
        next = { ...overrides };
        const clean = sanitizeOverrides(patch, true) as Record<string, unknown>;
        for (const key of Object.keys(patch)) {
          if ((patch as Record<string, unknown>)[key] === undefined) delete next[key];
          else if (key in clean) next[key] = clean[key];
        }
      }
      const same = Object.keys(next).length === Object.keys(overrides).length && Object.keys(next).every((k) => next[k] === (overrides as Record<string, unknown>)[k]);
      if (same) return;
      overrides = next as Partial<QualityFeatures>;
      writeStorage(QUALITY_OVERRIDES_KEY, Object.keys(overrides).length ? JSON.stringify(overrides) : null);
      emit();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
