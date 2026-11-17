/**
 * Ereignisbus und Ereigniskatalog. VERTRAG: nur der Koordinator ändert diese Datei.
 */
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AvatarState } from '../../shared/avatar';
import type { EntitySpec, EnvironmentSpec, Vec3, WorldSpec } from '../../shared/types';

/** Woher eine Änderung am Store stammt. */
export type ChangeSource = 'local' | 'remote' | 'script' | 'system';
export interface ChangeOptions {
  /** Standard: 'local'. Netz-Modul sendet alles außer 'remote'. */
  source?: ChangeSource;
  /** true = Zwischenstand (z. B. während des Ziehens); nicht speichern, nicht ins Undo. */
  transient?: boolean;
}
export type GameMode = 'play' | 'build';
export interface AvatarRef {
  id: string;
  name: string;
}

export interface GameEvents {
  // --- Welt/Store (vom WorldStore ausgelöst) ---
  'world.loaded': { world: WorldSpec };
  'entity.added': { entity: EntitySpec; source: ChangeSource; transient: boolean };
  'entity.changed': { entity: EntitySpec; prev: EntitySpec; source: ChangeSource; transient: boolean };
  'entity.removed': { entity: EntitySpec; source: ChangeSource; transient: boolean };
  'environment.changed': { environment: EnvironmentSpec; source: ChangeSource };
  'selection.changed': { id: string | null };
  /** Die Menge der gewählten Objekte hat sich geändert (Mehrfachauswahl). */
  'selection.multi.changed': { ids: string[] };
  'mode.changed': { mode: GameMode };

  // --- Darstellung (Paket 4 Entities) ---
  /** Wurzelknoten einer Entity wurde erzeugt bzw. neu aufgebaut. */
  'entity.node.created': { id: string; node: TransformNode };
  'entity.node.disposed': { id: string };
  /** Klick auf eine Entity im Spielmodus. */
  'entity.clicked': { entityId: string; avatar: AvatarRef; point: Vec3 };

  // --- Physik (Paket 5) ---
  /** Lokaler Avatar berührt eine Entity (einmal pro Kontaktbeginn). */
  'entity.touched': { entityId: string; avatar: AvatarRef };
  'trigger.enter': { entityId: string; avatar: AvatarRef };
  'trigger.exit': { entityId: string; avatar: AvatarRef };
  'physics.collision': { a: string; b: string; impulse: number };
  /** Bitte Stoß auf dynamische Entity anwenden. */
  'entity.impulse': { entityId: string; impulse: Vec3 };
  /**
   * Sanfte Bewegung: wird VOR der Änderung im Store gesendet; die Darstellung gleitet von der bisherigen Lage zur neuen.
   * Mit `orbit` drehen sich alle Objekte als Ganzes um `pivot` (Bahn statt Gerade).
   */
  'entity.tween': { ids: string[]; duration: number; ease: 'linear' | 'inOut' | 'out'; orbit?: { pivot: Vec3; axis: Vec3; angleDeg: number } };

  // --- Avatar (Paket 2) ---
  'avatar.spawned': { avatar: AvatarState };
  /** Gedrosselt (ca. 12 Hz), solange sich der lokale Avatar ändert. */
  'avatar.moved': { avatar: AvatarState };
  'avatar.emote': { avatarId: string; channel: string; name: string; startedAt: number; durationMs?: number; loop?: boolean };
  'avatar.emote.ended': { avatarId: string; channel: string; name: string };
  'avatar.focusChanged': { avatarId: string; focus: string | null };
  /** Bitte lokalen Avatar versetzen. */
  'avatar.teleport': { position: Vec3; yaw?: number };
  /** Bitte Geste des lokalen Avatars starten (z. B. aus der Werkzeugleiste). */
  'avatar.requestEmote': { name: string };

  // --- Chat ---
  /** Nutzer hat Text abgeschickt (UI → Netz bzw. lokales Echo). */
  'chat.send': { text: string };
  /** Nachricht zur Anzeige. from = Avatar-ID, Entity-ID oder 'system'. */
  'chat.message': { from: string; name: string; text: string; ts: number; kind: 'avatar' | 'object' | 'system' };

  // --- Skripte (Pakete 7/8) ---
  'script.log': { entityId: string; level: 'log' | 'error'; message: string; ts: number };
  'script.status': { entityId: string; status: 'running' | 'stopped' | 'error'; message?: string };
  'script.message': { from: string; to: string | '*'; message: string; data: unknown };
  /** Test: ein Ereignis gezielt an das Skript eines Objekts zustellen (z. B. von den KI-Werkzeugen). */
  'script.test.dispatch': { entityId: string; name: string; args: unknown[] };
  'ui.openScriptEditor': { entityId: string };
  /** Öffnet den Logik-Graph-Editor für ein Objekt (Paket 19). */
  'ui.openGraphEditor': { entityId: string };
  /** Öffnet das Bibliotheksfenster (Paket 17). */
  'ui.openLibrary': Record<string, never>;
  'sound.play': { name?: string; frequency?: number; duration?: number };

  // --- Netz (Paket 10) ---
  'net.status': { online: boolean; island: string | null; avatars: number; canBuild: boolean };
  /** Freies Signal von/zu anderen Clients (siehe protocol.ts „signal"). */
  'net.signal.send': { channel: string; data: unknown };
  'net.signal.received': { channel: string; data: unknown; from: string };

  // --- Rendering ---
  'render.shadowCaster.added': { mesh: AbstractMesh };
  'ui.toast': { text: string; kind?: 'info' | 'error' };

  // --- Plan-Board ---
  /** Ein Plan wurde angelegt, geändert oder gelöscht (planId leer = Pläne neu geladen). */
  'plan.changed': { planId: string };
  /** Öffnet das Plan-Fenster (optional mit gewähltem Plan). */
  'ui.openPlan': { planId?: string };
  /** Der Nutzer möchte einen Knoten (oder alle offenen Knoten) ausführen lassen. */
  'plan.run.request': { planId: string; nodeId?: string };

  // --- Undo-Gruppierung (Build-Paket hört zu; z. B. für KI-Aufträge) ---
  /** Alle folgenden lokalen Änderungen bis `history.group.end` werden ein Undo-Schritt. */
  'history.group.begin': Record<string, never>;
  'history.group.end': Record<string, never>;
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  /** Registriert einen Handler; der Rückgabewert meldet ihn wieder ab. */
  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<E[K]>)(payload);
      } catch (error) {
        console.error(`[bus] Fehler in Handler für "${String(type)}"`, error);
      }
    }
  }
}
