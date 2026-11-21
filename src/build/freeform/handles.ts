/**
 * Kontrollpunkt-Griffe für die ausgewählte Freiform (Baumodus). Kugeln, die immer vor der Szene gezeichnet werden
 * (Renderreihenfolge-Gruppe 1, ohne Tiefenschreiben), als Build-Marker (`buildOnly`) markiert: nicht exportiert,
 * nicht als Objekt gewählt. Ziehen mit der linken Maustaste verschiebt den Punkt:
 * - Sweep: horizontale Ebene durch den Punkt; Drehkörper: Ebene der Profilachse (lokale X/Y der Entity);
 * - Fläche: Ebene parallel zur Kamera, mit gehaltener Shift-Taste horizontal.
 * Der State wird beim Ziehen transient geschrieben, am Ende einmal dauerhaft (ein Undo-Schritt).
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { FREEFORM_REF, type FreeformState } from '../../../shared/freeform';
import type { Vec3 } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { markBuildOnly } from '../../world/entities/parts';
import type { History } from '../history';
import { SNAP_POSITION } from '../logic';
import { buildState } from '../state';
import { applyHandle, dragPlaneNormal, handlesOf, localToWorld, rayPlane, worldToLocal, type HandleRef } from './handles.logic';

const COLOR = new Color3(1, 0.62, 0.1);
const COLOR_HOT = new Color3(1, 1, 0.35);
/** Bildschirmgröße: Durchmesser = Kameraabstand * Faktor (konstante scheinbare Größe). */
const SIZE_FACTOR = 0.035;

interface Handle {
  ref: HandleRef;
  mesh: Mesh;
}

export class FreeformHandles {
  private handles: Handle[] = [];
  private entityId: string | null = null;
  private material: StandardMaterial | null = null;
  private hotMaterial: StandardMaterial | null = null;
  private offs: (() => void)[] = [];
  private drag: { handle: Handle; offset: Vec3; world: Vec3; moved: boolean; last: FreeformState } | null = null;
  private hot: Handle | null = null;
  dragging = false;
  lastDragEnd = 0;

  constructor(
    private ctx: GameContext,
    private history: History,
  ) {}

  attach(): void {
    const { bus, scene, canvas } = this.ctx;
    const sync = () => this.sync();
    const beforeRender = scene.onBeforeRenderObservable.add(() => this.rescale());
    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.offs.push(
      () => scene.onBeforeRenderObservable.remove(beforeRender),
      () => canvas.removeEventListener('pointerdown', down),
      () => window.removeEventListener('pointermove', move),
      () => window.removeEventListener('pointerup', up),
      bus.on('mode.changed', sync),
      bus.on('selection.changed', sync),
      bus.on('selection.multi.changed', sync),
      bus.on('world.loaded', sync),
      bus.on('entity.changed', sync),
      bus.on('entity.removed', sync),
    );
    this.sync();
  }

  /** Anzahl vorhandener Griffe (für Tests). */
  count(): number {
    return this.handles.length;
  }

  /** true, wenn unter dem Zeiger (Pixel relativ zur Zeichenfläche) ein Griff liegt. */
  isOver(x: number, y: number): boolean {
    return this.pickAt(x, y) !== null;
  }

  private target(): { id: string; state: FreeformState } | null {
    const s = this.ctx.store.getState();
    if (s.mode !== 'build' || s.selectedIds.length !== 1) return null;
    const e = s.entities[s.selectedIds[0]];
    if (!e || e.ref !== FREEFORM_REF || typeof e.state !== 'object' || e.state === null) return null;
    const kind = (e.state as { kind?: unknown }).kind;
    if (kind !== 'sweep' && kind !== 'lathe' && kind !== 'patch') return null;
    return { id: e.id, state: e.state as unknown as FreeformState };
  }

  /** Griffe an Auswahl und State anpassen: anlegen, verschieben oder entfernen. */
  sync(): void {
    const t = this.target();
    if (!t) {
      if (!this.drag) this.clear();
      return;
    }
    if (this.drag) {
      this.place(t);
      return;
    }
    const infos = handlesOf(t.state);
    const same = this.entityId === t.id && infos.length === this.handles.length && infos.every((i, n) => JSON.stringify(i.ref) === JSON.stringify(this.handles[n].ref));
    if (!same) {
      this.clear();
      this.entityId = t.id;
      this.build(infos.map((i) => i.ref));
    }
    this.place(t);
  }

  private build(refs: HandleRef[]): void {
    const { scene } = this.ctx;
    if (!this.material) {
      const m = new StandardMaterial('ffHandleMat', scene);
      m.disableLighting = true;
      m.emissiveColor = COLOR;
      m.disableDepthWrite = true;
      this.material = m;
      const h = new StandardMaterial('ffHandleHot', scene);
      h.disableLighting = true;
      h.emissiveColor = COLOR_HOT;
      h.disableDepthWrite = true;
      this.hotMaterial = h;
    }
    refs.forEach((ref, i) => {
      const mesh = CreateSphere(`ffHandle${i}`, { diameter: 1, segments: 8 }, scene);
      mesh.material = this.material;
      mesh.renderingGroupId = 1;
      mesh.isPickable = true;
      markBuildOnly(this.ctx, mesh);
      mesh.metadata = { ...(mesh.metadata as object), ffHandle: true };
      this.handles.push({ ref, mesh });
    });
  }

