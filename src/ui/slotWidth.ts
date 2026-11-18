/** Breite der seitlichen Leisten (Bauen: Bausteine links, Inspector rechts): einstellbar, gespeichert pro Browser. */
export type ResizableSlot = 'left' | 'right';

export const SLOT_DEFAULT: Record<ResizableSlot, number> = { left: 240, right: 290 };
export const SLOT_MIN = 200;
const STORAGE_KEY = (slot: ResizableSlot) => `cloudparty.ui.${slot}Width`;

/** Obergrenze: höchstens 640 px und nicht mehr als etwa die Hälfte des Fensters. */
export function slotMax(viewportWidth: number): number {
  return Math.max(SLOT_MIN, Math.min(640, Math.round(viewportWidth * 0.5)));
}

export function clampSlotWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return SLOT_MIN;
  return Math.min(slotMax(viewportWidth), Math.max(SLOT_MIN, Math.round(width)));
}

/** Breite aus der Mausposition: links ab dem Rand (12 px), rechts ab dem rechten Rand. */
export function widthFromPointer(slot: ResizableSlot, clientX: number, viewportWidth: number): number {
  const raw = slot === 'left' ? clientX - 12 : viewportWidth - 12 - clientX;
  return clampSlotWidth(raw, viewportWidth);
}

export function loadSlotWidth(slot: ResizableSlot, viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth): number {
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY(slot)));
    if (Number.isFinite(raw) && raw > 0) return clampSlotWidth(raw, viewportWidth);
  } catch {
    /* kein Speicher: Standard */
  }
  return SLOT_DEFAULT[slot];
}

export function saveSlotWidth(slot: ResizableSlot, width: number): void {
  try {
    if (width === SLOT_DEFAULT[slot]) localStorage.removeItem(STORAGE_KEY(slot));
    else localStorage.setItem(STORAGE_KEY(slot), String(Math.round(width)));
  } catch {
    /* ignorieren */
  }
}

export function applySlotWidth(slot: ResizableSlot, width: number): void {
  document.documentElement.style.setProperty(`--cp-${slot}-width`, `${width}px`);
}
