/**
 * Eine Medien-Fläche: Bildschirm-Mesh unter dem Entity-Knoten plus Inhalt
 * (Canvas-Textur, Videotextur oder HTML-Overlay).
 */
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { VideoTexture } from '@babylonjs/core/Materials/Textures/videoTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Ray } from '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Engines/Extensions/engine.videoTexture';
import type { EntitySpec, MediaKind, MediaSpec } from '../../../shared/types';
import { entityIdOf, type GameContext } from '../../core/context';
import type { GameMode } from '../../core/events';
import { markPart, type Layout } from './board';
import {
  drawArrowButton,
  drawImageLetterboxed,
  drawPageIndicator,
  drawPlaceholder,
  drawTextBoard,
  drawWebPlaceholder,
  type Ctx2D,
} from './draw';
import { currentSlide, letterbox, neighbourSlides, resolveSource, shortUrl, wrapSlide, type Quad } from './helpers';
import { EMBED_HINT, OverlayQuad, VIDEO_HINT } from './overlay';

const MAX_DISTANCE = 40;

// ---------------------------------------------------------------- Bild-Lader
const imageCache = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(url);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    img.src = url;
  });
  imageCache.set(url, promise);
  if (imageCache.size > 24) imageCache.delete(imageCache.keys().next().value as string);
  return promise;
}
/** Prüft, ob ein Bild ohne CORS im Browser darstellbar ist (dann nur als HTML-<img>, nicht als Textur). */
function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function defaultKind(entity: EntitySpec): MediaKind {
  return entity.media?.kind ?? 'image';
}

export class MediaSurface {
  readonly face: TransformNode;
  readonly screen: Mesh;
  private screenMat: StandardMaterial;
  private canvasTex: DynamicTexture | null = null;
  private canvasSize = { w: 0, h: 0 };
  private buttons: { mesh: Mesh; tex: DynamicTexture; mat: StandardMaterial }[] = [];
  private video: { el: HTMLVideoElement; tex: VideoTexture; plane: Mesh; mat: StandardMaterial; url: string } | null = null;
  private overlay: OverlayQuad | null = null;
  private overlayUrl = '';
  private token = 0;
  private sig = '';
  private toasted = new Set<string>();
  private entity: EntitySpec | null = null;
  private disposed = false;
  private occluded = false;
  private currentKind: MediaKind | null = null;
  private awaitingClick = false;

  constructor(
    private ctx: GameContext,
    readonly id: string,
    readonly root: TransformNode,
    private layout: Layout,
    /** Zusätzlich zu besitzende Teile (Rahmen etc.), werden mit entsorgt. */
    private owned: { meshes: Mesh[]; materials: StandardMaterial[] },
  ) {
    const { scene } = ctx;
    this.face = new TransformNode('media.face', scene);
    this.face.parent = root;
    this.face.position.set(layout.cx, layout.cy, layout.z);
    this.face.rotation.y = Math.PI;
    this.screen = CreatePlane('media.screen', { width: layout.width, height: layout.height }, scene);
    this.screen.parent = this.face;
    this.screenMat = new StandardMaterial('media.screen.mat', scene);
    this.styleUnlit(this.screenMat);
    this.screen.material = this.screenMat;
    markPart(this.screen, id, { mediaAction: 'toggle' });
    markPart(this.face, id);
  }

  private styleUnlit(mat: StandardMaterial) {
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = Color3.Black(); // Emissive-Textur wird zur Farbe ADDIERT, nicht multipliziert
    mat.fogEnabled = false;
    mat.backFaceCulling = true;
  }