  private place(t: { id: string; state: FreeformState }): void {
    const entity = this.ctx.store.getState().entities[t.id];
    if (!entity) return;
    const infos = handlesOf(t.state);
    infos.forEach((info, i) => {
      const h = this.handles[i];
      if (!h) return;
      const w = localToWorld(entity.transform, info.local);
      h.mesh.position.set(w[0], w[1], w[2]);
    });
    this.rescale();
  }

  private rescale(): void {
    const cam = this.ctx.scene.activeCamera;
    if (!cam || this.handles.length === 0) return;
    for (const h of this.handles) {
      const d = h.mesh.position.subtract(cam.globalPosition).length();
      h.mesh.scaling.setAll(Math.max(0.05, d * SIZE_FACTOR));
    }
  }

  private clear(): void {
    for (const h of this.handles) h.mesh.dispose(false, false);
    this.handles = [];
    this.hot = null;
    this.entityId = null;
    this.material?.dispose();
    this.hotMaterial?.dispose();
    this.material = null;
    this.hotMaterial = null;
  }

  private pickAt(x: number, y: number): Handle | null {
    if (this.handles.length === 0) return null;
    const set = new Set<unknown>(this.handles.map((h) => h.mesh));
    const pick = this.ctx.scene.pick(x, y, (m) => set.has(m));
    return pick?.hit ? (this.handles.find((h) => h.mesh === pick.pickedMesh) ?? null) : null;
  }

  private canvasXY(e: PointerEvent): [number, number] {
    const r = this.ctx.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private ray(e: PointerEvent): { origin: Vec3; dir: Vec3 } | null {
    const cam = this.ctx.scene.activeCamera;
    if (!cam) return null;
    const [x, y] = this.canvasXY(e);
    const r = this.ctx.scene.createPickingRay(x, y, Matrix.Identity(), cam);
    return { origin: [r.origin.x, r.origin.y, r.origin.z], dir: [r.direction.x, r.direction.y, r.direction.z] };
  }

  private onDown(e: PointerEvent): void {
    const t = this.target();
    if (!t || e.button !== 0 || e.altKey || buildState.getState().armed) return;
    const [x, y] = this.canvasXY(e);
    const handle = this.pickAt(x, y);
    if (!handle) return;
    const ray = this.ray(e);
    const entity = this.ctx.store.getState().entities[t.id];
    if (!ray || !entity) return;
    const p = handle.mesh.position;
    const world: Vec3 = [p.x, p.y, p.z];
    const { normal } = this.planeFor(t.state, e.shiftKey);
    const hit = rayPlane(ray.origin, ray.dir, world, normal) ?? world;
    this.drag = { handle, offset: [world[0] - hit[0], world[1] - hit[1], world[2] - hit[2]], world, moved: false, last: t.state };
    this.dragging = true;
    this.history.pin(t.id);
    this.ctx.canvas.setPointerCapture?.(e.pointerId);
  }

  private planeFor(state: FreeformState, shift: boolean) {
    const entity = this.entityId ? this.ctx.store.getState().entities[this.entityId] : undefined;
    const f = this.ctx.scene.activeCamera?.getForwardRay().direction;
    return dragPlaneNormal(state, entity?.transform ?? { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, f ? [f.x, f.y, f.z] : [0, 0, 1], shift);
  }

  private onMove(e: PointerEvent): void {
    const { drag } = this;
    if (!drag) {
      this.updateHot(e);
      return;
    }
    const id = this.entityId;
    const entity = id ? this.ctx.store.getState().entities[id] : undefined;
    const ray = this.ray(e);
    if (!id || !entity || !ray) return;
    const { normal } = this.planeFor(drag.last, e.shiftKey);
    const hit = rayPlane(ray.origin, ray.dir, drag.world, normal);
    if (!hit) return;
    const world: Vec3 = [hit[0] + drag.offset[0], hit[1] + drag.offset[1], hit[2] + drag.offset[2]];
    const step = buildState.getState().snap ? SNAP_POSITION : 0;
    const base = this.ctx.store.getState().entities[id].state as unknown as FreeformState;
    // Beim Sweep bleibt die Höhe (y) des Griffs unverändert; applyHandle liest nur x/z.
    const next = applyHandle(base, drag.handle.ref, worldToLocal(entity.transform, world), step);
    if (!next) return; // ungültig: Bewegung nicht übernehmen
    drag.world = world;
    drag.moved = true;
    drag.last = next;
    this.ctx.store.getState().updateEntity(id, { state: next as unknown as Record<string, unknown> }, { transient: true, source: 'local' });
  }

  private onUp(e: PointerEvent): void {
    const { drag } = this;
    if (!drag) return;
    this.drag = null;
    this.dragging = false;
    this.lastDragEnd = performance.now();
    this.ctx.canvas.releasePointerCapture?.(e.pointerId);
    const id = this.entityId;
    if (id && this.ctx.store.getState().entities[id]) {
      if (drag.moved) {
        const { bus, store } = this.ctx;
        bus.emit('history.group.begin', {});
        try {
          store.getState().updateEntity(id, { state: drag.last as unknown as Record<string, unknown> }, { transient: false, source: 'local' });
        } finally {
          bus.emit('history.group.end', {});
        }
      }
      this.history.unpin(id);
    }
    this.sync();
  }

  private updateHot(e: PointerEvent): void {
    if (this.handles.length === 0) return;
    const [x, y] = this.canvasXY(e);
    const over = this.pickAt(x, y);
    if (over === this.hot) return;
    if (this.hot) this.hot.mesh.material = this.material;
    this.hot = over;
    if (over) over.mesh.material = this.hotMaterial;
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.drag = null;
    this.dragging = false;
    this.clear();
  }
}
