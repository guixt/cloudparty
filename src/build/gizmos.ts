/** Gizmos (Verschieben/Drehen/Skalieren) mit Raster-Snap und Schreiben in den Store. */
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import '@babylonjs/core/Gizmos/positionGizmo';
import '@babylonjs/core/Gizmos/rotationGizmo';
import '@babylonjs/core/Gizmos/scaleGizmo';
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Observable } from '@babylonjs/core/Misc/observable';
import type { Transform, Vec3 } from '../../shared/types';
import type { GameContext } from '../core/context';
import type { History } from './history';
import { moveTransforms, pivotOf, quatConj, quatMul, rotateTransforms, scaleTransforms } from './multi';
import { boxOfEntity } from './placement';
import { SNAP_POSITION, SNAP_ROTATION_DEG, SNAP_SCALE } from './logic';
import type { Tool } from './state';

export class GizmoController {
  private manager: GizmoManager | null = null;
  private node: TransformNode | null = null;
  private entityId: string | null = null;
  private tool: Tool = 'move';
  private snap = true;
  private active = false;
  /** Mehrfachauswahl: Mitglieder, unsichtbarer Pivot und Startzustand der Geste. */
  private multiIds: string[] = [];
  private pivot: TransformNode | null = null;
  private start: { pos: Vec3; members: Map<string, Transform> } | null = null;
  dragging = false;
  lastDragEnd = 0;

  constructor(
    private ctx: GameContext,
    private history: History,
  ) {}

  /** true, wenn der Zeiger über einem Gizmo-Griff liegt (dann kein Marquee). */
  hovering(): boolean {
    const g = this.manager?.gizmos;
    return !!g && [g.positionGizmo, g.rotationGizmo, g.scaleGizmo].some((x) => x && (x as unknown as { isHovered?: boolean }).isHovered);
  }

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
      this.multiIds = [];
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

  /** Hängt die Gizmos an die Auswahl: ein Objekt direkt, mehrere über einen Pivot im Mittelpunkt. */
  attachSelection(ids: string[]): void {
    if (this.dragging) return;
    if (ids.length < 2) {
      this.multiIds = [];
      this.attach(ids[0] ?? null);
      return;
    }
    this.multiIds = ids.filter((id) => this.ctx.store.getState().entities[id]);
    if (!this.pivot) this.pivot = new TransformNode('build.pivot', this.ctx.scene);
    const pivot = this.pivot;
    const p = pivotOf(this.multiIds.map((id) => boxOfEntity(this.ctx, id)));
    pivot.position.set(p[0], p[1], p[2]);
    pivot.rotationQuaternion = Quaternion.Identity();
    pivot.scaling.setAll(1);
    this.attachNode(null, pivot);
  }

  /** Pivot und Gizmo neu ausrichten (nach Undo, Inspector-Änderung, Knoten-Neuaufbau). */
  refresh(): void {
    if (this.multiIds.length > 1 && !this.dragging && this.active) this.attachSelection(this.multiIds);
  }

  /** Aufruf bei entity.node.created: Knoten wurde neu aufgebaut. */
  onNodeCreated(id: string, node: TransformNode): void {
    if (this.active && id === this.entityId) this.attachNode(id, node);
    else if (this.multiIds.includes(id)) this.refresh();
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
      if (this.multiIds.length > 1 && this.pivot) {
        this.dragging = true;
        const members = new Map<string, Transform>();
        for (const id of this.multiIds) {
          const e = this.ctx.store.getState().entities[id];
          if (!e) continue;
          members.set(id, structuredClone(e.transform));
          this.history.pin(id);
        }
        this.start = { pos: [this.pivot.position.x, this.pivot.position.y, this.pivot.position.z], members };
        return;
      }
      if (!this.entityId) return;
      this.dragging = true;
      this.history.pin(this.entityId);
    });
    drag.add(() => this.write(true));
    end.add(() => {
      if (!this.dragging) return;
      this.write(false);
      this.dragging = false;
      this.lastDragEnd = performance.now();
      if (this.start) {
        for (const id of this.start.members.keys()) this.history.unpin(id);
        this.start = null;
        this.refresh();
      } else if (this.entityId) this.history.unpin(this.entityId);
    });
  }

  /** Aktuelle Knoten-Transform in den Store schreiben (transient beim Ziehen, final am Ende). */
  private writeMulti(transient: boolean): void {
    const { pivot, start } = this;
    if (!pivot || !start) return;
    const ids = [...start.members.keys()];
    const ts = ids.map((id) => start.members.get(id)!);
    const sq = pivot.rotationQuaternion ?? Quaternion.Identity();
    let out: Transform[];
    if (this.tool === 'move') {
      out = moveTransforms(ts, [pivot.position.x - start.pos[0], pivot.position.y - start.pos[1], pivot.position.z - start.pos[2]]);
    } else if (this.tool === 'rotate') {
      out = rotateTransforms(ts, start.pos, quatMul([sq.x, sq.y, sq.z, sq.w], quatConj([0, 0, 0, 1])));
    } else {
      const r = [pivot.scaling.x, pivot.scaling.y, pivot.scaling.z];
      const f = r.reduce((best, v) => (Math.abs(v - 1) > Math.abs(best - 1) ? v : best), 1);
      out = scaleTransforms(ts, start.pos, Math.max(0.01, f));
    }
    const store = this.ctx.store.getState();
    if (!transient) this.ctx.bus.emit('history.group.begin', {});
    try {
      ids.forEach((id, i) => store.updateEntity(id, { transform: out[i] }, { transient, source: 'local' }));
    } finally {
      if (!transient) this.ctx.bus.emit('history.group.end', {});
    }
  }

  private write(transient: boolean): void {
    if (this.start) return this.writeMulti(transient);
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
    this.pivot?.dispose();
    this.pivot = null;
  }
}
