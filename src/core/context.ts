/**
 * GameContext: was jedes Modul bekommt. VERTRAG: nur der Koordinator ändert diese Datei.
 */
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import type { Scene } from '@babylonjs/core/scene';
import type { AvatarAppearance, AvatarMotion, AvatarState, EmoteState } from '../../shared/avatar';
import type { WorldSpec } from '../../shared/types';
import type { EventBus } from './events';
import type { WorldStore } from './store';
import type { UiRegistry } from './ui';

/** Sichtbare Darstellung eines Avatars (lokal oder entfernt). Paket 2 liefert die echte Fabrik. */
export interface AvatarVisual {
  /** Wurzelknoten; Position = Fußpunkt, rotation.y = Blickrichtung (yaw). */
  root: TransformNode;
  /** Höhe des Kopfes über dem Fußpunkt in Metern (für Namensschilder). */
  height: number;
  setMotion(motion: AvatarMotion): void;
  setEmotes(emotes: Record<string, EmoteState>): void;
  setAppearance(appearance: AvatarAppearance): void;
  /** Pro Frame aufrufen; dt in Sekunden. */
  update(dt: number): void;
  dispose(): void;
}
export type AvatarFactory = (appearance: AvatarAppearance) => AvatarVisual;

export interface StoredWorldInfo {
  id: string;
  name: string;
  updatedAt: number;
}
/** Lokale Speicherung im Browser. Paket 3 liefert die echte Umsetzung (IndexedDB). */
export interface WorldPersistence {
  list(): Promise<StoredWorldInfo[]>;
  load(id: string): Promise<WorldSpec | undefined>;
  save(id: string, world: WorldSpec): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface GameConfig {
  /** Basis-URL des Servers (http…), oder null für reinen Offline-Betrieb. */
  serverUrl: string | null;
}

export interface GameContext {
  canvas: HTMLCanvasElement;
  /**
   * HTML-Ebene exakt über dem Canvas (pointer-events: none; Kinder können es
   * für sich wieder einschalten). Für iframes, Namensschilder usw.
   */
  overlayRoot: HTMLElement;
  engine: AbstractEngine;
  scene: Scene;
  /** Havok-Physik, bereits an der Szene aktiviert (Schwerkraft -9.81 in Y). */
  havok: HavokPlugin;
  store: WorldStore;
  bus: EventBus;
  ui: UiRegistry;
  config: GameConfig;
  /** Zustand des lokalen Avatars; wird von Paket 2 laufend aktualisiert (veränderliches Objekt). */
  localAvatar: AvatarState;
  /** Entity-ID → Wurzelknoten. Wird von Paket 4 gepflegt. Alle Kind-Meshes tragen metadata.entityId. */
  entityNodes: Map<string, TransformNode>;
  /** Erzeugt Avatar-Darstellungen. Paket 2 ersetzt den Platzhalter in init(). */
  avatarFactory: AvatarFactory;
  persistence: WorldPersistence;
  shadows: {
    /** Mesh als Schattenwerfer anmelden (Paket 1 hängt es an den ShadowGenerator). */
    add(mesh: AbstractMesh): void;
    readonly casters: ReadonlySet<AbstractMesh>;
  };
}

/** Ein Arbeitspaket als Modul. Reihenfolge der Initialisierung: src/modules.ts. */
export interface GameModule {
  id: string;
  /**
   * Muss den AKTUELLEN Store-Zustand übernehmen (die Welt ist bereits geladen)
   * und danach auf Bus-Ereignisse reagieren, insbesondere 'world.loaded'.
   */
  init(ctx: GameContext): void | Promise<void>;
  dispose?(): void;
}

/** Hängt metadata.entityId an einen Knoten und alle Nachfahren (für Picking). */
export function tagEntityNode(node: TransformNode, entityId: string): void {
  node.metadata = { ...(node.metadata ?? {}), entityId };
  for (const child of node.getDescendants(false)) {
    child.metadata = { ...(child.metadata ?? {}), entityId };
  }
}

/** Liest die Entity-ID eines gepickten Meshes (oder null). */
export function entityIdOf(mesh: { metadata?: unknown } | null | undefined): string | null {
  const id = (mesh?.metadata as { entityId?: unknown } | undefined)?.entityId;
  return typeof id === 'string' ? id : null;
}
