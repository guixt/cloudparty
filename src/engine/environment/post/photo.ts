/** Fotomodus: Umschalten per Taste P, mit Hinweis über den Bus. Reine Logik, testbar mit Attrappen. */
export interface PhotoTarget {
  setPhotoMode(on: boolean): void;
}
export interface PhotoBus {
  emit(type: 'ui.toast', payload: { text: string }): void;
}

export interface PhotoMode {
  toggle(): boolean;
  isOn(): boolean;
  /** Tastendruck; gibt true zurück, wenn die Taste verbraucht wurde. */
  handleKey(event: { code?: string; key?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: unknown }): boolean;
  reset(): void;
}

/** Tippt der Nutzer gerade (Eingabefeld, Textfeld, bearbeitbarer Bereich)? */
export function isTypingTarget(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null;
  if (!el || typeof el !== 'object') return false;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const ce = el.getAttribute?.('contenteditable');
  return ce !== null && ce !== undefined && ce !== 'false';
}

export function createPhotoMode(target: PhotoTarget, bus: PhotoBus): PhotoMode {
  let on = false;
  const set = (value: boolean) => {
    on = value;
    try {
      target.setPhotoMode(on);
    } catch (error) {
      console.warn('[environment] Fotomodus fehlgeschlagen', error);
    }
  };
  return {
    toggle() {
      set(!on);
      bus.emit('ui.toast', { text: on ? 'Fotomodus an' : 'Fotomodus aus' });
      return on;
    },
    isOn: () => on,
    handleKey(event) {
      if (event.code !== 'KeyP' && event.key !== 'p' && event.key !== 'P') return false;
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return false;
      this.toggle();
      return true;
    },
    reset() {
      if (on) set(false);
    },
  };
}
