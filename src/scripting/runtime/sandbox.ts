/**
 * Reiner Sandbox-Code: übersetzt Skript-Quelltext in Handler und baut die
 * `self`-/`world`-Objekte auf einer `post(command)`-Funktion auf. Wird vom Worker
 * und von den Unit-Tests gemeinsam genutzt (keine DOM-/Worker-Abhängigkeiten).
 */
import { SCRIPT_EVENTS, type ScriptEventName } from '../../../shared/scriptApi';
import type { ParticlePreset, PhysicsMode, Vec3 } from '../../../shared/types';
import {
  COMMAND_LIMIT_PER_SEC,
  LOG_LIMIT_PER_SEC,
  MAX_LOG_LENGTH,
  RateLimiter,
  SAY_LIMIT_PER_SEC,
  isJsonValue,
  type EntitySnapshot,
  type ScriptCommand,
} from './commands';

/** Original-Konstruktor, vor dem Härten des Workers festgehalten. */
const CompileFunction = Function;

/** Globale Namen, die im Skript nicht erreichbar sein dürfen (werden als Parameter überschattet). */
export const SHADOWED_NAMES = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebTransport',
  'EventSource',
  'RTCPeerConnection',
  'importScripts',
  'indexedDB',
  'caches',
  'navigator',
  'postMessage',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'MessageChannel',
  'close',
  'globalThis',
  'window',
  'document',
  'top',
  'parent',
  'frames',
  'global',
  'localStorage',
  'sessionStorage',
  'onmessage',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'Function',
  'require',
  'process',
  'module',
] as const;

/** Namen, die der Worker vor dem Start des Nutzercodes aus seinem globalen Objekt entfernt. */
export const FORBIDDEN_GLOBALS = SHADOWED_NAMES.filter((name) => name !== 'onmessage' && name !== 'Function');

/** Entfernt gefährliche Eigenschaften vom globalen Objekt `g` (soweit möglich). */
export function hardenGlobals(g: Record<string, unknown>): void {
  for (const name of FORBIDDEN_GLOBALS) {
    try {
      Object.defineProperty(g, name, { value: undefined, writable: false, configurable: false });
    } catch {
      try {
        delete g[name];
      } catch {
        /* nicht entfernbar */
      }
    }
  }
}

/** Sperrt dynamischen Code (Function-Konstruktoren, eval). Nur im echten Worker aufrufen. */
export function hardenIntrinsics(g: Record<string, unknown>): void {
  const blocked = function blocked() {
    throw new Error('Dynamischer Code ist in Skripten nicht erlaubt.');
  };
  const protos: unknown[] = [
    Function.prototype,
    Object.getPrototypeOf(async function () {}),
    Object.getPrototypeOf(function* () {}),
    Object.getPrototypeOf(async function* () {}),
  ];
  for (const proto of protos) {
    try {
      Object.defineProperty(proto, 'constructor', { value: blocked, writable: false, configurable: false });
    } catch {
      /* ignorieren */
    }
  }
  for (const name of ['Function', 'eval']) {
    try {
      Object.defineProperty(g, name, { value: blocked, writable: false, configurable: false });
    } catch {
      /* ignorieren */
    }
  }
}

export class SandboxCompileError extends Error {}

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): unknown;
  setInterval(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  clearInterval(handle: unknown): void;
}

export interface SandboxOptions {
  source: string;
  snapshot: EntitySnapshot;
  /** Schickt einen Befehl an die Welt. */
  post(cmd: ScriptCommand): void;
  log(level: 'log' | 'error', message: string): void;
  now?(): number;
  timers?: TimerApi;
  /** Klammer um Timer-Rückrufe (für den Watchdog des Hosts). */
  enter?(): void;
  leave?(): void;
}

export interface Sandbox {
  /** Namen der im Skript definierten Ereignisfunktionen. */
  handlers: ScriptEventName[];
  dispatch(name: string, args: unknown[]): void;
  updateSnapshot(snapshot: EntitySnapshot): void;
  dispose(): void;
}