  // ------------------------------------------------------------ Inhalte
  /** Übernimmt den aktuellen Entity-Zustand. Nur bei geänderten Medien-Feldern wird neu aufgebaut. */
  apply(entity: EntitySpec): void {
    if (this.disposed) return;
    this.entity = entity;
    const media: MediaSpec = entity.media ?? { kind: defaultKind(entity) };
    const sig = JSON.stringify([media, entity.material?.color, entity.state?.muted]);
    if (sig === this.sig) return;
    this.sig = sig;
    const kind = media.kind;
    if (kind !== this.currentKind) {
      this.clearDynamic();
      this.currentKind = kind;
    }
    const token = ++this.token;
    switch (kind) {
      case 'text':
        this.setButtons(false);
        this.drawCanvas((c, w, h) => drawTextBoard(c, w, h, media.text ?? '', entity.material?.color ?? '#f6f3ea'));
        break;
      case 'image':
        this.setButtons(false);
        void this.showImage(media.url, token, undefined);
        break;
      case 'slides': {
        const urls = media.urls ?? [];
        this.setButtons(urls.length > 1);
        const index = currentSlide(media);
        const label = urls.length > 0 ? `${index + 1} / ${urls.length}` : undefined;
        void this.showImage(urls[index], token, label, urls.length === 0 ? 'Keine Folien gewählt' : undefined);
        for (const n of neighbourSlides(index, urls.length)) {
          if (resolveSource('image', urls[n], location.href).mode === 'image') void loadImage(urls[n]).catch(() => undefined);
        }
        break;
      }
      case 'video':
        this.setButtons(false);
        this.showVideo(media.url, token, entity);
        break;
      case 'web':
        this.setButtons(false);
        this.showWeb(media.url);
        break;
    }
  }

  private toastOnce(key: string, text: string) {
    if (this.toasted.has(key)) return;
    this.toasted.add(key);
    this.ctx.bus.emit('ui.toast', { text, kind: 'error' });
  }

  private ensureCanvasTex(): DynamicTexture {
    const aspect = this.layout.width / this.layout.height;
    const w = aspect >= 1 ? 1280 : Math.round(1280 * aspect);
    const h = Math.round(w / aspect);
    if (!this.canvasTex || this.canvasSize.w !== w || this.canvasSize.h !== h) {
      this.canvasTex?.dispose();
      const tex = new DynamicTexture(`media.tex.${this.id}`, { width: w, height: h }, this.ctx.scene, true, Texture.TRILINEAR_SAMPLINGMODE);
      tex.anisotropicFilteringLevel = 4;
      this.canvasTex = tex;
      this.canvasSize = { w, h };
    }
    return this.canvasTex;
  }

  /** Zeichnet in die Canvas-Textur und zeigt sie auf dem Bildschirm. */
  private drawCanvas(draw: (ctx: Ctx2D, w: number, h: number) => void): void {
    const tex = this.ensureCanvasTex();
    const c = tex.getContext() as Ctx2D;
    c.save();
    draw(c, this.canvasSize.w, this.canvasSize.h);
    c.restore();
    tex.update(true);
    this.screenMat.emissiveTexture = tex;
    this.screen.setEnabled(true);
  }

  private placeholder(title: string, subtitle: string | undefined, tone: 'empty' | 'error' | 'loading') {
    this.drawCanvas((c, w, h) => drawPlaceholder(c, w, h, title, subtitle, tone));
  }

  private async showImage(raw: string | undefined, token: number, indicator: string | undefined, emptyTitle = 'Kein Bild gewählt'): Promise<void> {
    this.removeVideo();
    this.removeOverlay();
    const src = resolveSource('image', raw, location.href);
    if (src.mode === 'none') {
      this.placeholder(emptyTitle, 'Im Bau-Modus unter „Medien" ein Bild wählen', 'empty');
      return;
    }
    if (src.mode === 'error') {
      this.toastOnce(`e:${raw}`, `Ungültige Adresse: ${src.reason}`);
      this.placeholder('Bild nicht erlaubt', src.reason, 'error');
      return;
    }
    if (src.mode !== 'image') return;
    try {
      const img = await loadImage(src.url);
      if (this.disposed || token !== this.token) return;
      this.drawCanvas((c, w, h) => {
        drawImageLetterboxed(c, w, h, img, img.naturalWidth, img.naturalHeight);
        if (indicator) drawPageIndicator(c, w, h, indicator);
      });
    } catch {
      if (this.disposed || token !== this.token) return;
      // Ohne CORS lässt sich ein Bild nicht als Textur verwenden, wohl aber als HTML-Bild.
      if (await probeImage(src.url)) {
        if (this.disposed || token !== this.token) return;
        this.placeholder('Bild', shortUrl(src.url, 50), 'loading');
        this.showOverlay('img', src.url, src.url);
        return;
      }
      if (this.disposed || token !== this.token) return;
      this.toastOnce(`l:${src.url}`, 'Bild konnte nicht geladen werden.');
      this.placeholder('Bild konnte nicht geladen werden', shortUrl(src.url, 50), 'error');
    }
  }

