/**
 * Paket 6 – Build-Modus: Umschalten (Tab), Orbit-Kamera, Auswahl, Gizmos,
 * Palette, Inspector, Undo/Redo.
 */
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import '../engine/sideEffects';
import type { GameModule } from '../core/context';
import { entityIdOf } from '../core/context';
import { getCatalogItem } from './catalog';
import { BuildCamera } from './camera';
import { GizmoController } from './gizmos';
import { History } from './history';
import { Inspector } from './inspector';
import { Palette } from './palette';
import { copySelected, deleteSelected, duplicateSelected, groupSelected, pasteClipboard, placeItem, ungroupSelected } from './placement';
import { expandToGroups, marqueeHit } from './multi';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { runtime } from './runtime';
import { SelectionHighlight } from './selection';
import { buildState, isTyping, resetBuildState } from './state';
import { BuildToolbar } from './toolbar';
import './build.css';

import { createMarquee } from './marquee';

/** Zeitfenster für einen Doppelklick auf dasselbe Objekt. */
const DOUBLE_TAP_MS = 450;

let cleanups: (() => void)[] = [];

const build: GameModule = {
  id: 'build',
  init(ctx) {
    const { scene, store, bus } = ctx;
    resetBuildState();
    const history = new History(store, bus);
    history.attach();
    const cam = new BuildCamera(ctx);
    const highlight = new SelectionHighlight(scene);
    const gizmos = new GizmoController(ctx, history);
    runtime.history = history;
    runtime.camera = cam;

    cleanups.push(
      ctx.ui.register({ id: 'build.toolbar', slot: 'toolbar', order: 10, component: BuildToolbar }),
      ctx.ui.register({ id: 'build.palette', slot: 'left', order: 10, component: Palette }),
      ctx.ui.register({ id: 'build.inspector', slot: 'right', order: 10, component: Inspector }),
    );

    const refreshSelection = () => {
      const build = store.getState().mode === 'build';
      const ids = store.getState().selectedIds;
      highlight.set(build ? ids.map((id) => ctx.entityNodes.get(id)) : null);
      gizmos.attachSelection(build ? ids : []);
    };

    const refreshHighlight = () => highlight.set(store.getState().selectedIds.map((id) => ctx.entityNodes.get(id)));

    const enter = () => {
      cam.enter();
      gizmos.setTool(buildState.getState().tool);
      gizmos.setSnap(buildState.getState().snap);
      gizmos.setActive(true);
      refreshSelection();
    };
    const leave = () => {
      buildState.setState({ armed: null });
      gizmos.setActive(false);
      highlight.clear();
      cam.leave();
    };

    cleanups.push(
      bus.on('mode.changed', ({ mode }) => (mode === 'build' ? enter() : leave())),
      bus.on('selection.changed', refreshSelection),
      bus.on('selection.multi.changed', refreshSelection),
      bus.on('world.loaded', refreshSelection),
      bus.on('entity.changed', ({ entity, transient }) => {
        if (!transient && store.getState().selectedIds.length > 1 && store.getState().selectedIds.includes(entity.id)) gizmos.refresh();
      }),
      bus.on('entity.node.created', ({ id, node }) => {
        if (store.getState().mode !== 'build') return;
        if (store.getState().selectedIds.includes(id)) refreshHighlight();
        gizmos.onNodeCreated(id, node);
      }),
      bus.on('entity.node.disposed', ({ id }) => {
        if (store.getState().selectedIds.includes(id)) highlight.clear();
        gizmos.onNodeDisposed(id);
      }),
      buildState.subscribe((state, prev) => {
        if (state.tool !== prev.tool) gizmos.setTool(state.tool);
        if (state.snap !== prev.snap) gizmos.setSnap(state.snap);
      }),
    );

    let lastTap: { id: string; at: number } | null = null;
    // Klicks im 3D-Bild: auswählen, abwählen oder „Klick zum Platzieren".
    const tapObserver = scene.onPointerObservable.add((info) => {
      const isDoubleEvent = info.type === PointerEventTypes.POINTERDOUBLETAP;
      if ((info.type !== PointerEventTypes.POINTERTAP && !isDoubleEvent) || store.getState().mode !== 'build') return;
      const event = info.event as PointerEvent;
      if (event.button !== 0 || event.altKey || cam.suppressTap) return;
      if (gizmos.dragging || performance.now() - gizmos.lastDragEnd < 300) return;
      const pick = info.pickInfo;
      const armed = buildState.getState().armed;
      const item = armed ? getCatalogItem(armed) : undefined;
      if (item) {
        if (pick?.hit && pick.pickedPoint) placeItem(ctx, item, [pick.pickedPoint.x, pick.pickedPoint.y, pick.pickedPoint.z]);
        return;
      }
      if (marquee.justFinished()) return;
      const id = entityIdOf(pick?.pickedMesh);
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      const s = store.getState();
      if (!id) {
        if (!additive) s.select(null);
        return;
      }
      // Doppelklick (zwei Klicks kurz nacheinander auf dasselbe Objekt): nur dieses Mitglied wählen
      // („in Gruppe hineingehen"). `event.detail` ist bei Zeigerereignissen immer 0, darum eigene Zeitmessung.
      const now = performance.now();
      // Babylon meldet den zweiten Klick eines Doppelklicks als eigenes Ereignis (POINTERDOUBLETAP).
      const isDouble = !additive && (isDoubleEvent || (lastTap !== null && lastTap.id === id && now - lastTap.at < DOUBLE_TAP_MS));
      lastTap = isDouble ? null : { id, at: now };
      if (isDouble) {
        s.selectMany([id]);
        return;
      }
      const members = expandToGroups([id], s.entities, s.order);
      if (additive) {
        const allIn = members.every((m) => s.selectedIds.includes(m));
        s.selectMany(allIn ? s.selectedIds.filter((x) => !members.includes(x)) : [...s.selectedIds.filter((x) => !members.includes(x)), ...members.filter((m) => m !== id), id]);
      } else s.selectMany([...members.filter((m) => m !== id), id]);
    });
    cleanups.push(() => scene.onPointerObservable.remove(tapObserver));

    // Marquee: Linksziehen auf freier Fläche zieht ein Auswahlrechteck.
    const marquee = createMarquee();
    const canvasEl = ctx.canvas;
    const onPointerDown = (e: PointerEvent) => {
      if (store.getState().mode !== 'build' || e.button !== 0 || e.altKey || buildState.getState().armed) return;
      if (gizmos.dragging || gizmos.hovering()) return;
      const r = canvasEl.getBoundingClientRect();
      const pick = scene.pick(e.clientX - r.left, e.clientY - r.top);
      if (pick?.hit && entityIdOf(pick.pickedMesh)) return; // Klick auf Objekt: normale Auswahl
      marquee.begin(e);
    };
    const onPointerMove = (e: PointerEvent) => marquee.move(e);
    const onPointerUp = (e: PointerEvent) => {
      const rect = marquee.end(e);
      if (!rect) return;
      const s = store.getState();
      const cam2 = scene.activeCamera;
      if (!cam2) return;
      const bounds = canvasEl.getBoundingClientRect();
      const sx = ctx.engine.getRenderWidth() / bounds.width;
      const sy = ctx.engine.getRenderHeight() / bounds.height;
      const matrix = scene.getTransformMatrix();
      const viewport = cam2.viewport.toGlobal(ctx.engine.getRenderWidth(), ctx.engine.getRenderHeight());
      const points = s.order.map((id) => {
        const node = ctx.entityNodes.get(id);
        if (!node) return null;
        node.computeWorldMatrix(true);
        const { min, max } = node.getHierarchyBoundingVectors(true);
        const c = Vector3.Project(min.add(max).scale(0.5), Matrix.IdentityReadOnly, matrix, viewport);
        return { id, x: c.x / sx + bounds.left, y: c.y / sy + bounds.top, z: c.z };
      }).filter((p): p is { id: string; x: number; y: number; z: number } => !!p && p.z >= 0 && p.z <= 1);
      const hit = expandToGroups(marqueeHit(rect, points), s.entities, s.order);
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      s.selectMany(additive ? [...s.selectedIds.filter((x) => !hit.includes(x)), ...hit] : hit);
    };
    canvasEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    cleanups.push(() => {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      marquee.dispose();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping() || e.repeat && e.key === 'Tab') return;
      const state = store.getState();
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        state.setMode(state.mode === 'play' ? 'build' : 'play');
        return;
      }
      if (state.mode !== 'build') return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) history.redo();
          else history.undo();
        } else if (key === 'y') {
          e.preventDefault();
          history.redo();
        } else if (key === 'd') {
          e.preventDefault();
          duplicateSelected(ctx);
        } else if (key === 'a') {
          e.preventDefault();
          state.selectMany(state.order);
        } else if (key === 'g') {
          e.preventDefault();
          if (e.shiftKey) ungroupSelected(ctx);
          else groupSelected(ctx);
        } else if (key === 'c') {
          if (state.selectedIds.length > 0) {
            e.preventDefault();
            copySelected(ctx);
          }
        } else if (key === 'v') {
          e.preventDefault();
          pasteClipboard(ctx);
        }
        return;
      }
      if (e.altKey) return;
      if (key === 'delete' || key === 'backspace') {
        if (state.selectedIds.length > 0) {
          e.preventDefault();
          deleteSelected(ctx);
        }
      } else if (key === 'escape') {
        if (buildState.getState().armed) buildState.setState({ armed: null });
        else state.selectMany([]);
      } else if (key === '1' || key === 'g') buildState.setState({ tool: 'move' });
      else if (key === '2' || key === 'r') buildState.setState({ tool: 'rotate' });
      else if (key === '3') buildState.setState({ tool: 'scale' });
      else if (key === 'f') cam.focus(state.selection ? ctx.entityNodes.get(state.selection) : null);
    };
    window.addEventListener('keydown', onKeyDown);
    cleanups.push(() => window.removeEventListener('keydown', onKeyDown));

    cleanups.push(() => {
      history.dispose();
      gizmos.dispose();
      highlight.dispose();
      cam.dispose();
      runtime.history = null;
      runtime.camera = null;
    });

    if (store.getState().mode === 'build') enter();
  },
  dispose() {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  },
};

export default build;
