/** Reine Rechenhilfen der Baukamera (Blender-Steuerung): Drehen, Verschieben, Zoomen, Standardansichten. */

export const ORBIT_RAD_PER_PIXEL = 0.008;

export type DragMode = 'orbit' | 'pan' | 'zoom';

/** Welche Kamerabewegung gehört zu Maustaste und Zusatztasten? null = keine (z. B. normaler Linksklick). */
export function dragModeFor(button: number, mods: { shift: boolean; ctrl: boolean; alt: boolean }): DragMode | null {
  if (button === 1 || (button === 0 && mods.alt) || button === 2) {
    if (mods.shift) return 'pan';
    if (mods.ctrl && button !== 2) return 'zoom';
    return 'orbit';
  }
  return null;
}

export function orbitStep(alpha: number, beta: number, dx: number, dy: number, minBeta: number, maxBeta: number): { alpha: number; beta: number } {
  return { alpha: alpha - dx * ORBIT_RAD_PER_PIXEL, beta: Math.min(maxBeta, Math.max(minBeta, beta - dy * ORBIT_RAD_PER_PIXEL)) };
}

/** Verschiebung des Blickpunkts in Metern entlang der Kamera-Achsen: Ziehen nach rechts schiebt die Welt mit (Ziel nach links). */
export function panStep(radius: number, fov: number, viewportHeight: number, dx: number, dy: number): { right: number; up: number } {
  const perPixel = (2 * radius * Math.tan(fov / 2)) / Math.max(1, viewportHeight);
  return { right: -dx * perPixel, up: dy * perPixel };
}

export function zoomStep(radius: number, dy: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, radius * Math.exp(dy * 0.01)));
}

export type ViewName = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
const EPS = 0.001;

/** alpha/beta einer Standardansicht (Blickpunkt und Abstand bleiben). Die Kamera blickt von der genannten Seite auf das Ziel; vorne = von −z, Weltrichtung +z ist hinten. */
export function presetView(name: ViewName, minBeta: number, maxBeta: number): { alpha: number; beta: number } {
  const clamp = (b: number) => Math.min(maxBeta, Math.max(minBeta, b));
  switch (name) {
    case 'front':
      return { alpha: -Math.PI / 2, beta: Math.PI / 2 };
    case 'back':
      return { alpha: Math.PI / 2, beta: Math.PI / 2 };
    case 'right':
      return { alpha: 0, beta: Math.PI / 2 };
    case 'left':
      return { alpha: Math.PI, beta: Math.PI / 2 };
    case 'top':
      return { alpha: -Math.PI / 2, beta: clamp(EPS) };
    case 'bottom':
      return { alpha: -Math.PI / 2, beta: clamp(Math.PI - EPS) };
  }
}

/** Ziffernblock-Taste (Code) zur Ansicht; Strg dreht die Gegenseite. */
export function numpadView(code: string, ctrl: boolean): ViewName | null {
  if (code === 'Numpad1') return ctrl ? 'back' : 'front';
  if (code === 'Numpad3') return ctrl ? 'left' : 'right';
  if (code === 'Numpad7') return ctrl ? 'bottom' : 'top';
  return null;
}
