/**
 * Namensschilder und Sprechblasen als HTML-Elemente in ctx.overlayRoot.
 * Jede Marke wird pro Frame mit der aktiven Kamera auf den Bildschirm projiziert.
 */
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import './net.css';

export const TAG_MAX_DISTANCE = 60;
export const BUBBLE_MS = 5000;

export interface TagOptions {
  /** Wird pro Frame abgefragt; null = nicht anzeigen. Schreibt die Weltposition des Ankers in `out`. */
  getWorld(out: Vector3): boolean;
  /** Anzeigename (leer/undefined = nur Sprechblase). */
  getName?(): string;
  variant?: 'self' | 'remote' | 'object';
}

interface Tag extends TagOptions {
  el: HTMLDivElement;
  nameEl: HTMLDivElement;
  bubbleEl: HTMLDivElement;
  shownName: string;
  bubbleUntil: number;
  visible: boolean;
}

export class TagLayer {
  private tags = new Map<string, Tag>();
  private tmp = new Vector3();
  private view = new Vector3();
  private screen = new Vector3();

  constructor(
    private scene: Scene,
    private root: HTMLElement,
    private getSize: () => { width: number; height: number; renderWidth: number; renderHeight: number },
  ) {}

  has(key: string): boolean {
    return this.tags.has(key);
  }

  upsert(key: string, options: TagOptions): void {
    const existing = this.tags.get(key);
    if (existing) {
      Object.assign(existing, options);
      return;
    }
    const el = document.createElement('div');
    el.className = `cpn-tag cpn-${options.variant ?? 'remote'}`;
    el.style.display = 'none';
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'cpn-bubble';
    bubbleEl.style.display = 'none';
    const nameEl = document.createElement('div');
    nameEl.className = 'cpn-name';
    el.append(bubbleEl, nameEl);
    this.root.appendChild(el);
    this.tags.set(key, { ...options, el, nameEl, bubbleEl, shownName: '', bubbleUntil: 0, visible: false });
  }

  remove(key: string): void {
    const tag = this.tags.get(key);
    if (!tag) return;
    tag.el.remove();
    this.tags.delete(key);
  }

  /** Zeigt eine Sprechblase. */
  say(key: string, text: string, now = Date.now(), ms = BUBBLE_MS): void {
    const tag = this.tags.get(key);
    if (!tag) return;
    tag.bubbleEl.textContent = text.length > 160 ? `${text.slice(0, 157)}…` : text;
    tag.bubbleEl.style.display = '';
    tag.bubbleUntil = now + ms;
  }

  /** Pro Frame aufrufen. */
  update(now = Date.now()): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;
    const { width, height, renderWidth, renderHeight } = this.getSize();
    if (!renderWidth || !renderHeight) return;
    const viewMatrix = this.scene.getViewMatrix();
    const transform = this.scene.getTransformMatrix();
    const viewport = camera.viewport.toGlobal(renderWidth, renderHeight);
    const sx = width / renderWidth;
    const sy = height / renderHeight;
    const camPos = camera.globalPosition;

    for (const tag of this.tags.values()) {
      if (tag.bubbleUntil && now > tag.bubbleUntil) {
        tag.bubbleUntil = 0;
        tag.bubbleEl.style.display = 'none';
      }
      const name = tag.getName?.() ?? '';
      if (name !== tag.shownName) {
        tag.shownName = name;
        tag.nameEl.textContent = name;
        tag.nameEl.style.display = name ? '' : 'none';
      }
      let show = tag.getWorld(this.tmp);
      let dist = 0;
      if (show) {
        dist = Vector3.Distance(camPos, this.tmp);
        Vector3.TransformCoordinatesToRef(this.tmp, viewMatrix, this.view);
        show = this.view.z > 0.05 && dist <= TAG_MAX_DISTANCE && (!!name || tag.bubbleUntil > 0);
      }
      if (!show) {
        if (tag.visible) {
          tag.el.style.display = 'none';
          tag.visible = false;
        }
        continue;
      }
      Vector3.ProjectToRef(this.tmp, Matrix.IdentityReadOnly, transform, viewport, this.screen);
      const scale = Math.min(1, Math.max(0.6, 1.15 - dist / 70));
      const fade = dist > 40 ? Math.max(0.35, 1 - (dist - 40) / 30) : 1;
      if (!tag.visible) {
        tag.el.style.display = '';
        tag.visible = true;
      }
      tag.el.style.transform = `translate(${(this.screen.x * sx).toFixed(1)}px, ${(this.screen.y * sy).toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      tag.el.style.opacity = fade.toFixed(2);
      tag.el.style.zIndex = String(Math.max(0, 1000 - Math.round(dist)));
    }
  }

  dispose(): void {
    for (const key of [...this.tags.keys()]) this.remove(key);
  }
}
