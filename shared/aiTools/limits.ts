/**
 * Werkzeuge des KI-Assistenten (Claude Tool Use). VERTRAG: nur der Koordinator ändert diese Dateien.
 *
 * Die Werkzeuge arbeiten auf den bestehenden Store-Aktionen (siehe src/core/store.ts).
 * Längen in Metern, Winkel in Grad, Farben als #RRGGBB.
 */
export const AI_LIMITS = {
  /** Maximale Runden (Modellaufrufe) pro Auftrag. */
  maxRounds: 12,
  /** Maximale Werkzeugaufrufe pro Auftrag. */
  maxToolCalls: 60,
  /** Maximal neu angelegte Entities pro Auftrag. */
  /** Skripttests (script_test) pro Auftrag. */
  maxScriptTestsPerRun: 6,
  maxNewEntities: 1000,
  /** Ab dieser Zahl neuer Objekte in einem Auftrag fragt die KI den Nutzer einmal um Erlaubnis (Freigabe-Modus „fragen“). */
  confirmNewEntitiesAt: 300,
  /** Obergrenze je Aufruf für Steine und Anordnungen. */
  maxPerCall: 500,
  /** Ab dieser Anzahl Löschungen pro Auftrag wird der Nutzer gefragt. */
  confirmRemovalsAt: 5,
  /** Koordinaten müssen innerhalb dieses Betrags liegen. */
  maxCoordinate: 200,
  minSize: 0.05,
  maxSize: 60,
  maxScriptBytes: 20_000,
  maxTextLength: 2_000,
  /** Ausgabegrenze pro Modellaufruf. */
  maxOutputTokens: 4096,
  /** Screenshots (Werkzeug look) pro Auftrag. */
  maxScreenshotsPerRun: 2,
  /** Bildsuchen und Bild-Downloads pro Auftrag. */
  maxImageSearches: 4,
  maxImageDownloads: 6,
  /** Größe des Screenshots in Pixeln (Breite × Höhe). */
  screenshotWidth: 800,
  screenshotHeight: 500,
} as const;

export const AI_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (empfohlen)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (stärker, teurer)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (schnell, günstig)' },
] as const;
export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';

export const AI_STORAGE_KEYS = {
  apiKey: 'cloudparty.ai.key',
  model: 'cloudparty.ai.model',
  approval: 'cloudparty.ai.approval',
  maxInput: 'cloudparty.ai.maxInputTokens',
  maxOutput: 'cloudparty.ai.maxOutputTokens',
  logLevel: 'cloudparty.ai.logLevel',
  log: 'cloudparty.ai.log',
  vision: 'cloudparty.ai.vision',
  imageSearch: 'cloudparty.ai.imageSearch',
  /** Modelle je Rolle (leer = Hauptmodell): Planen, Ausführen, Prüfen. */
  planModel: 'cloudparty.ai.planModel',
  execModel: 'cloudparty.ai.execModel',
  reviewModel: 'cloudparty.ai.reviewModel',
  /** Nach „Alle ausführen“ automatisch mit dem Prüfmodell prüfen. */
  reviewAfterRun: 'cloudparty.ai.reviewAfterRun',
  /** JSON mit den Laufzeit-Grenzen (localStorage). */
  runLimits: 'cloudparty.ai.runLimits',
  /** „Lange Pläne“-Modus (sessionStorage: gilt nur bis zum Schließen des Tabs). */
  longRun: 'cloudparty.ai.longRun',
} as const;

/**
 * Einstellbare Laufzeit-Grenzen (pro Auftrag bzw. pro Plan-Lauf). `default` entspricht den Werten in AI_LIMITS;
 * `long` gilt, solange der temporäre Modus „Lange Pläne“ an ist (nur bis zum Neuladen bzw. Schließen des Tabs).
 */
