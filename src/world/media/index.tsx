/**
 * Paket 12 – Medien-Flächen. Jede Entity mit `media` bekommt eine Fläche; die fünf
 * Refs `EntitySpec.media-*` bekommen zusätzlich die Tafel-Geometrie (Rahmen, Füße).
 */
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import type { EntitySpec } from '../../../shared/types';
import { entityIdOf, tagEntityNode, type GameContext, type GameModule } from '../../core/context';
import { setBuildMarkersVisible } from '../entities/parts';
import { buildBoard, layoutFromNode } from './board';
import { mediaKindOfRef } from './helpers';
import { MediaPanel } from './panel';
import { MediaSurface } from './surface';
import './media.css';

/**
 * ÜBERNAHME DES KNOTENS (einzige Stelle, die fremde Meshes anfasst).
 * Solange das Entities-Paket für `EntitySpec.media-*` keine eigene Geometrie liefert (bzw. nur einen
 * Platzhalter-Würfel), werden hier alle Kinder des Wurzelknotens entsorgt, die nicht von uns
 * stammen. Danach baut `buildBoard` die Tafel. Wird später `registerPrefab` des Entities-Pakets
 * genutzt, kann diese Funktion durch eine Prefab-Definition ersetzt werden, die `buildBoard`
 * aufruft; der Rest des Moduls bleibt unverändert.
 */
function takeOverNode(root: TransformNode): void {
  for (const child of root.getChildren(undefined, false)) {
    if ((child.metadata as { mediaPart?: boolean } | null)?.mediaPart) continue;
    child.dispose(false, true);
  }
}

const mod: GameModule & { _dispose?: () => void } = {
  id: 'media',
  init(ctx: GameContext) {
    const { bus, store, scene, entityNodes } = ctx;
    const surfaces = new Map<string, MediaSurface>();
    let frame = 0;

    const drop = (id: string) => {
      const s = surfaces.get(id);
      if (!s) return;
      surfaces.delete(id);
      s.dispose();
    };

    const ensure = (id: string, node: TransformNode | undefined) => {
      const entity: EntitySpec | undefined = store.getState().entities[id];
      const existing = surfaces.get(id);
      if (existing && existing.root !== node) drop(id);
      if (!entity || !node || node.isDisposed()) return;
      const refKind = mediaKindOfRef(entity.ref);
      if (!refKind && !entity.media) {
        drop(id);
        return;
      }
      let surface = surfaces.get(id);
      if (!surface) {
        let surfaceArgs;
        if (refKind) {
          takeOverNode(node);
          const kind = entity.media?.kind ?? refKind;
          const board = buildBoard(scene, node, id, kind, entity.state);
          for (const mesh of board.meshes) ctx.shadows.add(mesh);
          setBuildMarkersVisible(node, ctx.store.getState().mode === 'build');
          surfaceArgs = { layout: board.layout, owned: { meshes: board.meshes, materials: board.materials } };
        } else {
          surfaceArgs = { layout: layoutFromNode(node), owned: { meshes: [], materials: [] } };
        }
        surface = new MediaSurface(ctx, id, node, surfaceArgs.layout, surfaceArgs.owned);
        surfaces.set(id, surface);
        tagEntityNode(node, id);
      }
      surface.apply(entity);
    };

    const sync = () => {
      for (const id of [...surfaces.keys()]) if (entityNodes.get(id) !== surfaces.get(id)?.root) drop(id);
      for (const [id, node] of entityNodes) ensure(id, node);
    };
    sync();

    const offs = [
      bus.on('entity.node.created', ({ id, node }) => ensure(id, node)),
      bus.on('entity.node.disposed', ({ id }) => drop(id)),
      bus.on('entity.removed', ({ entity }) => drop(entity.id)),
      bus.on('world.loaded', sync),
      bus.on('entity.changed', ({ entity, prev }) => {
        const node = entityNodes.get(entity.id);
        if (!node) return;
        const s = surfaces.get(entity.id);
        const geometryChanged = entity.state?.aspect !== prev.state?.aspect || entity.state?.stand !== prev.state?.stand || entity.media?.kind !== prev.media?.kind;
        if (s && geometryChanged && mediaKindOfRef(entity.ref)) {
          drop(entity.id);
          ensure(entity.id, node);
        } else if (s || entity.media) ensure(entity.id, node);
      }),
    ];

    // Klicks auf Pfeile und Videofläche (nur Spielmodus).
    const tapObserver: Observer<unknown> | null = scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP || store.getState().mode !== 'play') return;
      const mesh = info.pickInfo?.pickedMesh;
      const action = (mesh?.metadata as { mediaAction?: string } | undefined)?.mediaAction;
      const id = entityIdOf(mesh);
      if (action && id) surfaces.get(id)?.handleAction(action);
    }) as Observer<unknown> | null;

    // HTML-Überlagerungen nach jedem gerenderten Bild auf die Tafeln legen.
    const renderObserver = (scene as Scene).onAfterRenderObservable.add(() => {
      frame += 1;
      const mode = store.getState().mode;
      for (const s of surfaces.values()) if (s.hasOverlay) s.tickOverlay(frame, mode);
    });

    const offPanel = ctx.ui.register({ id: 'media.panel', slot: 'right', order: 60, component: MediaPanel });

    mod._dispose = () => {
      for (const off of offs) off();
      offPanel();
      if (tapObserver) scene.onPointerObservable.remove(tapObserver as never);
      scene.onAfterRenderObservable.remove(renderObserver);
      for (const id of [...surfaces.keys()]) drop(id);
    };
  },
  dispose() {
    mod._dispose?.();
  },
};
export default mod;
