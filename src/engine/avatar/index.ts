/**
 * Paket 2: Avatar & Steuerung. Verbindet Darstellung (visual), Bewegung (controller),
 * Kamera (camera), Gesten (emotes) und Oberfläche (ui) mit dem Ereignisbus.
 */
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import { createElement } from 'react';
import { EMOTE_NAMES, type AvatarAppearance } from '../../../shared/avatar';
import type { Vec3 } from '../../../shared/types';
import type { GameContext, GameModule } from '../../core/context';
import { loadAppearance, saveAppearance, saveName, sanitizeAppearance, sanitizeName } from './appearance';
import { AvatarCamera } from './camera';
import { AvatarController } from './controller';
import { cancelForSitting, cancelOnMove, emoteKey, expireEmotes, startEmote, type EmoteChange } from './emotes';
import {
  EMPTY_INPUT,
  isSeat,
  KEY_BINDINGS,
  MovedGate,
  seatPlacement,
  yawFromQuat,
  hasMoveIntent,
  mergeInput,
  type InputState,
} from './logic';
import { AppearanceDialog, GesturesPanel } from './ui';
import { avatarActions, avatarUi } from './uiState';
import { createAvatarFactory } from './visual';

const SPAWN_REF = 'EntitySpec.avatar-spawn';

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

let teardown: (() => void) | null = null;

