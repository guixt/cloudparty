/**
 * Steuerung der Shell: Sitzung, Insel-Wechsel, Adressleiste, Menüzustand.
 * Die React-Komponenten lesen `controller.ui` (zustand) und rufen die Methoden auf.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createDefaultWorld } from '../../../shared/defaultWorld';
import type { IslandDetail } from '../../../shared/protocol';
import type { SkyPreset, Vec3, WorldSpec } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { ApiError, createApi, NAME_KEY, readStorage, TOKEN_KEY, USER_ID_KEY, writeStorage, type Api } from './api';
import { formatLocationHash, generateLocalIslandId, parseLocationHash } from './location';
import { connectToIsland, disconnectNet, setNetAutoConnect } from './netAdapter';

export type MenuTab = 'islands' | 'new' | 'this' | 'profile';

export interface ShellUiState {
  name: string | null;
  userId: string | null;
  /** Server konfiguriert, erreichbar und angemeldet. */
  serverOnline: boolean;
  welcomeOpen: boolean;
  menuOpen: boolean;
  menuTab: MenuTab;
  helpOpen: boolean;
  /** Aktuelle Insel; detail nur bei Server-Inseln. */
  islandId: string;
  detail: IslandDetail | null;
  /** Zählt hoch, wenn sich die lokale Liste ändern kann. */
  localRevision: number;
}

export const SKY_LABELS: Record<Exclude<SkyPreset, 'custom'>, string> = { clear: 'Sonniger Tag', dusk: 'Abenddämmerung', night: 'Nacht' };

export interface ShellController {
  ui: StoreApi<ShellUiState>;
  api: Api | null;
  ctx: GameContext;
  setName(name: string): Promise<void>;
  visit(id: string, position?: Vec3 | null, yaw?: number | null): Promise<void>;
  refreshDetail(): Promise<IslandDetail | null>;
  createIsland(name: string, sky: SkyPreset): Promise<void>;
  publishCurrent(): Promise<void>;
  deleteCurrent(): Promise<void>;
  deleteLocal(id: string): Promise<void>;
  updateBuilders(builders: string[]): Promise<void>;
  currentLink(): string;
  openMenu(tab?: MenuTab): void;
  closeMenu(): void;
  setHelp(open: boolean): void;
  start(): void;
  dispose(): void;
}

const toast = (ctx: GameContext, text: string, kind: 'info' | 'error' = 'info') => ctx.bus.emit('ui.toast', { text, kind });

