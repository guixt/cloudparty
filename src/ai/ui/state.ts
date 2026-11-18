/**
 * Ansichtsmodell des Assistenten: Nachrichten, Laufzustand, Rückfragen, Verbrauch.
 * Reine Logik (Reducer) + Controller, der `AssistantApi.run` anspricht. Kein React.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AssistantApi, AssistantEvent } from '../api';

export type Message =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; text: string }
  | { id: number; kind: 'tool'; name: string; summary: string; ok: boolean }
  | { id: number; kind: 'error'; message: string }
  | { id: number; kind: 'confirm'; question: string; detail?: string; status: 'pending' | 'yes' | 'no' };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Aus dem Prompt-Cache gelesene Tokens (günstiger abgerechnet). */
  cacheReadTokens?: number;
}

/** Ausgang eines eingereihten Auftrags: ok = fertig, failed = Fehler/Abbruch, skipped = nie gestartet (entfernt/geleert/kein Key). */
export type PromptResult = 'ok' | 'failed' | 'skipped';

export interface QueuedPrompt {
  id: number;
  text: string;
  /** Kurzer Anzeigetext statt des (langen) Auftragstexts, z. B. bei Plan-Knoten. */
  label?: string;
  /** Wird direkt vor dem Start dieses Auftrags aufgerufen (z. B. frischer Gesprächsverlauf). */
  beforeRun?: () => void;
  /** Ausgabegrenze nur für diesen Auftrag (z. B. größer für Plan-Knoten). */
  maxOutputTokens?: number;
  /** Meldet, wie der Auftrag endete. */
  onResult?: (result: PromptResult) => void;
}

/** So viele Nachrichten dürfen höchstens warten. */
export const MAX_QUEUE = 20;

export interface AiView {
  messages: Message[];
  running: boolean;
  /** Wartende Nachrichten (werden nacheinander abgearbeitet). */
  queue: QueuedPrompt[];
  /** Die Warteschlange ist angehalten (nach „Stopp" oder einem Fehler) und wartet auf „Fortsetzen". */
  paused: boolean;
  /** Letzter Auftrag hat etwas verändert → „Rückgängig" anbieten. */
  changed: boolean;
  usage: Usage | null;
  nextId: number;
}

export const initialView = (): AiView => ({ messages: [], running: false, queue: [], paused: false, changed: false, usage: null, nextId: 1 });

function push(state: AiView, make: (id: number) => Message): AiView {
  return { ...state, messages: [...state.messages, make(state.nextId)], nextId: state.nextId + 1 };
}

export function addUser(state: AiView, text: string): AiView {
  return push({ ...state, usage: null, changed: false }, (id) => ({ id, kind: 'user', text }));
}

/** Wendet ein Ereignis des Assistenten auf das Ansichtsmodell an. */
export function applyEvent(state: AiView, event: AssistantEvent): AiView {
  switch (event.type) {
    case 'text': {
      const last = state.messages[state.messages.length - 1];
      if (last && last.kind === 'assistant') {
        const messages = state.messages.slice(0, -1);
        messages.push({ ...last, text: last.text + event.delta });
        return { ...state, messages };
      }
      return push(state, (id) => ({ id, kind: 'assistant', text: event.delta }));
    }
    case 'tool':
      return push(state, (id) => ({ id, kind: 'tool', name: event.name, summary: event.summary, ok: event.ok }));
    case 'confirm': {
      // Eine Karte pro Rückfrage: das Ereignis und der confirm-Callback können beide eintreffen.
      if (state.messages.some((m) => m.kind === 'confirm' && m.status === 'pending' && m.question === event.question)) return state;
      return push(state, (id) => ({ id, kind: 'confirm', question: event.question, detail: event.detail, status: 'pending' }));
    }
    case 'usage': {
      const u = state.usage ?? { inputTokens: 0, outputTokens: 0 };
      return {
        ...state,
        usage: {
          inputTokens: u.inputTokens + event.inputTokens,
          outputTokens: u.outputTokens + event.outputTokens,
          cacheReadTokens: (u.cacheReadTokens ?? 0) + (event.cacheReadTokens ?? 0),
        },
      };
    }
    case 'error':
      return push(state, (id) => ({ id, kind: 'error', message: event.message }));
    case 'done':
      return { ...state, running: false, changed: event.changed };
  }
}

export function resolveConfirmMessage(state: AiView, id: number, ok: boolean): AiView {
  return { ...state, messages: state.messages.map((m) => (m.id === id && m.kind === 'confirm' ? { ...m, status: ok ? 'yes' : 'no' } : m)) };
}

