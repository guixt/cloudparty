/**
 * HTML-Fläche (iframe oder <img>) in `ctx.overlayRoot`, die per CSS matrix3d
 * exakt auf das projizierte Viereck der Tafel gelegt wird.
 *
 * EHRLICHER HINWEIS: Eine HTML-Ebene liegt immer über dem Canvas. Sie kann daher
 * nicht von 3D-Objekten verdeckt werden, die vor der Tafel stehen. Gemildert wird das
 * in surface.ts: Trifft ein Strahl von der Kamera zur Tafelmitte vorher ein anderes
 * Mesh, wird die HTML-Fläche ausgeblendet (die Tafel zeigt dann ihren Platzhalter).
 * Bei nur teilweiser Verdeckung bleibt ein Rest-Fehler.
 */
import { quadToMatrix3d, type Quad } from './helpers';

export const EMBED_HINT = 'Manche Webseiten erlauben das Einbetten nicht';
const CAPTION_H = 34;

export type OverlayContent = 'iframe' | 'img';

export class OverlayQuad {
  readonly el: HTMLDivElement;
  private content: HTMLIFrameElement | HTMLImageElement;
  private caption: HTMLDivElement | null = null;
  private link: HTMLAnchorElement | null = null;
  private label: HTMLSpanElement | null = null;
  private lastTransform = '';
  private shown = false;
  private interactive = false;
  readonly virtualWidth = 1024;
  readonly virtualHeight: number;

  constructor(
    parent: HTMLElement,
    readonly contentKind: OverlayContent,
    aspect: number,
    entityId: string,
  ) {
    this.virtualHeight = Math.round(this.virtualWidth / aspect);
    this.el = document.createElement('div');
    this.el.className = 'cp-media-quad';
    this.el.dataset.entityId = entityId;
    this.el.style.width = `${this.virtualWidth}px`;
    this.el.style.height = `${this.virtualHeight}px`;
    this.el.style.display = 'none';
    if (contentKind === 'iframe') {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
      frame.className = 'cp-media-frame';
      frame.style.height = `${this.virtualHeight - CAPTION_H}px`;
      this.content = frame;
      this.caption = document.createElement('div');
      this.caption.className = 'cp-media-caption';
      this.caption.title = `${EMBED_HINT}. Dann hilft „In neuem Tab öffnen".`;
      this.label = document.createElement('span');
      this.label.className = 'cp-media-caption-url';
      this.link = document.createElement('a');
      this.link.className = 'cp-media-caption-link';
      this.link.target = '_blank';
      this.link.rel = 'noopener noreferrer';
      this.link.textContent = 'In neuem Tab öffnen';
      this.caption.append(this.label, this.link);
    } else {
      const img = document.createElement('img');
      img.className = 'cp-media-img';
      img.referrerPolicy = 'no-referrer';
      img.alt = '';
      this.content = img;
    }
    this.el.append(this.content);
    if (this.caption) this.el.append(this.caption);
    parent.append(this.el);
  }

  /** Setzt die geladene Adresse (iframe: Einbettungs-URL; pageUrl: Link/Anzeige). */
  setSource(url: string, pageUrl: string): void {
    if (this.content.getAttribute('src') !== url) this.content.setAttribute('src', url);
    if (this.link) this.link.href = pageUrl;
    if (this.label) this.label.textContent = pageUrl.replace(/^https?:\/\//, '');
  }

  /** Legt die Fläche auf das Viereck (Bildschirm-Pixel) oder blendet sie aus (null). */
  place(quad: Quad | null, interactive: boolean): void {
    if (interactive !== this.interactive) {
      this.interactive = interactive;
      this.el.classList.toggle('cp-media-interactive', interactive);
    }
    const matrix = quad ? quadToMatrix3d(this.virtualWidth, this.virtualHeight, quad) : null;
    if (!matrix) {
      if (this.shown) {
        this.el.style.display = 'none';
        this.shown = false;
      }
      return;
    }
    if (!this.shown) {
      this.el.style.display = 'block';
      this.shown = true;
    }
    if (matrix !== this.lastTransform) {
      this.el.style.transform = matrix;
      this.lastTransform = matrix;
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  dispose(): void {
    if (this.content instanceof HTMLIFrameElement) this.content.src = 'about:blank';
    this.el.remove();
  }
}
