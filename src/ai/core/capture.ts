/**
 * Screenshot der Welt für die KI („look“). Rendert mit einer eigenen, kurzlebigen Kamera in eine Textur;
 * die Spielkamera bleibt unverändert. Ergebnis: Base64-JPEG ohne Präfix.
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateScreenshotUsingRenderTargetAsync } from '@babylonjs/core/Misc/screenshotTools';
import { AI_LIMITS } from '../../../shared/aiTools';
import type { Vec3 } from '../../../shared/types';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { GameContext } from '../../core/context';

export const VIEW_NAMES = ['front', 'back', 'left', 'right', 'top', 'iso'] as const;
export type ViewName = (typeof VIEW_NAMES)[number];

export interface ViewRequest {
  center: Vec3;
  /** Radius der Kugel um das Ziel, die ins Bild passen soll (Meter). */
  radius: number;
  view: ViewName;
  /** Kameraabstand in Metern; fehlt er, wird er aus dem Radius berechnet. */
  distance?: number;
  /** Zwei Ansichten nebeneinander in einem Bild (ersetzt `view`). */
  views?: [ViewName, ViewName];
  /** Entity-ids, die farbig hervorgehoben werden. */
  highlight?: string[];
}

/** Blickwinkel der Orbit-Kamera: alpha um die Y-Achse (von +X aus), beta von oben (0) nach unten. */
export function viewAngles(view: ViewName): { alpha: number; beta: number } {
  switch (view) {
    case 'front':
      return { alpha: -Math.PI / 2, beta: 1.2 }; // Kamera bei −Z
    case 'back':
      return { alpha: Math.PI / 2, beta: 1.2 }; // Kamera bei +Z
    case 'left':
      return { alpha: Math.PI, beta: 1.2 }; // Kamera bei −X
    case 'right':
      return { alpha: 0, beta: 1.2 }; // Kamera bei +X
    case 'top':
      return { alpha: -Math.PI / 2, beta: 0.05 };
    default:
      return { alpha: -Math.PI / 4, beta: 1.0 }; // schräg von −Z/+X
  }
}

export const CAPTURE_FOV = 0.9;

export function cameraDistance(radius: number, distance?: number): number {
  if (distance !== undefined && Number.isFinite(distance)) return Math.min(200, Math.max(2, distance));
  // So weit weg, dass die Kugel mit etwas Rand ins Bild passt.
  const fit = radius / Math.sin(CAPTURE_FOV / 2);
  return Math.min(200, Math.max(5, fit * 1.15));
}

async function renderView(ctx: Pick<GameContext, 'scene' | 'engine'>, req: ViewRequest, view: ViewName, width: number, height: number): Promise<string | null> {
  const { alpha, beta } = viewAngles(view);
  const camera = new ArcRotateCamera('ai.look', alpha, beta, cameraDistance(req.radius, req.distance), new Vector3(...req.center), ctx.scene);
  camera.fov = CAPTURE_FOV;
  camera.minZ = 0.1;
  camera.maxZ = 2000;
  try {
    const url = await CreateScreenshotUsingRenderTargetAsync(ctx.engine, camera, { width, height }, 'image/jpeg', 1, true, undefined, false, false, true, 0.72);
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(url);
    return m ? m[1] : null;
  } catch {
    return null;
  } finally {
    camera.dispose();
  }
}

function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild nicht lesbar'));
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

/** Zwei JPEGs (Base64) nebeneinander zu einem Bild zusammenfügen. */
async function stitch(a: string, b: string, width: number, height: number): Promise<string | null> {
  try {
    const [ia, ib] = await Promise.all([loadImage(a), loadImage(b)]);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(ia, 0, 0, width / 2, height);
    g.drawImage(ib, width / 2, 0, width / 2, height);
    g.fillStyle = '#ffffff';
    g.fillRect(width / 2 - 1, 0, 2, height);
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(canvas.toDataURL('image/jpeg', 0.72));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Markiert die Meshes der Objekte farbig und gibt eine Funktion zurück, die alles zurücksetzt. */
function highlightEntities(ctx: Pick<GameContext, 'entityNodes'>, ids: readonly string[]): () => void {
  const saved: Array<{ mesh: AbstractMesh; overlay: boolean; color: Color3; alpha: number }> = [];
  for (const id of ids.slice(0, 400)) {
    const node = ctx.entityNodes?.get(id);
    if (!node) continue;
    const meshes = [...node.getChildMeshes(false)] as AbstractMesh[];
    if (typeof (node as AbstractMesh).getTotalVertices === 'function') meshes.push(node as AbstractMesh);
    for (const mesh of meshes) {
      saved.push({ mesh, overlay: mesh.renderOverlay, color: mesh.overlayColor, alpha: mesh.overlayAlpha });
      mesh.renderOverlay = true;
      mesh.overlayColor = new Color3(1, 0.15, 0.75);
      mesh.overlayAlpha = 0.4;
    }
  }
  return () => {
    for (const s of saved) {
      s.mesh.renderOverlay = s.overlay;
      s.mesh.overlayColor = s.color;
      s.mesh.overlayAlpha = s.alpha;
    }
  };
}

export async function captureView(ctx: Pick<GameContext, 'scene' | 'engine' | 'entityNodes'>, req: ViewRequest): Promise<string | null> {
  const restore = req.highlight && req.highlight.length > 0 ? highlightEntities(ctx, req.highlight) : () => {};
  try {
    const W = AI_LIMITS.screenshotWidth;
    const H = AI_LIMITS.screenshotHeight;
    if (req.views) {
      const a = await renderView(ctx, req, req.views[0], W / 2, H);
      const b = await renderView(ctx, req, req.views[1], W / 2, H);
      if (a && b) return (await stitch(a, b, W, H)) ?? a;
      return a ?? b;
    }
    return await renderView(ctx, req, req.view, W, H);
  } finally {
    restore();
  }
}
