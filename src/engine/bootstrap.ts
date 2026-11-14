/**
 * Startet Engine, Szene, Physik und alle Module. VERTRAG: nur der Koordinator ändert diese Datei.
 */
import './sideEffects';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { Scene } from '@babylonjs/core/scene';
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { createAvatarState, DEFAULT_APPEARANCE } from '../../shared/avatar';
import { DEFAULT_SERVER_PORT } from '../../shared/protocol';
import type { WorldSpec } from '../../shared/types';
import type { AvatarFactory, GameConfig, GameContext, GameModule, WorldPersistence } from '../core/context';
import { EventBus } from '../core/events';
import { createWorldStore } from '../core/store';
import { createUiRegistry, type UiRegistry } from '../core/ui';

export interface Game {
  ctx: GameContext;
  dispose(): void;
}

/** Debug-Haken für Tests: window.__cloudparty */
export interface DebugHook {
  ready: boolean;
  error: string | null;
  ctx: GameContext | null;
  /** Kurzformen */
  store: GameContext['store'] | null;
  bus: GameContext['bus'] | null;
  scene: Scene | null;
}
declare global {
  interface Window {
    __cloudparty: DebugHook;
  }
}

function resolveConfig(): GameConfig {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('server');
  if (fromQuery === 'off') return { serverUrl: null };
  if (fromQuery) return { serverUrl: fromQuery.replace(/\/$/, '') };
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return { serverUrl: fromEnv.replace(/\/$/, '') };
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return { serverUrl: `http://${host}:${DEFAULT_SERVER_PORT}` };
  return { serverUrl: null };
}

/** Platzhalter-Avatar (Kapsel), bis Paket 2 die echte Fabrik setzt. */
function placeholderAvatarFactory(scene: Scene): AvatarFactory {
  return (appearance) => {
    const root = new TransformNode('avatar', scene);
    const body = CreateCapsule('avatar.body', { height: 1.75, radius: 0.3 }, scene);
    body.parent = root;
    body.position.y = 0.875;
    const material = new StandardMaterial('avatar.mat', scene);
    material.diffuseColor = Color3.FromHexString(appearance.shirt);
    body.material = material;
    return {
      root,
      height: 1.75,
      setMotion() {},
      setEmotes() {},
      setAppearance(next) {
        material.diffuseColor = Color3.FromHexString(next.shirt);
      },
      update() {},
      dispose() {
        root.dispose(false, true);
      },
    };
  };
}

/** Einfache Speicherung in localStorage, bis Paket 3 IndexedDB liefert. */
function placeholderPersistence(): WorldPersistence {
  const key = (id: string) => `cloudparty.world.${id}`;
  const indexKey = 'cloudparty.worlds';
  const readIndex = (): { id: string; name: string; updatedAt: number }[] => {
    try {
      return JSON.parse(localStorage.getItem(indexKey) ?? '[]');
    } catch {
      return [];
    }
  };
  return {
    async list() {
      return readIndex();
    },
    async load(id) {
      try {
        const raw = localStorage.getItem(key(id));
        return raw ? (JSON.parse(raw) as WorldSpec) : undefined;
      } catch {
        return undefined;
      }
    },
    async save(id, world) {
      try {
        localStorage.setItem(key(id), JSON.stringify(world));
        const index = readIndex().filter((entry) => entry.id !== id);
        index.push({ id, name: world.metadata.name, updatedAt: Date.now() });
        localStorage.setItem(indexKey, JSON.stringify(index));
      } catch {
        /* Speicher voll oder gesperrt */
      }
    },
    async remove(id) {
      try {
        localStorage.removeItem(key(id));
        localStorage.setItem(indexKey, JSON.stringify(readIndex().filter((entry) => entry.id !== id)));
      } catch {
        /* ignorieren */
      }
    },
  };
}

export const debugHook: DebugHook = { ready: false, error: null, ctx: null, store: null, bus: null, scene: null };
if (typeof window !== 'undefined') window.__cloudparty = debugHook;

export async function startGame(
  canvas: HTMLCanvasElement,
  overlayRoot: HTMLElement,
  ui: UiRegistry,
  modules: GameModule[],
): Promise<Game> {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.45, 0.7, 0.95, 1);

  const havokInstance = await HavokPhysics({ locateFile: () => havokWasmUrl });
  const havok = new HavokPlugin(true, havokInstance);
  if (!scene.enablePhysics(new Vector3(0, -9.81, 0), havok) || !scene.getPhysicsEngine()) {
    throw new Error('Physik (Havok) konnte nicht aktiviert werden.');
  }

  const bus = new EventBus();
  const store = createWorldStore(bus);
  const casters = new Set<AbstractMesh>();
  const selfId = `local_${Math.random().toString(36).slice(2, 8)}`;
  let storedName = 'Gast';
  try {
    storedName = localStorage.getItem('cloudparty.name') || storedName;
  } catch {
    /* ignorieren */
  }

  const ctx: GameContext = {
    canvas,
    overlayRoot,
    engine,
    scene,
    havok,
    store,
    bus,
    ui,
    config: resolveConfig(),
    localAvatar: createAvatarState(selfId, storedName, DEFAULT_APPEARANCE),
    entityNodes: new Map(),
    avatarFactory: placeholderAvatarFactory(scene),
    persistence: placeholderPersistence(),
    shadows: {
      add(mesh) {
        if (casters.has(mesh)) return;
        casters.add(mesh);
        mesh.onDisposeObservable.add(() => casters.delete(mesh));
        bus.emit('render.shadowCaster.added', { mesh });
      },
      casters,
    },
  };
  debugHook.ctx = ctx;
  debugHook.store = store;
  debugHook.bus = bus;
  debugHook.scene = scene;

  const started: GameModule[] = [];
  for (const module of modules) {
    try {
      await module.init(ctx);
      started.push(module);
    } catch (error) {
      console.error(`[cloudparty] Modul "${module.id}" konnte nicht starten`, error);
      debugHook.error = `${module.id}: ${(error as Error).message}`;
    }
  }

  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);
  engine.runRenderLoop(() => {
    if (scene.activeCamera) scene.render();
  });
  // Erst nach einem gerenderten Bild als bereit melden.
  scene.onAfterRenderObservable.addOnce(() => {
    debugHook.ready = true;
  });

  return {
    ctx,
    dispose() {
      debugHook.ready = false;
      window.removeEventListener('resize', onResize);
      for (const module of started.reverse()) {
        try {
          module.dispose?.();
        } catch (error) {
          console.error(`[cloudparty] Fehler beim Beenden von "${module.id}"`, error);
        }
      }
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
