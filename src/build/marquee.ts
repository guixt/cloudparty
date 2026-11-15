/** Auswahlrechteck (DOM-Overlay) für das Ziehen mit der linken Maustaste. */
import type { Rect } from './multi';

const MIN_DRAG = 5;

export function createMarquee() {
  let start: { x: number; y: number } | null = null;
  let el: HTMLDivElement | null = null;
  let active = false;
  let finishedAt = 0;
  const hide = () => {
    el?.remove();
    el = null;
  };
  return {
    begin(e: PointerEvent) {
      start = { x: e.clientX, y: e.clientY };
      active = false;
    },
    move(e: PointerEvent) {
      if (!start) return;
      if (!active && Math.hypot(e.clientX - start.x, e.clientY - start.y) < MIN_DRAG) return;
      active = true;
      if (!el) {
        el = document.createElement('div');
        el.className = 'cpb-marquee';
        el.dataset.testid = 'marquee';
        document.body.appendChild(el);
      }
      el.style.left = `${Math.min(start.x, e.clientX)}px`;
      el.style.top = `${Math.min(start.y, e.clientY)}px`;
      el.style.width = `${Math.abs(e.clientX - start.x)}px`;
      el.style.height = `${Math.abs(e.clientY - start.y)}px`;
    },
    /** Beendet die Geste; liefert das Rechteck nur, wenn wirklich gezogen wurde. */
    end(e: PointerEvent): Rect | null {
      const s = start;
      const was = active;
      start = null;
      active = false;
      hide();
      if (!s || !was) return null;
      finishedAt = performance.now();
      return { x0: s.x, y0: s.y, x1: e.clientX, y1: e.clientY };
    },
    justFinished: () => performance.now() - finishedAt < 300,
    dispose: hide,
  };
}
