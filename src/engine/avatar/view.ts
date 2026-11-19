/**
 * Darstellung der eigenen Figur und Kameraperspektive (nur lokal, pro Browser gespeichert).
 * Andere Besucher sehen deine Figur unabhängig davon weiterhin.
 */
import { createStore } from 'zustand/vanilla';

export type FigureStyle = 'normal' | 'neutral' | 'hidden';
export type CameraView = 'third' | 'first';
export const FIGURE_STYLES: readonly FigureStyle[] = ['normal', 'neutral', 'hidden'];
export const CAMERA_VIEWS: readonly CameraView[] = ['third', 'first'];
export const VIEW_KEY = 'cloudparty.avatar.view';

export interface AvatarViewSettings {
  figure: FigureStyle;
  camera: CameraView;
}

export const DEFAULT_VIEW: AvatarViewSettings = { figure: 'normal', camera: 'third' };

export function sanitizeView(input: unknown): AvatarViewSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    figure: FIGURE_STYLES.includes(o.figure as FigureStyle) ? (o.figure as FigureStyle) : DEFAULT_VIEW.figure,
    camera: CAMERA_VIEWS.includes(o.camera as CameraView) ? (o.camera as CameraView) : DEFAULT_VIEW.camera,
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadView(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AvatarViewSettings {
  try {
    const raw = storage?.getItem(VIEW_KEY);
    return raw ? sanitizeView(JSON.parse(raw)) : { ...DEFAULT_VIEW };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

export function saveView(v: AvatarViewSettings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* Speicher gesperrt */
  }
}

/** Ist die eigene Figur (und ihr Namensschild) sichtbar? In der Ich-Perspektive nie (der Kopf stünde vor der Kamera). */
export function figureShown(v: AvatarViewSettings, mode: 'play' | 'build'): boolean {
  if (v.figure === 'hidden') return false;
  return mode === 'build' || v.camera === 'third';
}

export const avatarView = createStore<AvatarViewSettings>(() => loadView());

export function setAvatarView(patch: Partial<AvatarViewSettings>): void {
  const next = sanitizeView({ ...avatarView.getState(), ...patch });
  avatarView.setState(next);
  saveView(next);
}
