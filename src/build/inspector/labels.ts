import type { MediaKind, ParticlePreset, PhysicsMode } from '../../../shared/types';
import type { AlignMode } from '../multi';

export const KNOWN_STATE = ['text', 'seats', 'intensity', 'on'] as const;

export const PHYSICS_LABELS: Record<PhysicsMode, string> = { none: 'Keine', static: 'Statisch', dynamic: 'Dynamisch', trigger: 'Auslöser (Trigger)' };

export const PARTICLE_LABELS: Record<ParticlePreset, string> = { fire: 'Feuer', sparks: 'Funken', smoke: 'Rauch', confetti: 'Konfetti' };

export const MEDIA_KINDS: Record<MediaKind, string> = { image: 'Bild', web: 'Webseite', video: 'Video', slides: 'Folien', text: 'Text' };

export const ALIGN: { mode: AlignMode; label: string }[] = [
  { mode: 'x-min', label: 'Links' },
  { mode: 'x-mid', label: 'Mitte (X)' },
  { mode: 'x-max', label: 'Rechts' },
  { mode: 'z-min', label: 'Vorn' },
  { mode: 'z-mid', label: 'Mitte (Z)' },
  { mode: 'z-max', label: 'Hinten' },
  { mode: 'ground', label: 'Boden' },
];