/** Tokenzahl mit geschütztem Leerzeichen als Tausendertrenner: „1 234". */
export function formatTokens(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
export function usageLine(u: Usage): string {
  const cached = u.cacheReadTokens ? `, davon ${formatTokens(u.cacheReadTokens)} aus dem Cache` : '';
  return `${formatTokens(u.inputTokens)} Tokens ein${cached} / ${formatTokens(u.outputTokens)} aus`;
}

export const SUGGESTIONS = [
  'Baue ein kleines Haus mit Garten',
  'Stelle drei Bänke um die Laterne',
  'Mach es Nacht und stelle Laternen auf',
  'Setze eine Tafel mit einer Folienshow',
  'Schreibe ein Skript: der Würfel wechselt beim Anklicken die Farbe',
];

export type AiStore = StoreApi<AiView>;
export const createAiStore = (): AiStore => createStore<AiView>(() => initialView());

export interface ControllerDeps {
  store: AiStore;
  getApi: () => AssistantApi | null;
  notify: (text: string, kind?: 'info' | 'error') => void;
  /** Kein Key vorhanden: Einstellungen öffnen. */
  needKey: () => void;
}

export interface AiController {
  /** Startet die Nachricht sofort oder reiht sie in die Warteschlange ein, wenn gerade ein Auftrag läuft. */
  send(prompt: string): Promise<void>;
  /** Hält den laufenden Auftrag an; wartende Nachrichten bleiben erhalten, die Schlange pausiert. */
  stop(): void;
  /** Setzt eine pausierte Warteschlange fort. */
  resume(): Promise<void>;
  /**
   * Reiht einen Auftrag in dieselbe Warteschlange wie normale Nachrichten ein (läuft gerade etwas, wartet er) und
   * liefert, wie er endete. Für Plan-Knoten: `label` erscheint in der Liste, `beforeRun` läuft direkt vor dem Start.
   */
  enqueuePrompt(prompt: string, hooks?: { label?: string; beforeRun?: () => void; maxOutputTokens?: number }): Promise<PromptResult>;
  removeQueued(id: number): void;
  clearQueue(): void;
  answer(id: number, ok: boolean): void;
  reset(): void;
  undo(): void;
}

export function createController(deps: ControllerDeps): AiController {
  const { store, getApi, notify, needKey } = deps;
  const update = (fn: (s: AiView) => AiView) => store.setState(fn(store.getState()), true);
  const resolvers = new Map<number, (ok: boolean) => void>();
  let abort: AbortController | null = null;
  let pumping = false;

  function settleAll(ok: boolean): void {
    for (const [id, resolve] of [...resolvers]) {
      resolvers.delete(id);
      update((s) => resolveConfirmMessage(s, id, ok));
      resolve(ok);
    }
    // Karten ohne Resolver (nur Ereignis) ebenfalls schließen.
    update((s) => ({ ...s, messages: s.messages.map((m) => (m.kind === 'confirm' && m.status === 'pending' ? { ...m, status: ok ? 'yes' : 'no' } : m)) }));
  }

  /** Führt einen Auftrag aus. Gibt true zurück, wenn er regulär und ohne Fehler zu Ende ging. */
  async function execute(text: string, api: AssistantApi, display?: string, maxOutputTokens?: number): Promise<boolean> {
    const ac = new AbortController();
    abort = ac;
    let failed = false;
    update((s) => ({ ...addUser(s, display ?? text), running: true }));
    try {
      await api.run(text, {
        signal: ac.signal,
        ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
        onEvent: (ev) => {
          if (ev.type === 'error' || (ev.type === 'done' && ev.stopped)) failed = true;
          update((s) => applyEvent(s, ev));
        },
        confirm: (question, detail) =>
          new Promise<boolean>((resolve) => {
            if (ac.signal.aborted) return resolve(false);
            let id = -1;
            update((s) => {
              const existing = s.messages.find((m) => m.kind === 'confirm' && m.status === 'pending' && m.question === question && !resolvers.has(m.id));
              if (existing) {
                id = existing.id;
                return s;
              }
              id = s.nextId;
              return push(s, (i) => ({ id: i, kind: 'confirm', question, detail, status: 'pending' }));
            });
            resolvers.set(id, resolve);
          }),
      });
    } catch (e) {
      failed = true;
      if (!ac.signal.aborted) update((s) => applyEvent(s, { type: 'error', message: e instanceof Error ? e.message : String(e) }));
    } finally {
      settleAll(false);
      if (abort === ac) abort = null;
      update((s) => ({ ...s, running: false }));
    }
    return !failed && !ac.signal.aborted;
  }

  /** Arbeitet die Warteschlange der Reihe nach ab; hält bei Stopp oder Fehler an. */
  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const s = store.getState();
        const api = getApi();
        if (!api || s.running || s.paused) return;
        const next = s.queue[0];
        if (!next) return;
        update((v) => ({ ...v, queue: v.queue.slice(1) }));
        next.beforeRun?.();
        const ok = await execute(next.text, api, next.label, next.maxOutputTokens);
        next.onResult?.(ok ? 'ok' : 'failed');
        if (!ok) {
          if (store.getState().queue.length > 0) update((v) => ({ ...v, paused: true }));
          return;
        }
      }
    } finally {
      pumping = false;
    }
  }

  return {
    async send(prompt) {
      const text = prompt.trim();
      const api = getApi();
      if (!text || !api) return;
      if (!api.getSettings().hasKey) {
        needKey();
        return;
      }
      if (store.getState().queue.length >= MAX_QUEUE) {
        notify(`Die Warteschlange ist voll (höchstens ${MAX_QUEUE} Nachrichten).`, 'error');
        return;
      }
      update((s) => ({ ...s, queue: [...s.queue, { id: s.nextId, text }], nextId: s.nextId + 1 }));
      await pump();
    },
    enqueuePrompt(prompt, hooks = {}) {
      const text = prompt.trim();
      const api = getApi();
      if (!text || !api) return Promise.resolve('skipped');
      if (!api.getSettings().hasKey) {
        needKey();
        return Promise.resolve('skipped');
      }
      if (store.getState().queue.length >= MAX_QUEUE) {
        notify(`Die Warteschlange ist voll (höchstens ${MAX_QUEUE} Nachrichten).`, 'error');
        return Promise.resolve('skipped');
      }
      return new Promise<PromptResult>((resolve) => {
        update((s) => ({ ...s, queue: [...s.queue, { id: s.nextId, text, label: hooks.label, beforeRun: hooks.beforeRun, maxOutputTokens: hooks.maxOutputTokens, onResult: resolve }], nextId: s.nextId + 1 }));
        void pump();
      });
    },
    async resume() {
      update((s) => ({ ...s, paused: false }));
      await pump();
    },
    removeQueued(id) {
      store.getState().queue.find((q) => q.id === id)?.onResult?.('skipped');
      update((s) => {
        const queue = s.queue.filter((q) => q.id !== id);
        return { ...s, queue, paused: queue.length === 0 ? false : s.paused };
      });
    },
    clearQueue() {
      for (const q of store.getState().queue) q.onResult?.('skipped');
      update((s) => ({ ...s, queue: [], paused: false }));
    },
    stop() {
      abort?.abort();
      settleAll(false);
      if (store.getState().queue.length > 0) update((s) => ({ ...s, paused: true }));
    },
    answer(id, ok) {
      const resolve = resolvers.get(id);
      resolvers.delete(id);
      update((s) => resolveConfirmMessage(s, id, ok));
      resolve?.(ok);
    },
    reset() {
      for (const q of store.getState().queue) q.onResult?.('skipped');
      abort?.abort();
      settleAll(false);
      getApi()?.resetConversation();
      update(() => initialView());
    },
    undo() {
      const api = getApi();
      if (!api) return;
      const ok = api.undoLast();
      update((s) => ({ ...s, changed: false }));
      notify(ok ? 'Letzter KI-Auftrag rückgängig gemacht' : 'Nichts zum Rückgängigmachen', ok ? 'info' : 'error');
    },
  };
}

// --- Fenster-Zustand (geöffnet?), im Browser gemerkt ---
const OPEN_KEY = 'cloudparty.ai.open';
export function loadOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
export function saveOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignorieren */
  }
}
export const aiWindow = createStore<{ open: boolean }>(() => ({ open: loadOpen() }));
export function setOpen(open: boolean): void {
  aiWindow.setState({ open });
  saveOpen(open);
}
export const aiStore: AiStore = createAiStore();

/** Der aktive Controller des KI-Fensters (für Module wie die Plan-Ausführung). */
let activeController: AiController | null = null;
export function setActiveController(controller: AiController | null): void {
  activeController = controller;
}
export function getActiveController(): AiController | null {
  return activeController;
}
