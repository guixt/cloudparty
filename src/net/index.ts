/**
 * Paket 10 – Multiplayer-Client: Verbindung, entfernte Avatare, Namensschilder,
 * Local Chat, Status. Öffentliche API für die Shell: getNet(), setAutoConnect().
 */
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext, GameModule } from '../core/context';
import { ChatPanel } from './chat';
import { parseHashIsland } from './chatLogic';
import { TagLayer } from './nameTags';
import { netStore } from './netStore';
import { StatusBadge } from './status';
import type { SocketLike } from './connection';
import { createSync, type NetApi, type Sync } from './sync';

export type { NetApi } from './sync';

let api: NetApi | null = null;
let autoConnect = true;

/** Wie das Modul nach dem Start verfährt: Mit `false` verbindet es sich nicht von selbst; die Shell wählt die Insel und ruft getNet()?.connect(id) auf. */
export function setAutoConnect(enabled: boolean): void {
  autoConnect = enabled;
}

/** Netz-API; null, solange das Modul nicht initialisiert ist. */
export function getNet(): NetApi | null {
  return api;
}

let cleanup: (() => void) | null = null;

function start(ctx: GameContext): () => void {
  const offs: (() => void)[] = [];
  netStore.getState().reset();

  const tags = new TagLayer(ctx.scene, ctx.overlayRoot, () => ({
    width: ctx.canvas.clientWidth,
    height: ctx.canvas.clientHeight,
    renderWidth: ctx.engine.getRenderWidth(),
    renderHeight: ctx.engine.getRenderHeight(),
  }));
  tags.upsert('local', {
    variant: 'self',
    getName: () => ctx.localAvatar.identity.displayName,
    getWorld: (o) => {
      const p = ctx.localAvatar.presence.position;
      o.set(p[0], p[1] + 1.75 + 0.25, p[2]);
      return true;
    },
  });

  const sync: Sync = createSync(ctx, tags, (url) => new WebSocket(url) as unknown as SocketLike);
  api = sync;

  offs.push(ctx.ui.register({ id: 'net-chat', slot: 'bottom-left', order: 10, component: ChatPanel }));
  offs.push(ctx.ui.register({ id: 'net-status', slot: 'top-right', order: 10, component: StatusBadge }));

  const scene: Scene = ctx.scene;
  const before = scene.onBeforeRenderObservable.add(() => sync.frame(ctx.engine.getDeltaTime() / 1000));
  const after = scene.onAfterRenderObservable.add(() => tags.update());
  const startObs: Observer<Scene> | null = scene.onAfterRenderObservable.addOnce(() => {
    // Erst nach dem ersten Bild (alle Module initialisiert): die Shell konnte setAutoConnect(false) setzen.
    if (!autoConnect || !ctx.config.serverUrl || sync.getStatus().island) return;
    const island = parseHashIsland(window.location.hash) ?? ctx.store.getState().world.metadata.id ?? 'willkommen';
    sync.connect(island);
  });
  offs.push(() => {
    scene.onBeforeRenderObservable.remove(before);
    scene.onAfterRenderObservable.remove(after);
    if (startObs) scene.onAfterRenderObservable.remove(startObs);
  });

  netStore.getState().setStatus(sync.getStatus());
  return () => {
    offs.forEach((off) => off());
    sync.dispose();
    tags.dispose();
    api = null;
  };
}

const mod: GameModule = {
  id: 'net',
  init(ctx) {
    cleanup?.();
    cleanup = start(ctx);
  },
  dispose() {
    cleanup?.();
    cleanup = null;
  },
};
export default mod;
