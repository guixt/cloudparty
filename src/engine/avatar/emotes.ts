/**
 * Gesten: Definitionen, Start/Ablauf. Reine Logik (testbar). Die Darstellung
 * (Gelenkwinkel) liegt in poses.ts.
 */
import { EMOTE_NAMES, type EmoteName, type EmoteState } from '../../../shared/avatar';

export interface EmoteDef {
  channel: string;
  /** Dauer in ms; ohne Dauer läuft die Geste (loop) bis zum Abbruch. */
  durationMs?: number;
  loop?: boolean;
  /** Bewegen beendet die Geste. */
  cancelOnMove?: boolean;
  /** Während des Sitzens erlaubt? */
  whileSitting: boolean;
}

export const EMOTE_DEFS: Record<EmoteName, EmoteDef> = {
  wave: { channel: 'upperBody', durationMs: 2600, whileSitting: true },
  agree: { channel: 'head', durationMs: 1700, whileSitting: true },
  'raise-hand': { channel: 'upperBody', durationMs: 4500, whileSitting: true },
  dance: { channel: 'fullBody', loop: true, cancelOnMove: true, whileSitting: false },
};

/** Beschriftung auf Deutsch, Reihenfolge = Zifferntasten 1–4. */
export const EMOTE_LABELS: Record<EmoteName, string> = {
  wave: 'Winken',
  agree: 'Zustimmen',
  'raise-hand': 'Melden',
  dance: 'Tanzen',
};

export function isEmoteName(name: string): name is EmoteName {
  return (EMOTE_NAMES as readonly string[]).includes(name);
}

export interface StartedEmote {
  channel: string;
  name: string;
  state: EmoteState;
}

export interface EmoteChange {
  emotes: Record<string, EmoteState>;
  started?: StartedEmote;
  /** Beendete Gesten (für 'avatar.emote.ended'). */
  ended: { channel: string; name: string }[];
}

/**
 * Startet eine Geste. Eine laufende Dauerschleife derselben Geste wird beendet (Umschalten);
 * eine andere Geste auf demselben Kanal wird ersetzt.
 */
export function startEmote(emotes: Record<string, EmoteState>, name: string, now: number, sitting = false): EmoteChange | null {
  if (!isEmoteName(name)) return null;
  const def = EMOTE_DEFS[name];
  if (sitting && !def.whileSitting) return null;
  const next = { ...emotes };
  const ended: EmoteChange['ended'] = [];
  const current = next[def.channel];
  if (current) {
    delete next[def.channel];
    ended.push({ channel: def.channel, name: current.name });
    if (def.loop && current.name === name) return { emotes: next, ended };
  }
  const state: EmoteState = { name, startedAt: now };
  if (def.durationMs !== undefined) state.durationMs = def.durationMs;
  if (def.loop) state.loop = true;
  next[def.channel] = state;
  return { emotes: next, started: { channel: def.channel, name, state }, ended };
}

/** Entfernt abgelaufene Gesten. Gibt dieselbe Referenz zurück, wenn nichts ablief. */
export function expireEmotes(emotes: Record<string, EmoteState>, now: number): EmoteChange {
  let next: Record<string, EmoteState> | null = null;
  const ended: EmoteChange['ended'] = [];
  for (const [channel, e] of Object.entries(emotes)) {
    if (!e.loop && e.durationMs !== undefined && now - e.startedAt >= e.durationMs) {
      next ??= { ...emotes };
      delete next[channel];
      ended.push({ channel, name: e.name });
    }
  }
  return { emotes: next ?? emotes, ended };
}

/** Beendet Gesten, die bei Bewegung abbrechen (Tanzen). */
export function cancelOnMove(emotes: Record<string, EmoteState>): EmoteChange {
  let next: Record<string, EmoteState> | null = null;
  const ended: EmoteChange['ended'] = [];
  for (const [channel, e] of Object.entries(emotes)) {
    if (isEmoteName(e.name) && EMOTE_DEFS[e.name].cancelOnMove) {
      next ??= { ...emotes };
      delete next[channel];
      ended.push({ channel, name: e.name });
    }
  }
  return { emotes: next ?? emotes, ended };
}

/** Beendet alle Gesten, die im Sitzen nicht erlaubt sind. */
export function cancelForSitting(emotes: Record<string, EmoteState>): EmoteChange {
  let next: Record<string, EmoteState> | null = null;
  const ended: EmoteChange['ended'] = [];
  for (const [channel, e] of Object.entries(emotes)) {
    if (isEmoteName(e.name) && !EMOTE_DEFS[e.name].whileSitting) {
      next ??= { ...emotes };
      delete next[channel];
      ended.push({ channel, name: e.name });
    }
  }
  return { emotes: next ?? emotes, ended };
}

/** Schlüssel zum schnellen Vergleich des Gesten-Zustands. */
export function emoteKey(emotes: Record<string, EmoteState>): string {
  return Object.entries(emotes)
    .map(([c, e]) => `${c}:${e.name}:${e.startedAt}`)
    .sort()
    .join('|');
}