/** Anzahl Zeilen, die `new Function` vor den Funktionsrumpf setzt. */
const WRAPPER_LINE_OFFSET = 2;
const MAX_TIMERS = 200;

function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'function') return `[Funktion ${value.name || 'anonym'}]`;
  if (value === undefined) return 'undefined';
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
}

/** Formatiert einen Fehler samt Zeilennummer relativ zum Nutzer-Quelltext. */
export function formatError(error: unknown): string {
  if (!(error instanceof Error)) return `Fehler: ${describeValue(error)}`;
  let text = `${error.name}: ${error.message}`;
  const match = /(?:<anonymous>|Function):(\d+):\d+/.exec(error.stack ?? '');
  if (match) {
    const line = Number(match[1]) - WRAPPER_LINE_OFFSET;
    if (line >= 1) text += ` (Zeile ${line})`;
  }
  return text;
}

const IMPORT_CALL = /\bimport\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*\(/;

function n(value: unknown, what: string): number {
  const x = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(x)) throw new TypeError(`${what}: Zahl erwartet`);
  return x;
}

function hexArg(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new TypeError(`${what}: Farbe im Format '#rrggbb' erwartet`);
  }
  return value.toLowerCase();
}

function textArg(value: unknown): string {
  return typeof value === 'string' ? value : describeValue(value);
}