  private showWeb(raw: string | undefined): void {
    this.removeVideo();
    const src = resolveSource('web', raw, location.href);
    if (src.mode === 'none') {
      this.removeOverlay();
      this.drawCanvas((c, w, h) => drawWebPlaceholder(c, w, h, undefined, EMBED_HINT));
      return;
    }
    if (src.mode === 'error') {
      this.removeOverlay();
      this.toastOnce(`e:${raw}`, `Ungültige Adresse: ${src.reason}`);
      this.placeholder('Adresse nicht erlaubt', src.reason, 'error');
      return;
    }
    if (src.mode !== 'web') return;
    this.drawCanvas((c, w, h) => drawWebPlaceholder(c, w, h, src.pageUrl, EMBED_HINT));
    this.showOverlay('iframe', src.url, src.pageUrl);
  }

  private showOverlay(kind: 'iframe' | 'img', url: string, pageUrl: string): void {
    if (!this.overlay || this.overlay.contentKind !== kind) {
      this.removeOverlay();
      this.overlay = new OverlayQuad(this.ctx.overlayRoot, kind, this.layout.width / this.layout.height, this.id);
    }
    if (this.overlayUrl !== url) {
      this.overlay.setSource(url, pageUrl);
      this.overlayUrl = url;
    }
  }

  private removeOverlay(): void {
    this.overlay?.dispose();
    this.overlay = null;
    this.overlayUrl = '';
  }

  private showVideo(raw: string | undefined, token: number, entity: EntitySpec): void {
    const src = resolveSource('video', raw, location.href);
    if (src.mode === 'web') {
      this.removeVideo();
      this.drawCanvas((c, w, h) => drawWebPlaceholder(c, w, h, src.pageUrl, VIDEO_HINT));
      this.showOverlay('iframe', src.url, src.pageUrl);
      return;
    }
    this.removeOverlay();
    if (src.mode === 'none') {
      this.removeVideo();
      this.placeholder('Kein Video gewählt', 'Im Bau-Modus unter „Medien" eine Video-Adresse eintragen', 'empty');
      return;
    }
    if (src.mode === 'error') {
      this.removeVideo();
      this.toastOnce(`e:${raw}`, `Ungültige Adresse: ${src.reason}`);
      this.placeholder('Video nicht erlaubt', src.reason, 'error');
      return;
    }
    if (src.mode !== 'video') return;
    if (this.video?.url === src.url) {
      if (entity.state?.muted !== false) this.video.el.muted = true;
      return;
    }
    this.removeVideo();
    this.placeholder('Video wird geladen …', shortUrl(src.url, 50), 'loading');
    const el = document.createElement('video');
    el.crossOrigin = 'anonymous';
    el.muted = true;
    el.loop = true;
    // Mit autoplay startet Babylon die Wiedergabe nicht nur kurz, um ein erstes Bild zu holen, und pausiert dann.
    el.autoplay = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    el.src = src.url; // vor der VideoTexture, sonst unterbricht das Setzen Babylons ersten play()-Aufruf
    const tex = new VideoTexture(`media.video.${this.id}`, el, this.ctx.scene, false, false, Texture.BILINEAR_SAMPLINGMODE, {
      autoPlay: true,
      loop: true,
      muted: true,
      autoUpdateTexture: true,
    });
    const mat = new StandardMaterial('media.video.mat', this.ctx.scene);
    this.styleUnlit(mat);
    mat.emissiveTexture = tex;
    const plane = CreatePlane('media.video', { width: this.layout.width, height: this.layout.height }, this.ctx.scene);
    plane.parent = this.face;
    plane.position.z = -0.002;
    plane.material = mat;
    plane.setEnabled(false);
    markPart(plane, this.id, { mediaAction: 'toggle' });
    this.video = { el, tex, plane, mat, url: src.url };
    const boxAspect = this.layout.width / this.layout.height;
    el.addEventListener('loadedmetadata', () => {
      if (this.disposed || token !== this.token || !this.video) return;
      const box = letterbox(el.videoWidth / Math.max(1, el.videoHeight), boxAspect);
      plane.scaling.set(box.w, box.h, 1);
    });
    el.addEventListener('loadeddata', () => {
      if (this.disposed || token !== this.token || !this.video) return;
      plane.setEnabled(true);
    });
    el.addEventListener('error', () => {
      if (this.disposed || token !== this.token || !this.video) return;
      plane.setEnabled(false);
      this.toastOnce(`v:${src.url}`, 'Video konnte nicht geladen werden.');
      this.placeholder('Video konnte nicht geladen werden', shortUrl(src.url, 50), 'error');
    });
    this.awaitingClick = false;
    el.play().catch(() => {
      if (this.disposed || token !== this.token) return;
      // Autoplay verweigert: Hinweis, Klick startet das Video.
      this.awaitingClick = true;
      this.placeholder('Zum Abspielen klicken', undefined, 'loading');
    });
  }

