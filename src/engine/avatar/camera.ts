/**
 * Third-Person-Kamera: ArcRotate-Orbit um den Kopfbereich des Avatars, mit Maus-Drag,
 * Mausrad-Zoom, sanftem Nachziehen und Bodenschutz.
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

export const CAMERA_NAME = 'avatar.camera';
const MIN_CAMERA_Y = 0.35;

/** Größte Neigung (beta), bei der die Kamera noch über `minY` bleibt. Rein rechnerisch, getestet. */
export function maxBetaAboveGround(targetY: number, radius: number, minY: number): number {
  const c = (minY - targetY) / Math.max(radius, 0.01);
  if (c >= 1) return 0.2;
  if (c <= -1) return Math.PI - 0.1;
  return Math.min(Math.PI - 0.1, Math.max(0.2, Math.acos(c)));
}

export class AvatarCamera {
  readonly camera: ArcRotateCamera;
  private attached = false;
  private readonly desired = new Vector3();
  private snapNext = true;

  constructor(
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const camera = new ArcRotateCamera(CAMERA_NAME, -Math.PI / 2, 1.2, 5.5, new Vector3(0, 1.4, 0), scene);
    camera.lowerRadiusLimit = 1.6;
    camera.upperRadiusLimit = 30;
    camera.lowerBetaLimit = 0.2;
    camera.upperBetaLimit = Math.PI / 2 + 0.35;
    camera.wheelDeltaPercentage = 0.012;
    camera.panningSensibility = 0; // kein Verschieben
    camera.angularSensibilityX = 700;
    camera.angularSensibilityY = 700;
    camera.inertia = 0.82;
    camera.minZ = 0.1;
    camera.maxZ = 4000;
    camera.fov = 0.9;
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput'); // Pfeiltasten steuern den Avatar
    this.camera = camera;
  }

  /** Kamera hinter den Avatar drehen (yaw = Blickrichtung des Avatars). */
  faceBehind(yaw: number): void {
    this.camera.alpha = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    this.camera.beta = 1.25;
  }

  /** Beim nächsten update() ohne Glättung springen (Teleport/Respawn). */
  snap(): void {
    this.snapNext = true;
  }

  activate(): void {
    this.scene.activeCamera = this.camera;
    this.attach();
  }

  attach(): void {
    if (this.attached) return;
    this.camera.attachControl(this.canvas, true);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    this.camera.detachControl();
    this.attached = false;
  }

  /** Horizontale Blickrichtung der Kamera (für Bewegung relativ zur Kamera). */
  forward2D(): [number, number] {
    const t = this.camera.target;
    const p = this.camera.position;
    return [t.x - p.x, t.z - p.z];
  }

  update(dt: number, feet: readonly [number, number, number], focusHeight: number): void {
    this.desired.set(feet[0], feet[1] + focusHeight, feet[2]);
    const target = this.camera.target;
    if (this.snapNext) {
      target.copyFrom(this.desired);
      this.snapNext = false;
    } else {
      const k = 1 - Math.exp(-dt * 14);
      target.x += (this.desired.x - target.x) * k;
      target.y += (this.desired.y - target.y) * Math.min(1, k * 0.8);
      target.z += (this.desired.z - target.z) * k;
    }
    this.camera.upperBetaLimit = Math.min(Math.PI / 2 + 0.35, maxBetaAboveGround(target.y, this.camera.radius, MIN_CAMERA_Y));
    if (this.camera.beta > this.camera.upperBetaLimit) this.camera.beta = this.camera.upperBetaLimit;
  }

  dispose(): void {
    this.detach();
    if (this.scene.activeCamera === this.camera) this.scene.activeCamera = null;
    this.camera.dispose();
  }
}
