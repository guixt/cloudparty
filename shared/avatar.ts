/**
 * Avatar-Zustand gemäß AVATAR_SPEC.md, erweitert um Aussehen und Bewegungsart.
 * VERTRAG: Diese Datei wird nur vom Koordinator geändert.
 */
import type { Vec3 } from './types';

export interface AvatarAppearance {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
}

export type AvatarMotion = 'idle' | 'walk' | 'run' | 'jump' | 'fly' | 'sit';
export const EMOTE_NAMES = ['wave', 'agree', 'raise-hand', 'dance'] as const;
export type EmoteName = (typeof EMOTE_NAMES)[number];

export interface EmoteState {
  name: string;
  startedAt: number;
  durationMs?: number;
  intensity?: number;
  loop?: boolean;
}

export interface AvatarPermissions {
  canMove: boolean;
  canEmote: boolean;
  canInteract: boolean;
  canSpeak: boolean;
  canModerate: boolean;
  canSpawnItems: boolean;
}

export interface AvatarState {
  identity: { id: string; displayName: string };
  presence: {
    /** Fußpunkt des Avatars in Weltkoordinaten (Meter). */
    position: Vec3;
    /** Blickrichtung als Drehung um die Y-Achse in Radiant. */
    yaw: number;
    focus?: string | null;
  };
  motion: AvatarMotion;
  /** Kanal ("upperBody", "face", …) → Geste. */
  emotes: Record<string, EmoteState>;
  proximity: { personalSpaceRadius: number };
  permissions: AvatarPermissions;
  appearance: AvatarAppearance;
}

export const DEFAULT_APPEARANCE: AvatarAppearance = {
  skin: '#e0b089',
  hair: '#3b2a1e',
  shirt: '#3f8f4f',
  pants: '#2f4468',
};

export const DEFAULT_PERMISSIONS: AvatarPermissions = {
  canMove: true,
  canEmote: true,
  canInteract: true,
  canSpeak: true,
  canModerate: false,
  canSpawnItems: true,
};

export function createAvatarState(id: string, displayName: string, appearance: AvatarAppearance = DEFAULT_APPEARANCE): AvatarState {
  return {
    identity: { id, displayName },
    presence: { position: [0, 0, 0], yaw: 0, focus: null },
    motion: 'idle',
    emotes: {},
    proximity: { personalSpaceRadius: 1.5 },
    permissions: { ...DEFAULT_PERMISSIONS },
    appearance: { ...appearance },
  };
}

/** Der Teil des Avatar-Zustands, der häufig über das Netz geht. */
export interface AvatarNetState {
  position: Vec3;
  yaw: number;
  motion: AvatarMotion;
  emotes: Record<string, EmoteState>;
}
