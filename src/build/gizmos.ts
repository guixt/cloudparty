/** Gizmos (Verschieben/Drehen/Skalieren) mit Raster-Snap und Schreiben in den Store. */
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import '@babylonjs/core/Gizmos/positionGizmo';
import '@babylonjs/core/Gizmos/rotationGizmo';
import '@babylonjs/core/Gizmos/scaleGizmo';
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Observable } from '@babylonjs/core/Misc/observable';
import type { Transform } from '../../shared/types';
import type { GameContext } from '../core/context';
import type { History } from './history';
import { SNAP_POSITION, SNAP_ROTATION_DEG, SNAP_SCALE } from './logic';
import type { Tool } from './state';

export class GizmoController {
  private manager: GizmoManager | null = null;
  private node: TransformNode | null = null;
  private entityId: string | null = null;
  private tool: Tool = 'move';
  private snap = true;
  private active = false;
  dragging = false;
  lastDragEnd = 0;

  constructor(
    private ctx: GameContext,
    private history: History,
  ) {}

  private ensure(): GizmoManager {
    if (!this.manager) {
      const manager = new GizmoManager(this.ctx.scene);
      manager.usePointerToAttachGizmos = false;
      manager.clearGizmoOnEmptyPointerEvent = false;
      this.manager = manager;
    }
    return this.manager;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.attachNode(null, null);
      return;
    }
    this.apply();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.apply();
  }
  setSnap(snap: boolean): void {
    this.snap = snap;
    this.applySnap();
  }

  /** Hängt die Gizmos an den Knoten der Entity (oder löst sie bei null). */
  attach(entityId: string | null): void {
    const node = entityId ? (this.ctx.entityNodes.get(entityId) ?? null) : null;
    this.attachNode(entityId, node);
  }

  /** Aufruf bei entity.node.created: Knoten wurde neu aufgebaut. */
  onNodeCreated(id: string, node: TransformNode): void {
    if (this.active && id === this.entityId) this.attachNode(id, node);
  }
  onNodeDisposed(id: string): void {
    if (id === this.entityId && !this.dragging) this.attachNode(this.entityId, null);
  }

  private attachNode(id: string | null, node: TransformNode | null): void {
    this.entityId = id;
    this.node = node;
    if (!this.active && !this.manager) return;
    const manager = this.ensure();
    if (node && !node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
    manager.attachToNode(node);
  }

  private apply(): void {
    if (!this.active) return;
    const manager = this.ensure();
    manager.positionGizmoEnabled = this.tool === 'move';
    manager.rotationGizmoEnabled = this.tool === 'rotate';
    manager.scaleGizmoEnabled = this.tool === 'scale';
    const { positionGizmo, rotationGizmo, scaleGizmo } = manager.gizmos;
    if (positionGizmo) positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    if (rotationGizmo) rotationGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    for (const gizmo of [positionGizmo, rotationGizmo, scaleGizmo]) {
      if (!gizmo || (gizmo as unknown as { __cpHooked?: boolean }).__cpHooked) continue;
      (gizmo as unknown as { __cpHooked?: boolean }).__cpHooked = true;
      this.hook(gizmo.onDragStartObservable, gizmo.onDragObservable, gizmo.onDragEndObservable);
    }
    this.applySnap();
    if (this.node) manager.attachToNode(this.node);
  }

  private applySnap(): void {
    const g = this.manager?.gizmos;
    if (!g) return;
    if (g.positionGizmo) g.positionGizmo.snapDistance = this.snap ? SNAP_POSITION : 0;
    if (g.rotationGizmo) g.rotationGizmo.snapDistance = this.snap ? (SNAP_ROTATION_DEG * Math.PI) / 180 : 0;
    if (g.scaleGizmo) g.scaleGizmo.snapDistance = this.snap ? SNAP_SCALE : 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hook(start: Observable<any>, drag: Observable<any>, end: Observable<any>): void {
    start.add(() => {
      if (!this.entityId) return;
      this.dragging = true;
      this.history.pin(this.entityId);
    });
    drag.add(() => this.write(true));
    end.add(() => {
      this.write(false);
      this.dragging = false;
      this.lastDragEnd = performance.now();
      if (this.entityId) this.history.unpin(this.entityId);
    });
  }

  /** Aktuelle Knoten-Transform in den Store schreiben (transient beim Ziehen, final am Ende). */
  private write(transient: boolean): void {
    const node = this.node;
    const id = this.entityId;
    if (!node || !id) return;
    const q = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
    const transform: Transform = {
      pos: [node.position.x, node.position.y, node.position.z],
      rot: [q.x, q.y, q.z, q.w],
      scale: [node.scaling.x, node.scaling.y, node.scaling.z],
    };
    this.ctx.store.getState().updateEntity(id, { transform }, { transient, source: 'local' });
  }

  dispose(): void {
    this.manager?.dispose();
    this.manager = null;
  }
}
