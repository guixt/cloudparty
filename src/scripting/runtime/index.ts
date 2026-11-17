/**
 * Paket 7: Skript-Laufzeit. Ein Web Worker pro Objekt-Skript (Sandbox, Zeitlimit).
 * Öffentliche Hilfen für andere Pakete: getScriptStatus, restartScript.
 */
import type { GameContext, GameModule } from '../../core/context';
import { createEntityFromPrefab } from '../../world/entities/prefabs';
import { ScriptHost, type WorkerLike } from './host';
import { installAudioUnlock, playNamedSound, playTone } from './sound';

let host: ScriptHost | null = null;
let removeUnlock: (() => void) | null = null;

export function getScriptStatus(entityId: string): 'running' | 'stopped' | 'error' | 'none' {
  return host ? host.getStatus(entityId) : 'none';
}

export function restartScript(entityId: string): void {
  host?.restart(entityId);
}

function createWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

const mod: GameModule = {
  id: 'script-runtime',
  init(ctx: GameContext) {
    removeUnlock = installAudioUnlock();
    host = new ScriptHost(
      {
        store: ctx.store,
        bus: ctx.bus,
        localAvatarId: () => ctx.localAvatar.identity.id,
        audio: { playSound: playNamedSound, playTone },
        makeEntity: (ref, pos) => createEntityFromPrefab(ref, pos),
        avatars: () => {
          const a = ctx.localAvatar;
          return [{ id: a.identity.id, name: a.identity.displayName, pos: [a.presence.position[0], a.presence.position[1], a.presence.position[2]] as [number, number, number] }];
        },
      },
      createWorker,
    );
    host.attach();
    host.startAll();
  },
  dispose() {
    host?.dispose();
    host = null;
    removeUnlock?.();
    removeUnlock = null;
  },
};
export default mod;
