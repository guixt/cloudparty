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
import { deleteSelected, duplicateSelected, placeItem } from './placement';
import { runtime } from './runtime';
import { SelectionHighlight } from './selection';
import { buildState, isTyping, resetBuildState } from './state';
import { BuildToolbar } from './toolbar';
import './build.css';

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
      const id = store.getState().selection;
      const node = id ? ctx.entityNodes.get(id) : null;
      if (store.getState().mode === 'build') highlight.set(node);
      gizmos.attach(store.getState().mode === 'build' ? id : null);
    };

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
      bus.on('entity.node.created', ({ id, node }) => {
        if (store.getState().mode !== 'build') return;
        if (id === store.getState().selection) highlight.set(node);
        gizmos.onNodeCreated(id, node);
      }),
      bus.on('entity.node.disposed', ({ id }) => {
        if (id === store.getState().selection) highlight.clear();
        gizmos.onNodeDisposed(id);
      }),
      buildState.subscribe((state, prev) => {
        if (state.tool !== prev.tool) gizmos.setTool(state.tool);
        if (state.snap !== prev.snap) gizmos.setSnap(state.snap);
      }),
    );

    // Klicks im 3D-Bild: auswählen, abwählen oder „Klick zum Platzieren".
    const tapObserver = scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP || store.getState().mode !== 'build') return;
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
      store.getState().select(entityIdOf(pick?.pickedMesh));
    });
    cleanups.push(() => scene.onPointerObservable.remove(tapObserver));

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
        }
        return;
      }
      if (e.altKey) return;
      if (key === 'delete' || key === 'backspace') {
        if (state.selection) {
          e.preventDefault();
          deleteSelected(ctx);
        }
      } else if (key === 'escape') {
        if (buildState.getState().armed) buildState.setState({ armed: null });
        else state.select(null);
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