export function createSandbox(options: SandboxOptions): Sandbox {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const timersApi: TimerApi = options.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as never),
    clearInterval: (h) => globalThis.clearInterval(h as never),
  };

  const cmdLimiter = new RateLimiter(COMMAND_LIMIT_PER_SEC, 1000, now);
  const sayLimiter = new RateLimiter(SAY_LIMIT_PER_SEC, 1000, now);
  const logLimiter = new RateLimiter(LOG_LIMIT_PER_SEC, 1000, now);
  let disposed = false;

  const log = (level: 'log' | 'error', message: string): void => {
    if (disposed) return;
    if (!logLimiter.take()) {
      if (logLimiter.shouldWarn()) options.log('error', 'Zu viele Log-Ausgaben: weitere werden verworfen.');
      return;
    }
    options.log(level, message.length > MAX_LOG_LENGTH ? `${message.slice(0, MAX_LOG_LENGTH)}…` : message);
  };

  let snapshot: EntitySnapshot = structuredCloneSafe(options.snapshot);
  function structuredCloneSafe(s: EntitySnapshot): EntitySnapshot {
    return {
      id: s.id,
      name: s.name,
      position: [...s.position] as Vec3,
      rotation: [...s.rotation] as Vec3,
      state: JSON.parse(JSON.stringify(s.state ?? {})) as Record<string, unknown>,
    };
  }

  const post = (cmd: ScriptCommand): void => {
    if (disposed) return;
    if (cmd.c === 'say' && !sayLimiter.take()) {
      if (sayLimiter.shouldWarn()) log('error', `say() ist auf ${SAY_LIMIT_PER_SEC} Aufrufe pro Sekunde begrenzt; weitere werden verworfen.`);
      return;
    }
    if (!cmdLimiter.take()) {
      if (cmdLimiter.shouldWarn()) log('error', `Zu viele Befehle (mehr als ${COMMAND_LIMIT_PER_SEC} pro Sekunde): weitere werden verworfen.`);
      return;
    }
    options.post(cmd);
  };

  // ------------------------------------------------------------- Timer
  const timers = new Map<number, { real: unknown; interval: boolean }>();
  let timerId = 0;
  const guarded = (fn: () => void) => () => {
    options.enter?.();
    try {
      fn();
    } catch (error) {
      log('error', formatError(error));
    } finally {
      options.leave?.();
    }
  };
  const addTimer = (interval: boolean, fn: unknown, ms: unknown): number => {
    if (typeof fn !== 'function') throw new TypeError('Timer: eine Funktion wird erwartet');
    if (timers.size >= MAX_TIMERS) throw new Error(`Zu viele Timer (maximal ${MAX_TIMERS})`);
    const delay = Math.max(interval ? 20 : 0, Number.isFinite(Number(ms)) ? Number(ms) : 0);
    const id = ++timerId;
    const run = guarded(() => {
      if (!interval) timers.delete(id);
      (fn as () => unknown)();
    });
    const real = interval ? timersApi.setInterval(run, delay) : timersApi.setTimeout(run, delay);
    timers.set(id, { real, interval });
    return id;
  };
  const clearTimer = (id: unknown): void => {
    const entry = timers.get(id as number);
    if (!entry) return;
    timers.delete(id as number);
    if (entry.interval) timersApi.clearInterval(entry.real);
    else timersApi.clearTimeout(entry.real);
  };

  // -------------------------------------------------------- API-Objekte
  const media = (op: ScriptCommand & { c: 'media' }) => post(op);
  const self = {
    id: snapshot.id,
    getPosition: () => ({ x: snapshot.position[0], y: snapshot.position[1], z: snapshot.position[2] }),
    setPosition(x: number, y: number, z: number) {
      const v: Vec3 = [n(x, 'setPosition x'), n(y, 'setPosition y'), n(z, 'setPosition z')];
      snapshot.position = v;
      post({ c: 'position', v });
    },
    move(dx: number, dy: number, dz: number) {
      const p = snapshot.position;
      const v: Vec3 = [p[0] + n(dx, 'move dx'), p[1] + n(dy, 'move dy'), p[2] + n(dz, 'move dz')];
      snapshot.position = v;
      post({ c: 'position', v });
    },
    getRotation: () => ({ x: snapshot.rotation[0], y: snapshot.rotation[1], z: snapshot.rotation[2] }),
    setRotation(x: number, y: number, z: number) {
      const v: Vec3 = [n(x, 'setRotation x'), n(y, 'setRotation y'), n(z, 'setRotation z')];
      snapshot.rotation = v;
      post({ c: 'rotation', v });
    },
    rotate(dx: number, dy: number, dz: number) {
      const r = snapshot.rotation;
      const v: Vec3 = [r[0] + n(dx, 'rotate dx'), r[1] + n(dy, 'rotate dy'), r[2] + n(dz, 'rotate dz')];
      snapshot.rotation = v;
      post({ c: 'rotation', v });
    },
    setScale(x: number, y: number, z: number) {
      post({ c: 'scale', v: [n(x, 'setScale x'), n(y, 'setScale y'), n(z, 'setScale z')] });
    },
    setColor: (color: string) => post({ c: 'color', v: hexArg(color, 'setColor') }),
    setEmissive: (color: string) => post({ c: 'emissive', v: hexArg(color, 'setEmissive') }),
    setAlpha: (alpha: number) => post({ c: 'alpha', v: n(alpha, 'setAlpha') }),
    setParticles(on: unknown, preset?: ParticlePreset) {
      post({ c: 'particles', on: Boolean(on), preset });
    },
    applyImpulse: (x: number, y: number, z: number) =>
      post({ c: 'impulse', v: [n(x, 'applyImpulse x'), n(y, 'applyImpulse y'), n(z, 'applyImpulse z')] }),
    setPhysics: (mode: PhysicsMode) => post({ c: 'physics', mode }),
    say: (text: unknown) => post({ c: 'say', text: textArg(text) }),
    getState: (key: string) => snapshot.state[key],
    setState(key: string, value: unknown) {
      if (typeof key !== 'string' || value === undefined || !isJsonValue(value)) {
        throw new TypeError('setState: Schlüssel muss Text und Wert JSON-tauglich sein');
      }
      const clone = JSON.parse(JSON.stringify(value)) as unknown;
      snapshot.state[key] = clone;
      post({ c: 'setState', key, value: clone });
    },
    setImage: (url: string) => media({ c: 'media', op: 'setImage', value: textArg(url) }),
    setUrl: (url: string) => media({ c: 'media', op: 'setUrl', value: textArg(url) }),
    setText: (text: string) => media({ c: 'media', op: 'setText', value: textArg(text) }),
    nextSlide: () => media({ c: 'media', op: 'nextSlide' }),
    prevSlide: () => media({ c: 'media', op: 'prevSlide' }),
  };

  const jsonArg = (data: unknown): unknown => {
    if (data === undefined) return undefined;
    if (!isJsonValue(data)) throw new TypeError('Nachrichten-Daten müssen JSON-tauglich sein');
    return JSON.parse(JSON.stringify(data)) as unknown;
  };
  const world = {
    send: (target: string, message: string, data?: unknown) =>
      post({ c: 'send', target: textArg(target), message: textArg(message), data: jsonArg(data) }),
    broadcast: (message: string, data?: unknown) => post({ c: 'broadcast', message: textArg(message), data: jsonArg(data) }),
    playSound: (name: string) => post({ c: 'sound', name: textArg(name) }),
    playTone: (frequency: number, duration: number) =>
      post({ c: 'tone', frequency: n(frequency, 'playTone Frequenz'), duration: n(duration, 'playTone Dauer') }),
    teleportAvatar: (avatarId: string, x: number, y: number, z: number) =>
      post({ c: 'teleport', avatarId: textArg(avatarId), v: [n(x, 'x'), n(y, 'y'), n(z, 'z')] }),
    time: () => (now() - startedAt) / 1000,
  };

  const logFn = (...values: unknown[]) => log('log', values.map(describeValue).join(' '));
  const consoleObj = {
    log: logFn,
    info: logFn,
    warn: logFn,
    debug: logFn,
    error: (...values: unknown[]) => log('error', values.map(describeValue).join(' ')),
  };

  // ------------------------------------------------------ Übersetzen
  if (IMPORT_CALL.test(options.source)) {
    throw new SandboxCompileError('SyntaxError: dynamisches import() ist in Skripten nicht erlaubt');
  }
  const eventNames = SCRIPT_EVENTS.map((event) => event.name);
  const returnBlock = `\n;return {${eventNames.map((name) => `${name}: typeof ${name} === 'function' ? ${name} : undefined`).join(', ')}};`;
  const apiNames = ['self', 'world', 'log', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'];
  const params = [...apiNames, ...SHADOWED_NAMES];
  let factory: (...args: unknown[]) => Record<string, unknown>;
  try {
    factory = new CompileFunction(...params, `"use strict";${options.source}${returnBlock}`) as typeof factory;
  } catch (error) {
    throw new SandboxCompileError(`${(error as Error).name}: ${(error as Error).message}`);
  }

  let table: Record<string, unknown>;
  options.enter?.();
  try {
    table = factory(
      self,
      world,
      logFn,
      consoleObj,
      (fn: unknown, ms: unknown) => addTimer(false, fn, ms),
      (fn: unknown, ms: unknown) => addTimer(true, fn, ms),
      clearTimer,
      clearTimer,
    );
  } catch (error) {
    throw new SandboxCompileError(formatError(error));
  } finally {
    options.leave?.();
  }

  const handlers = eventNames.filter((name) => typeof table[name] === 'function');

  return {
    handlers,
    dispatch(name, args) {
      if (disposed || !(handlers as string[]).includes(name)) return;
      try {
        const result = (table[name] as (...a: unknown[]) => unknown)(...args);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(undefined, (error: unknown) => log('error', formatError(error)));
        }
      } catch (error) {
        log('error', formatError(error));
      }
    },
    updateSnapshot(next) {
      snapshot = structuredCloneSafe(next);
    },
    dispose() {
      disposed = true;
      for (const id of [...timers.keys()]) clearTimer(id);
    },
  };
}