  private removeVideo(): void {
    const v = this.video;
    if (!v) return;
    this.video = null;
    v.plane.dispose(false, false);
    v.mat.dispose(true, true);
    v.tex.dispose(); // zuerst: entfernt Babylons Ereignis-Handler am Video
    v.el.pause();
    v.el.removeAttribute('src');
    v.el.load();
  }

  // ------------------------------------------------------------ Knöpfe
  private setButtons(on: boolean): void {
    if (!on) {
      for (const b of this.buttons) {
        b.mesh.dispose(false, false);
        b.mat.dispose(true, true);
        b.tex.dispose();
      }
      this.buttons = [];
      return;
    }
    if (this.buttons.length) return;
    const { scene } = this.ctx;
    const size = Math.min(0.34, this.layout.height * 0.2);
    for (const dir of ['prev', 'next'] as const) {
      const tex = new DynamicTexture(`media.btn.${dir}.${this.id}`, { width: 128, height: 128 }, scene, true);
      tex.hasAlpha = true;
      drawArrowButton(tex.getContext() as Ctx2D, 128, dir);
      tex.update();
      const mat = new StandardMaterial(`media.btn.mat.${dir}`, scene);
      this.styleUnlit(mat);
      mat.emissiveTexture = tex;
      mat.opacityTexture = tex;
      const mesh = CreatePlane(`media.btn.${dir}`, { size }, scene);
      mesh.parent = this.face;
      const x = this.layout.width / 2 - size * 0.75;
      mesh.position.set(dir === 'next' ? x : -x, -this.layout.height / 2 + size * 0.75, -0.004);
      mesh.material = mat;
      markPart(mesh, this.id, { mediaAction: dir });
      this.buttons.push({ mesh, tex, mat });
    }
  }

  // ------------------------------------------------------------ Bedienung
  /** Klick auf die Fläche im Spielmodus. */
  handleAction(action: string): void {
    const entity = this.entity;
    if (!entity) return;
    const { store } = this.ctx;
    if (action === 'prev' || action === 'next') {
      const media = entity.media;
      const n = media?.urls?.length ?? 0;
      if (!media || media.kind !== 'slides' || n < 2) return;
      const slide = wrapSlide(currentSlide(media), action === 'next' ? 1 : -1, n);
      store.getState().updateEntity(this.id, { media: { ...media, slide } }, { source: 'local' });
      return;
    }
    if (action === 'toggle' && this.video) {
      const el = this.video.el;
      if (entity.state?.muted === false && el.muted) {
        el.muted = false;
        void el.play().catch(() => undefined);
        this.awaitingClick = false;
        return;
      }
      if (el.paused) {
        void el.play().catch(() => undefined);
        this.awaitingClick = false;
      } else el.pause();
    }
  }

