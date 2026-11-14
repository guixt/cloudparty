/** Orbit-Kamera des Build-Modus. */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext } from '../core/context';
import { isTyping } from './state';

export const BUILD_CAMERA_NAME = 'build.camera';

const PAN_KEYS: Record<string, 'f' | 'b' | 'l' | 'r' | 'u' | 'd'> = {
  w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r', e: 'u', q: 'd',
};

export class BuildCamera {
  readonly camera: ArcRotateCamera;
  private previous: Camera | null = null;
  private active = false;
  private keys = new Set<string>();
  private frameObserver: Observer<Scene> | null = null;
  private altOrbit: { x: number; y: number } | null = null;
  /** true, wenn der letzte Mausdruck eine Kamerabewegung war (kein Auswahlklick). */
  suppressTap = false;
  private cleanups: (() => void)[] = [];

  constructor(private ctx: GameContext) {
    const { scene } = ctx;
    const camera = new ArcRotateCamera(BUILD_CAMERA_NAME, -Math.PI / 2, 1.0, 14, new Vector3(0, 1, 0), scene);
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 160;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 2.3;
    camera.wheelPrecision = 12;
    camera.minZ = 0.1;
    camera.maxZ = 2000;
    camera.panningSensibility = 0;
    camera.inertia = 0.75;
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    const pointers = camera.inputs.attached.pointers as unknown as { buttons: number[] } | undefined;
    if (pointers) pointers.buttons = [1, 2];
    this.camera = camera;
  }

  get isActive(): boolean {
    return this.active;
  }

  enter(): void {
    if (this.active) return;
    const { scene, canvas } = this.ctx;
    const prev = scene.activeCamera && scene.activeCamera !== this.camera ? scene.activeCamera : this.previous;
    this.previous = prev ?? null;
    if (prev) {
      const target = prev instanceof ArcRotateCamera ? prev.target.clone() : prev.globalPosition.add(prev.getForwardRay().direction.scale(8));
      const pos = prev.globalPosition.clone();
      if (Vector3.Distance(target, pos) < 0.5) target.addInPlace(prev.getForwardRay().direction.scale(5));
      this.camera.setTarget(target);
      this.camera.setPosition(pos);
    }
    scene.activeCamera = this.camera;
    this.camera.attachControl(canvas, false);
    this.active = true;
    this.keys.clear();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
      const dir = PAN_KEYS[e.key.toLowerCase()];
      if (dir) {
        this.keys.add(dir);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const dir = PAN_KEYS[e.key.toLowerCase()];
      if (dir) this.keys.delete(dir);
    };
    const onBlur = () => this.keys.clear();
    const onDown = (e: PointerEvent) => {
      this.suppressTap = false;
      if (e.button === 0 && e.altKey) {
        this.altOrbit = { x: e.clientX, y: e.clientY };
        this.suppressTap = true;
        canvas.setPointerCapture?.(e.pointerId);
      } else if (e.button === 1 || e.button === 2) {
        this.suppressTap = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!this.altOrbit) return;
      this.camera.alpha -= (e.clientX - this.altOrbit.x) * 0.008;
      this.camera.beta = Math.min(this.camera.upperBetaLimit!, Math.max(this.camera.lowerBetaLimit!, this.camera.beta - (e.clientY - this.altOrbit.y) * 0.008));
      this.altOrbit = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (this.altOrbit) canvas.releasePointerCapture?.(e.pointerId);
      this.altOrbit = null;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    this.cleanups.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => canvas.removeEventListener('pointerdown', onDown, true),
      () => canvas.removeEventListener('pointermove', onMove),
      () => canvas.removeEventListener('pointerup', onUp),
    );
    this.frameObserver = scene.onBeforeRenderObservable.add(() => this.pan());
  }

  /** Beendet den Build-Modus; stellt die vorige Kamera notfalls selbst wieder her. */
  leave(): void {
    if (!this.active) return;
    const { scene, canvas } = this.ctx;
    this.active = false;
    this.camera.detachControl();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.frameObserver) scene.onBeforeRenderObservable.remove(this.frameObserver);
    this.frameObserver = null;
    this.keys.clear();
    this.altOrbit = null;
    const restore = () => {
      if (scene.activeCamera === this.camera && this.previous && !this.previous.isDisposed()) scene.activeCamera = this.previous;
    };
    restore(); // Der Avatar-Modul-Handler kam evtl. schon vorher; sonst nächster Frame
    scene.onBeforeRenderObservable.addOnce(restore);
  }

  private pan(): void {
    if (this.keys.size === 0) return;
    const dt = Math.min(0.1, this.ctx.engine.getDeltaTime() / 1000);
    const speed = Math.max(3, this.camera.radius * 0.9) * dt;
    const forward = this.camera.getForwardRay().direction.clone();
    forward.y = 0;
    if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();
    const move = Vector3.Zero();
    if (this.keys.has('f')) move.addInPlace(forward);
    if (this.keys.has('b')) move.subtractInPlace(forward);
    if (this.keys.has('r')) move.addInPlace(right);
    if (this.keys.has('l')) move.subtractInPlace(right);
    if (this.keys.has('u')) move.y += 1;
    if (this.keys.has('d')) move.y -= 1;
    if (move.lengthSquared() === 0) return;
    this.camera.target.addInPlace(move.normalize().scale(speed));
  }

  /** Richtet die Kamera auf einen Knoten aus (Taste F). */
  focus(node: TransformNode | null | undefined): void {
    if (!node) return;
    const { min, max } = node.getHierarchyBoundingVectors(true);
    const center = min.add(max).scale(0.5);
    const size = Math.max(0.5, Vector3.Distance(min, max));
    this.camera.setTarget(center);
    this.camera.radius = Math.min(this.camera.upperRadiusLimit!, Math.max(3, size * 1.8));
  }

  dispose(): void {
    this.leave();
    this.camera.dispose();
  }
}
