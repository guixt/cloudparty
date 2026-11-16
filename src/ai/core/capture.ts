/**
 * Screenshot der Welt für die KI („look“). Rendert mit einer eigenen, kurzlebigen Kamera in eine Textur;
 * die Spielkamera bleibt unverändert. Ergebnis: Base64-JPEG ohne Präfix.
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateScreenshotUsingRenderTargetAsync } from '@babylonjs/core/Misc/screenshotTools';
import { AI_LIMITS } from '../../../shared/aiTools';
import type { Vec3 } from '../../../shared/types';
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

export async function captureView(ctx: Pick<GameContext, 'scene' | 'engine'>, req: ViewRequest): Promise<string | null> {
  const { alpha, beta } = viewAngles(req.view);
  const camera = new ArcRotateCamera('ai.look', alpha, beta, cameraDistance(req.radius, req.distance), new Vector3(...req.center), ctx.scene);
  camera.fov = CAPTURE_FOV;
  camera.minZ = 0.1;
  camera.maxZ = 2000;
  try {
    const url = await CreateScreenshotUsingRenderTargetAsync(
      ctx.engine,
      camera,
      { width: AI_LIMITS.screenshotWidth, height: AI_LIMITS.screenshotHeight },
      'image/jpeg',
      1,
      true,
      undefined,
      false,
      false,
      true,
      0.72,
    );
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(url);
    return m ? m[1] : null;
  } catch {
    return null;
  } finally {
    camera.dispose();
  }
}