  // ------------------------------------------------------------ Overlay pro Frame
  /** Legt das HTML-Overlay (falls vorhanden) auf die projizierte Fläche. Aufruf nach dem Rendern. */
  tickOverlay(frame: number, mode: GameMode): void {
    const ov = this.overlay;
    if (!ov || this.disposed) return;
    const { scene, engine, canvas } = this.ctx;
    const cam = scene.activeCamera;
    const place = (quad: Quad | null) => ov.place(quad, mode === 'play');
    if (!cam || !this.root.isEnabled()) return place(null);
    this.face.computeWorldMatrix(true);
    const world = this.face.getWorldMatrix();
    const hw = this.layout.width / 2;
    const hh = this.layout.height / 2;
    const corners = [new Vector3(-hw, hh, 0), new Vector3(hw, hh, 0), new Vector3(hw, -hh, 0), new Vector3(-hw, -hh, 0)].map((p) =>
      Vector3.TransformCoordinates(p, world),
    );
    const center = Vector3.TransformCoordinates(Vector3.Zero(), world);
    const camPos = cam.globalPosition;
    // Rückseite? (Vorderseite der Tafel zeigt in Richtung -Z der Fläche.)
    const normal = Vector3.TransformNormal(new Vector3(0, 0, -1), world).normalize();
    const toCam = camPos.subtract(center);
    const dist = toCam.length();
    if (dist > MAX_DISTANCE || Vector3.Dot(normal, toCam) <= 0.001) return place(null);
    // Hinter der Kamera?
    const view = cam.getViewMatrix();
    for (const p of corners) if (Vector3.TransformCoordinates(p, view).z <= cam.minZ + 0.01) return place(null);
    const rw = engine.getRenderWidth();
    const rh = engine.getRenderHeight();
    const viewport = cam.viewport.toGlobal(rw, rh);
    const transform = scene.getTransformMatrix();
    const sx = canvas.clientWidth / rw;
    const sy = canvas.clientHeight / rh;
    const quad = corners.map((p) => {
      const s = Vector3.Project(p, Matrix.IdentityReadOnly, transform, viewport);
      return [s.x * sx, s.y * sy];
    }) as Quad;
    // Komplett außerhalb des Bildes?
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (quad.every((q) => q[0] < -20) || quad.every((q) => q[0] > cw + 20) || quad.every((q) => q[1] < -20) || quad.every((q) => q[1] > ch + 20)) {
      return place(null);
    }
    // Verdeckung durch andere Meshes (nur grob: Strahl zur Mitte, alle paar Frames).
    if ((frame + this.id.length) % 6 === 0) {
      const dir = center.subtract(camPos);
      const len = dir.length();
      const ray = new Ray(camPos.clone(), dir.scale(1 / Math.max(len, 1e-6)), Math.max(0, len - 0.08));
      const hit = scene.pickWithRay(ray, (m: AbstractMesh) => m.isVisible && m.isPickable && m.isEnabled() && m.visibility > 0 && entityIdOf(m) !== this.id && !m.name.startsWith('env.sky'));
      this.occluded = !!hit?.hit;
    }
    if (this.occluded) return place(null);
    place(quad);
  }

  get hasOverlay(): boolean {
    return !!this.overlay;
  }
  get overlayElement(): HTMLElement | null {
    return this.overlay?.el ?? null;
  }
  get playingAwaitingClick(): boolean {
    return this.awaitingClick;
  }

  // ------------------------------------------------------------ Aufräumen
  private clearDynamic(): void {
    this.removeVideo();
    this.removeOverlay();
    this.setButtons(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.token += 1;
    this.clearDynamic();
    this.canvasTex?.dispose();
    this.canvasTex = null;
    this.screenMat.dispose(true, true);
    this.screen.dispose(false, false);
    this.face.dispose(false, false);
    for (const mesh of this.owned.meshes) mesh.dispose(false, false);
    for (const mat of this.owned.materials) mat.dispose(true, true);
  }
}