export const AI_RUN_LIMITS = {
  maxRounds: { min: 2, max: 300, default: 12, long: 60, label: 'Schritte (Modellaufrufe) pro Auftrag', hint: 'So oft darf die KI in einem Auftrag antworten und Werkzeuge nutzen. Ein Plan-Knoten ist ein Auftrag.' },
  maxToolCalls: { min: 5, max: 2000, default: 60, long: 400, label: 'Werkzeugaufrufe pro Auftrag', hint: 'Gesamtzahl aller Werkzeugaufrufe in einem Auftrag.' },
  maxNewEntities: { min: 50, max: 50000, default: 1000, long: 10000, label: 'Neue Objekte pro Auftrag', hint: 'Mehr legt die KI in einem Auftrag nicht an.' },
  confirmNewEntitiesAt: { min: 20, max: 50000, default: 300, long: 5000, label: 'Rückfrage ab so vielen neuen Objekten', hint: 'Ab dieser Zahl fragt die KI einmal pro Auftrag um Erlaubnis (nicht im Modus „alles erlauben“).' },
  confirmRemovalsAt: { min: 1, max: 1000, default: 5, long: 50, label: 'Rückfrage ab so vielen Löschungen', hint: 'Ab dieser Zahl Löschungen pro Auftrag fragt die KI nach.' },
  maxScreenshots: { min: 1, max: 30, default: 2, long: 6, label: 'Screenshots pro Auftrag', hint: 'Jeder Screenshot kostet zusätzliche Tokens.' },
  maxImageSearches: { min: 1, max: 40, default: 4, long: 12, label: 'Bildsuchen pro Auftrag', hint: '' },
  maxImageDownloads: { min: 1, max: 60, default: 6, long: 20, label: 'Bilder laden pro Auftrag', hint: '' },
  maxScriptTests: { min: 1, max: 60, default: 6, long: 20, label: 'Skripttests pro Auftrag', hint: '' },
  planNodesPerRun: { min: 1, max: 500, default: 20, long: 120, label: 'Knoten pro „Alle ausführen“', hint: 'Danach hält der Plan-Lauf an; mit „Alle ausführen“ geht es weiter.' },
  planTokensPerRun: { min: 50000, max: 20000000, default: 600000, long: 5000000, label: 'Token-Obergrenze pro Plan-Lauf', hint: 'Ein- plus Ausgabe-Tokens aller Knoten eines Laufs. Danach hält er zwischen zwei Knoten an. Schützt vor unerwarteten Kosten.' },
} as const;
export type AiRunLimitKey = keyof typeof AI_RUN_LIMITS;
export type AiRunLimits = Record<AiRunLimitKey, number>;

/**
 * Einstellbare Längengrenzen pro Anfrage (in Tokens; ein Token sind etwa 3-4 Zeichen).
 * - output: maximale Länge einer Antwort (max_tokens). Zu klein: lange Aufträge oder Skripte werden abgeschnitten.
 * - input: Obergrenze für alles, was pro Anfrage an die KI geht (Systemanweisung, Weltdaten, Gesprächsverlauf).
 *   Wird sie überschritten, lässt der Assistent zuerst ältere Gesprächsteile weg und kürzt große Werkzeugergebnisse.
 */
export const AI_TOKEN_LIMITS = {
  output: { min: 1024, max: 16000, step: 256, default: 4096 },
  input: { min: 8000, max: 150000, step: 1000, default: 40000 },
} as const;

/**
 * Freigabe-Modus des Assistenten:
 * - ask (Standard): fragt vor dem Speichern von Skripten und bei vielen Löschungen nach.
 * - auto: führt alles ohne Rückfragen aus (wie auto-accept bei KI-Agenten). Automatische
 *   Prüfungen (Syntax, gesperrte Befehle, Limits, Baurecht) und Rückgängig bleiben aktiv.
 */
export type AiApprovalMode = 'ask' | 'auto';
export const DEFAULT_AI_APPROVAL: AiApprovalMode = 'ask';