export function createController(ctx: GameContext): ShellController {
  const api = ctx.config.serverUrl ? createApi(ctx.config.serverUrl) : null;
  const initialId = ctx.store.getState().world.metadata.id ?? 'willkommen';
  const ui = createStore<ShellUiState>(() => ({
    name: readStorage(NAME_KEY),
    userId: readStorage(USER_ID_KEY),
    serverOnline: false,
    welcomeOpen: !readStorage(NAME_KEY),
    menuOpen: false,
    menuTab: 'islands',
    helpOpen: false,
    islandId: initialId,
    detail: null,
    localRevision: 0,
  }));
  const cleanups: (() => void)[] = [];
  let lastWritten = '';
  let disposed = false;
  let ready = false;

  const applyName = (name: string) => {
    writeStorage(NAME_KEY, name);
    ctx.localAvatar.identity.displayName = name;
    ui.setState({ name });
  };
  if (ui.getState().name) ctx.localAvatar.identity.displayName = ui.getState().name!;

  /** Meldet an oder nutzt das gespeicherte Konto. Nie ein Fehlerdialog bei fehlendem Server. */
  async function ensureSession(): Promise<void> {
    const name = ui.getState().name;
    if (!api || !name) return;
    try {
      if (readStorage(TOKEN_KEY)) {
        try {
          const me = await api.me();
          writeStorage(USER_ID_KEY, me.userId);
          ui.setState({ userId: me.userId, serverOnline: true });
          if (me.name !== name) await api.rename(name).catch(() => undefined);
          return;
        } catch (error) {
          if (!(error instanceof ApiError) || error.unreachable) throw error;
        }
      }
      const login = await api.login(name);
      writeStorage(TOKEN_KEY, login.token);
      writeStorage(USER_ID_KEY, login.userId);
      ui.setState({ userId: login.userId, serverOnline: true });
    } catch {
      ui.setState({ serverOnline: false });
    }
  }

  const sameWorldId = (id: string) => ctx.store.getState().world.metadata.id === id;

  /** Wartet nach loadWorld, bis der Avatar gesetzt wurde (oder kurz verstreicht), dann Aktion. */
  function afterSpawn(action: () => void): void {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      off();
      window.clearTimeout(timer);
      action();
    };
    const off = ctx.bus.on('avatar.spawned', run);
    const timer = window.setTimeout(run, 700);
  }

  function teleportLater(position: Vec3 | null | undefined, yaw: number | null | undefined, worldChanged: boolean) {
    if (!position) return;
    const go = () => ctx.bus.emit('avatar.teleport', { position, ...(yaw !== null && yaw !== undefined ? { yaw } : {}) });
    if (worldChanged) afterSpawn(go);
    else go();
  }

  async function loadLocal(id: string, keepCurrent: boolean): Promise<boolean> {
    const stored = await ctx.persistence.load(id);
    if (stored) {
      ctx.store.getState().loadWorld({ ...stored, metadata: { ...stored.metadata, id } });
      return true;
    }
    if (keepCurrent) {
      if (!sameWorldId(id)) ctx.store.getState().setMetadata({ id });
      return false;
    }
    ctx.store.getState().loadWorld(createDefaultWorld(id === 'willkommen' ? 'Willkommensinsel' : id, id));
    return true;
  }

  /** Lädt die Insel über das Netzmodul oder, ohne dieses, per REST bzw. lokal. Liefert, ob die Welt neu geladen wurde. */
  async function openIsland(id: string, keepCurrent: boolean): Promise<boolean> {
    ui.setState({ islandId: id, detail: null });
    if (ui.getState().serverOnline && api) {
      if (connectToIsland(id, readStorage(TOKEN_KEY))) {
        void controller.refreshDetail();
        return true;
      }
      try {
        const detail = await api.getIsland(id);
        ctx.store.getState().loadWorld({ ...detail.world, metadata: { ...detail.world.metadata, id } });
        const userId = ui.getState().userId;
        ctx.store.getState().setCanBuild(detail.builders.includes('*') || (!!userId && (detail.owner === userId || detail.builders.includes(userId))));
        ui.setState({ detail });
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status !== 404 && !error.unreachable) toast(ctx, error.message, 'error');
        // 404 oder unerreichbar: lokal weiter
      }
    }
    disconnectNet();
    ctx.store.getState().setCanBuild(true);
    return loadLocal(id, keepCurrent);
  }

  function writeHash(force = false): void {
    const { islandId } = ui.getState();
    const a = ctx.localAvatar.presence;
    const hash = formatLocationHash(islandId, a.position, a.yaw);
    if (!force && hash === lastWritten) return;
    lastWritten = hash;
    if (location.hash !== hash) {
      try {
        history.replaceState(null, '', hash);
      } catch {
        /* z. B. in Sandboxes */
      }
    }
  }

  const controller: ShellController = {
    ui,
    api,
    ctx,

    async setName(raw) {
      const name = raw.trim().slice(0, 32);
      if (!name) return;
      applyName(name);
      ui.setState({ welcomeOpen: false });
      if (api && ui.getState().serverOnline && readStorage(TOKEN_KEY)) await api.rename(name).catch(() => undefined);
    },

    async visit(id, position, yaw) {
      ui.setState({ menuOpen: false });
      lastWritten = '';
      const changed = await openIsland(id, false);
      ui.setState({ localRevision: ui.getState().localRevision + 1 });
      if (position) history.replaceState(null, '', formatLocationHash(id, position, yaw ?? null));
      teleportLater(position, yaw, changed);
      if (!position) writeHash(true);
    },

    async refreshDetail() {
      const { islandId, serverOnline } = ui.getState();
      if (!api || !serverOnline) return null;
      try {
        const detail = await api.getIsland(islandId);
        if (ui.getState().islandId === islandId) ui.setState({ detail });
        return detail;
      } catch {
        if (ui.getState().islandId === islandId) ui.setState({ detail: null });
        return null;
      }
    },

    async createIsland(rawName, sky) {
      const name = rawName.trim() || 'Meine Insel';
      const withSky = (world: WorldSpec): WorldSpec => ({ ...world, environment: { ...world.environment, sky: { preset: sky } } });
      if (api && ui.getState().serverOnline) {
        try {
          const created = await api.createIsland(withSky(createDefaultWorld(name, generateLocalIslandId(name))));
          await controller.visit(created.id);
          toast(ctx, `Insel „${created.name}" wurde erstellt.`);
          return;
        } catch (error) {
          toast(ctx, error instanceof ApiError ? error.message : 'Die Insel konnte nicht erstellt werden.', 'error');
          return;
        }
      }
      const id = generateLocalIslandId(name);
      await ctx.persistence.save(id, withSky(createDefaultWorld(name, id)));
      await controller.visit(id);
      toast(ctx, `Lokale Insel „${name}" wurde erstellt.`);
    },

    async publishCurrent() {
      if (!api || !ui.getState().serverOnline) return;
      const world = ctx.store.getState().toWorldSpec();
      const oldId = ui.getState().islandId;
      try {
        const created = await api.createIsland(world);
        await ctx.persistence.remove(oldId).catch(() => undefined);
        await controller.visit(created.id);
        toast(ctx, 'Die Insel ist jetzt auf dem Server veröffentlicht.');
      } catch (error) {
        toast(ctx, error instanceof ApiError ? [error.message, ...error.details.slice(0, 2)].join(' ') : 'Veröffentlichen fehlgeschlagen.', 'error');
      }
    },

    async deleteCurrent() {
      const { islandId, detail } = ui.getState();
      try {
        if (detail && api) await api.deleteIsland(islandId);
        else await ctx.persistence.remove(islandId);
        toast(ctx, 'Die Insel wurde gelöscht.');
        await controller.visit('willkommen');
      } catch (error) {
        toast(ctx, error instanceof ApiError ? error.message : 'Löschen fehlgeschlagen.', 'error');
      }
    },

    async deleteLocal(id) {
      await ctx.persistence.remove(id);
      ui.setState({ localRevision: ui.getState().localRevision + 1 });
      if (id === ui.getState().islandId && !ui.getState().detail) await controller.visit('willkommen');
    },

    async updateBuilders(builders) {
      const { islandId } = ui.getState();
      if (!api) return;
      try {
        const detail = await api.updateIsland(islandId, { builders });
        ui.setState({ detail });
      } catch (error) {
        toast(ctx, error instanceof ApiError ? error.message : 'Änderung fehlgeschlagen.', 'error');
      }
    },

    currentLink() {
      writeHash(true);
      return location.href;
    },

    openMenu(tab) {
      ui.setState({ menuOpen: true, helpOpen: false, ...(tab ? { menuTab: tab } : {}) });
    },
    closeMenu: () => ui.setState({ menuOpen: false }),
    setHelp: (open) => ui.setState({ helpOpen: open, ...(open ? { menuOpen: false } : {}) }),

    start() {
      const onHashChange = () => {
        if (!ready) return;
        const parsed = parseLocationHash(location.hash);
        if (!parsed.island) return;
        if (parsed.island === ui.getState().islandId) {
          teleportLater(parsed.position, parsed.yaw, false);
          lastWritten = location.hash;
        } else {
          void controller.visit(parsed.island, parsed.position, parsed.yaw);
        }
      };
      window.addEventListener('hashchange', onHashChange);
      cleanups.push(() => window.removeEventListener('hashchange', onHashChange));
      const timer = window.setInterval(() => ready && writeHash(), 1000);
      cleanups.push(() => window.clearInterval(timer));
      // Welten, die das Netzmodul lädt, bestimmen die aktuelle Insel mit.
      cleanups.push(
        ctx.bus.on('world.loaded', ({ world }) => {
          const id = world.metadata.id;
          if (id && id !== ui.getState().islandId) ui.setState({ islandId: id, detail: null });
        }),
      );

      void (async () => {
        setNetAutoConnect(false);
        const parsed = parseLocationHash(location.hash);
        // Ohne Namen wartet der Start auf den Willkommensdialog.
        if (!ui.getState().name) {
          await new Promise<void>((resolve) => {
            const off = ui.subscribe((s) => {
              if (s.name) {
                off();
                resolve();
              }
            });
          });
        }
        if (disposed) return;
        await ensureSession();
        if (disposed) return;
        const id = parsed.island ?? ctx.store.getState().world.metadata.id ?? 'willkommen';
        const changed = await openIsland(id, true);
        if (disposed) return;
        teleportLater(parsed.position, parsed.yaw, changed);
        ready = true;
        if (!parsed.position) writeHash(true);
      })();
    },

    dispose() {
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
  return controller;
}
