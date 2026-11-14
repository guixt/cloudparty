/**
 * Schnittstellen zwischen KI-Kern (Paket 13), Assistent-Oberfläche (Paket 14) und Editor-KI (Paket 15).
 * VERTRAG: nur der Koordinator ändert diese Datei. Paket 13 implementiert alles hier Beschriebene
 * und exportiert es aus `src/ai/core/index.ts`.
 */
import type { AiApprovalMode } from '../../shared/aiTools';


/** Ein Schritt im Verlauf eines Auftrags, den die Oberfläche anzeigt. */
export type AssistantEvent =
  | { type: 'text'; delta: string }
  /** Ein Werkzeug wurde ausgeführt; `summary` ist ein kurzer deutscher Satz („Bank hinzugefügt"). */
  | { type: 'tool'; name: string; summary: string; ok: boolean }
  /** Der Nutzer soll bestätigen (z. B. viele Löschungen oder ein Skript); `resolve(true)` führt aus. */
  | { type: 'confirm'; id: string; question: string; detail?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done'; stopped: boolean; changed: boolean };

export interface RunOptions {
  signal?: AbortSignal;
  onEvent: (event: AssistantEvent) => void;
  /** Wird für `confirm`-Ereignisse aufgerufen; true = ausführen. */
  confirm: (question: string, detail?: string) => Promise<boolean>;
}

export interface AiSettings {
  hasKey: boolean;
  model: string;
  /** ask = vor Skripten und vielen Löschungen fragen, auto = alles ohne Rückfragen. */
  approval: AiApprovalMode;
  /** Obergrenze der Eingabe pro Anfrage in Tokens (siehe AI_TOKEN_LIMITS). */
  maxInputTokens: number;
  /** Obergrenze der Antwortlänge pro Anfrage in Tokens. */
  maxOutputTokens: number;
}

export interface AssistantApi {
  getSettings(): AiSettings;
  /** Speichert den Key nur im Browser (localStorage). Leerer Text löscht ihn. */
  setApiKey(key: string): void;
  setModel(model: string): void;
  setApproval(mode: AiApprovalMode): void;
  /** Speichert die Längengrenzen (nur Browser); Werte werden auf den erlaubten Bereich begrenzt. */
  setTokenLimits(limits: { maxInputTokens?: number; maxOutputTokens?: number }): void;
  /** Führt einen Auftrag aus; Gesprächsverlauf bleibt zwischen Aufträgen erhalten. */
  run(prompt: string, options: RunOptions): Promise<void>;
  /** Vergisst den Gesprächsverlauf. */
  resetConversation(): void;
  /** Macht den letzten Auftrag rückgängig (ein Undo-Schritt). */
  undoLast(): boolean;
}

export interface AskOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Teilantworten (Streaming). */
  onDelta?: (delta: string) => void;
}
export interface AskResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
/** Einfache Einzelanfrage ohne Werkzeuge (Editor-KI). Wirft Error mit deutscher Meldung. */
export type AskClaude = (options: AskOptions) => Promise<AskResult>;
