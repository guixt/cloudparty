/**
 * Worker-Einstieg: führt genau ein Objekt-Skript aus. Kein DOM, kein Netz:
 * gefährliche Globals werden vor dem Nutzercode entfernt.
 */
import type { HostToWorker, WorkerToHost } from './commands';
import { createSandbox, hardenGlobals, hardenIntrinsics, SandboxCompileError, type Sandbox } from './sandbox';

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};
const nativePost = scope.postMessage.bind(scope);
const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nativeSetInterval = globalThis.setInterval.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
const nativeClearInterval = globalThis.clearInterval.bind(globalThis);

function send(message: WorkerToHost): void {
  try {
    nativePost(message);
  } catch {
    /* nicht klonbar o. ä.: verwerfen */
  }
}

let sandbox: Sandbox | null = null;
let depth = 0;

scope.onmessage = (event) => {
  const msg = event.data as HostToWorker;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'init') {
    if (sandbox) return;
    hardenGlobals(globalThis as unknown as Record<string, unknown>);
    hardenIntrinsics(globalThis as unknown as Record<string, unknown>);
    try {
      sandbox = createSandbox({
        source: msg.source,
        snapshot: msg.snapshot,
        post: (cmd) => send({ type: 'cmd', cmd }),
        log: (level, message) => send({ type: 'log', level, message }),
        timers: {
          setTimeout: (fn, ms) => nativeSetTimeout(fn, ms),
          setInterval: (fn, ms) => nativeSetInterval(fn, ms),
          clearTimeout: (h) => nativeClearTimeout(h as number),
          clearInterval: (h) => nativeClearInterval(h as number),
        },
        enter: () => {
          if (depth++ === 0) send({ type: 'busy' });
        },
        leave: () => {
          if (--depth === 0) send({ type: 'idle' });
        },
      });
      send({ type: 'ready', handlers: sandbox.handlers });
    } catch (error) {
      const message = error instanceof SandboxCompileError ? error.message : `Fehler: ${(error as Error).message}`;
      send({ type: 'fatal', message });
    }
  } else if (msg.type === 'event') {
    sandbox?.dispatch(String(msg.name), Array.isArray(msg.args) ? msg.args : []);
    send({ type: 'done', seq: msg.seq });
  } else if (msg.type === 'snapshot') {
    sandbox?.updateSnapshot(msg.snapshot);
  }
};

send({ type: 'booted' });