const avatar: GameModule = {
  id: 'avatar',
  init(ctx: GameContext) {
    teardown?.();
    const { scene, store, bus, localAvatar, canvas } = ctx;
    // Fabrik zuerst: das Netz-Paket erzeugt damit entfernte Avatare.
    ctx.avatarFactory = createAvatarFactory(ctx);

    // ---- Aussehen laden
    localAvatar.appearance = loadAppearance();
    const visual = ctx.avatarFactory(localAvatar.appearance);
    visual.root.name = 'avatar.local';

    const cam = new AvatarCamera(scene, canvas);
    const input: InputState = { ...EMPTY_INPUT };
    // Kurze Tastenanschläge zwischen zwei Bildern nicht verlieren.
    const tapped: InputState = { ...EMPTY_INPUT };
    const cleanups: (() => void)[] = [];
    const observers: { scene: Scene; observer: Observer<Scene> }[] = [];

    // ---- Gesten
    const applyEmoteChange = (change: EmoteChange) => {
      for (const e of change.ended) bus.emit('avatar.emote.ended', { avatarId: localAvatar.identity.id, channel: e.channel, name: e.name });
      if (change.emotes !== localAvatar.emotes) {
        localAvatar.emotes = change.emotes;
        visual.setEmotes(change.emotes);
      }
    };
    const requestEmote = (name: string) => {
      if (!localAvatar.permissions.canEmote) return;
      const change = startEmote(localAvatar.emotes, name, Date.now(), !!controller.seat);
      if (!change) return;
      applyEmoteChange(change);
      if (change.started) {
        const { channel, state } = change.started;
        bus.emit('avatar.emote', { avatarId: localAvatar.identity.id, channel, name: state.name, startedAt: state.startedAt, durationMs: state.durationMs, loop: state.loop });
      }
    };

    // ---- Fokus
    const setFocus = (focus: string | null) => {
      if ((localAvatar.presence.focus ?? null) === focus) return;
      localAvatar.presence.focus = focus;
      bus.emit('avatar.focusChanged', { avatarId: localAvatar.identity.id, focus });
    };

    // ---- Spawn
    const findSpawn = (): { pos: Vec3; yaw: number } => {
      const state = store.getState();
      const e = state.order.map((id) => state.entities[id]).find((x) => x?.ref === SPAWN_REF);
      if (!e) return { pos: [0, 0.3, 0], yaw: 0 };
      const [x, y, z] = e.transform.pos;
      return { pos: [x, y + 0.3, z], yaw: yawFromQuat(e.transform.rot) };
    };

    const gate = new MovedGate();
    const syncState = () => {
      const f = controller.feet;
      localAvatar.presence.position = [f[0], f[1], f[2]];
      localAvatar.presence.yaw = controller.yaw;
      localAvatar.motion = controller.motion;
      visual.root.position.set(f[0], f[1], f[2]);
      visual.root.rotation.y = controller.yaw;
    };

    const spawn = () => {
      const { pos, yaw } = findSpawn();
      setFocus(null);
      controller.place(pos, yaw);
      cam.faceBehind(yaw);
      cam.snap();
      applyEmoteChange({ emotes: {}, ended: Object.entries(localAvatar.emotes).map(([channel, e]) => ({ channel, name: e.name })) });
      controller.flying = store.getState().world.rules.movement.mode === 'flying' && controller.speedSettings.canFly;
      syncState();
      bus.emit('avatar.spawned', { avatar: localAvatar });
    };

    const controller = new AvatarController(ctx, {
      fell() {
        spawn();
        bus.emit('ui.toast', { text: 'Du bist von der Insel gefallen und wieder am Startpunkt.', kind: 'info' });
      },
      stoodUp() {
        setFocus(null);
      },
    });

    // ---- Sitzen
    const trySit = (entityId: string, point: Vec3) => {
      if (!localAvatar.permissions.canMove) return;
      const entity = store.getState().entities[entityId];
      if (!entity || !isSeat(entity)) return;
      const placement = seatPlacement(entity, point);
      if (!placement) return;
      if (controller.seat?.entityId === entityId && controller.seat.slot === placement.slot) return;
      controller.sitDown({ ...placement, entityId });
      applyEmoteChange(cancelForSitting(localAvatar.emotes));
      setFocus(`object:${entityId}`);
      cam.snap();
    };

    // ---- Eingabe
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping() || store.getState().mode !== 'play') return;
      const field = KEY_BINDINGS[e.code];
      if (field) {
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        if (field !== 'run' && e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') return; // Strg+W usw. nicht abfangen
        input[field] = true;
        tapped[field] = true;
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (e.code === 'KeyF') toggleFly();
      else if (e.code.startsWith('Digit') || e.code.startsWith('Numpad')) {
        const n = Number(e.code.slice(-1));
        const name = EMOTE_NAMES[n - 1];
        if (name) requestEmote(name);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const field = KEY_BINDINGS[e.code];
      if (field) input[field] = false;
    };
    const clearInput = () => {
      Object.assign(input, EMPTY_INPUT);
      Object.assign(tapped, EMPTY_INPUT);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    cleanups.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
    });

    const toggleFly = () => {
      if (!localAvatar.permissions.canMove) return;
      if (controller.flying) controller.setFlying(false);
      else if (!controller.setFlying(true)) bus.emit('ui.toast', { text: 'Fliegen ist auf dieser Insel nicht erlaubt.', kind: 'error' });
      else applyEmoteChange(cancelOnMove(localAvatar.emotes));
    };
    avatarActions.toggleFly = toggleFly;

    // ---- Aussehen anwenden
    const applyAppearance = (next: AvatarAppearance, name: string) => {
      const clean = sanitizeAppearance(next, localAvatar.appearance);
      localAvatar.appearance = clean;
      visual.setAppearance(clean);
      saveAppearance(clean);
      const n = sanitizeName(name, localAvatar.identity.displayName);
      if (n !== localAvatar.identity.displayName) {
        localAvatar.identity.displayName = n;
        saveName(n);
      }
      bus.emit('avatar.moved', { avatar: localAvatar });
    };

    // ---- Bus
    cleanups.push(
      bus.on('world.loaded', spawn),
      bus.on('avatar.teleport', ({ position, yaw }) => {
        controller.place(position, yaw ?? controller.yaw);
        setFocus(null);
        cam.snap();
        syncState();
      }),
      bus.on('avatar.requestEmote', ({ name }) => requestEmote(name)),
      bus.on('entity.clicked', ({ entityId, avatar: who, point }) => {
        if (who && who.id && who.id !== localAvatar.identity.id) return;
        trySit(entityId, point);
      }),
      bus.on('entity.removed', ({ entity }) => {
        if (controller.seat?.entityId === entity.id) controller.standUp();
      }),
      bus.on('mode.changed', ({ mode }) => applyMode(mode)),
    );

    const applyMode = (mode: 'play' | 'build') => {
      if (mode === 'build') {
        clearInput();
        cam.detach();
      } else {
        cam.activate();
      }
    };

    // ---- Oberfläche
    cleanups.push(
      ctx.ui.register({ id: 'avatar.gestures', slot: 'toolbar', order: 20, component: GesturesPanel }),
      ctx.ui.register({
        id: 'avatar.appearance',
        slot: 'overlay',
        order: 50,
        component: (props) => createElement(AppearanceDialog, { ctx: props.ctx, onChange: applyAppearance }),
      }),
    );

    // ---- Start
    spawn();
    scene.activeCamera = cam.camera;
    applyMode(store.getState().mode);

    // ---- Frame
    let flyShown = false;
    const observer = scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000;
      const mode = store.getState().mode;
      const canMove = localAvatar.permissions.canMove;
      const enabled = mode === 'play' && canMove && !isTyping();

      const effective = mergeInput(input, tapped);
      Object.assign(tapped, EMPTY_INPUT);
      controller.update(dt, { enabled, input: enabled ? effective : EMPTY_INPUT, cameraForward: cam.forward2D() });
      if (enabled && hasMoveIntent(effective)) applyEmoteChange(cancelOnMove(localAvatar.emotes));
      if (controller.motion === 'walk' || controller.motion === 'run') applyEmoteChange(cancelOnMove(localAvatar.emotes));
      const now = Date.now();
      applyEmoteChange(expireEmotes(localAvatar.emotes, now));

      syncState();
      visual.setMotion(controller.motion);
      visual.update(dt);
      cam.update(dt, controller.feet, controller.motion === 'sit' ? 1.1 : 1.45);

      if (flyShown !== controller.flying || avatarUi.getState().sitting !== !!controller.seat) {
        flyShown = controller.flying;
        avatarUi.setState({ flying: controller.flying, sitting: !!controller.seat, canFly: controller.speedSettings.canFly });
      }

      const f = controller.feet;
      if (gate.step({ x: f[0], y: f[1], z: f[2], yaw: controller.yaw, motion: controller.motion, emoteKey: emoteKey(localAvatar.emotes) }, performance.now())) {
        bus.emit('avatar.moved', { avatar: localAvatar });
      }
    });
    if (observer) observers.push({ scene, observer });

    teardown = () => {
      for (const o of observers) o.scene.onBeforeRenderObservable.remove(o.observer);
      for (const c of cleanups) c();
      avatarActions.toggleFly = () => {};
      avatarUi.setState({ flying: false, sitting: false, appearanceOpen: false });
      visual.dispose();
      controller.dispose();
      cam.dispose();
      teardown = null;
    };
  },
  dispose() {
    teardown?.();
  },
};

export default avatar;
