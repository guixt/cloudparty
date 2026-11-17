/**
 * Sanfte Bewegung der Darstellung: Der Store hat die neue Lage sofort (Wahrheit für Physik, Speichern, Netz);
 * die Knoten gleiten nur über die gewünschte Dauer dorthin. Mit `orbit` bewegt sich eine ganze Gruppe wie ein starrer Körper
 * auf einer Kreisbahn um einen Drehpunkt (Riesenrad, Zugbrücke, Tür).
 */
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { EntitySpec, Vec3 } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import type { GameEvents } from '../../core/events';

export type Ease = 'linear' | 'inOut' | 'out';

export function easeValue(ease: Ease, f: number): number {
  const t = Math.max(0, Math.min(1, f));
  if (ease === 'linear') return t;
  if (ease === 'out') return 1 - (1 - t) * (1 - t);
  return t * t * (3 - 2 * t);
}

interface Active {
  id: string;
  node: TransformNode;
  startPos: Vector3;
  startRot: Quaternion;
  startScale: Vector3;
  t0: number;
  duration: number;
  ease: Ease;
  orbit?: { pivot: Vector3; axis: Vector3; angle: number };
}

const MAX_ACTIVE = 3000;

export class TweenManager {
  private active = new Map<string, Active>();
  private disposers: (() => void)[] = [];

  constructor(
    private readonly ctx: GameContext,
    private readonly now: () => number = () => performance.now(),
  ) {
    const observer = ctx.scene.onBeforeRenderObservable.add(() => this.step());
    this.disposers.push(
      () => ctx.scene.onBeforeRenderObservable.remove(observer),
      ctx.bus.on('entity.tween', (e) => this.start(e)),
      ctx.bus.on('entity.node.disposed', ({ id }) => void this.active.delete(id)),
    );
  }

  get activeCount(): number {
    return this.active.size;
  }

  start(e: GameEvents['entity.tween']): void {
    const t0 = this.now();
    const duration = Math.max(0.001, e.duration) * 1000;
    const orbit = e.orbit && e.orbit.angleDeg !== 0 ? { pivot: new Vector3(...e.orbit.pivot), axis: new Vector3(...e.orbit.axis).normalize(), angle: (e.orbit.angleDeg * Math.PI) / 180 } : undefined;
    for (const id of e.ids) {
      if (this.active.size >= MAX_ACTIVE && !this.active.has(id)) break;
      const node = this.ctx.entityNodes.get(id);
      if (!node) continue;
      // Start = aktuelle Darstellung (auch mitten in einer früheren Bewegung).
      this.active.set(id, {
        id,
        node,
        startPos: node.position.clone(),
        startRot: node.rotationQuaternion ? node.rotationQuaternion.clone() : Quaternion.Identity(),
        startScale: node.scaling.clone(),
        t0,
        duration,
        ease: e.ease,
        orbit,
      });
    }
  }

  private finish(a: Active, entity: EntitySpec | undefined): void {
    this.active.delete(a.id);
    if (!entity || a.node.isDisposed()) return;
    const { pos, rot, scale } = entity.transform;
    a.node.position.set(pos[0], pos[1], pos[2]);
    if (!a.node.rotationQuaternion) a.node.rotationQuaternion = new Quaternion();
    a.node.rotationQuaternion.set(rot[0], rot[1], rot[2], rot[3]);
    a.node.scaling.set(scale[0], scale[1], scale[2]);
  }

  step(): void {
    if (this.active.size === 0) return;
    const t = this.now();
    const entities = this.ctx.store.getState().entities;
    for (const a of [...this.active.values()]) {
      const entity = entities[a.id];
      if (!entity || a.node.isDisposed()) {
        this.active.delete(a.id);
        continue;
      }
      const raw = (t - a.t0) / a.duration;
      if (raw >= 1) {
        this.finish(a, entity);
        continue;
      }
      const f = easeValue(a.ease, raw);
      if (!a.node.rotationQuaternion) a.node.rotationQuaternion = new Quaternion();
      if (a.orbit) {
        const q = Quaternion.RotationAxis(a.orbit.axis, a.orbit.angle * f);
        const rel = a.startPos.subtract(a.orbit.pivot);
        const rotated = new Vector3();
        rel.rotateByQuaternionToRef(q, rotated);
        a.node.position.copyFrom(a.orbit.pivot.add(rotated));
        a.node.rotationQuaternion.copyFrom(q.multiply(a.startRot));
        continue;
      }
      const { pos, rot, scale } = entity.transform;
      Vector3.LerpToRef(a.startPos, new Vector3(pos[0], pos[1], pos[2]), f, a.node.position);
      Quaternion.SlerpToRef(a.startRot, new Quaternion(rot[0], rot[1], rot[2], rot[3]), f, a.node.rotationQuaternion);
      Vector3.LerpToRef(a.startScale, new Vector3(scale[0], scale[1], scale[2]), f, a.node.scaling);
    }
  }

  dispose(): void {
    this.active.clear();
    for (const d of this.disposers.splice(0)) d();
  }
}

export type { Vec3 };
