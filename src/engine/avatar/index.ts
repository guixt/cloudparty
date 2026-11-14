/**
 * STUB des Fundaments – Paket 2 (Avatar & Steuerung) ersetzt diese Datei.
 * Liefert vorerst: Platzhalter-Avatar am Startpunkt, WASD-Bewegung ohne Physik,
 * Kamera, laufende Aktualisierung von ctx.localAvatar und 'avatar.moved'.
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { GameModule } from '../../core/context';

const avatar: GameModule = {
  id: 'avatar',
  init(ctx) {
    const { scene, store, bus, localAvatar, canvas } = ctx;
    const visual = ctx.avatarFactory(localAvatar.appearance);
    const spawn = () => {
      const state = store.getState();
      const spawnEntity = state.order.map((id) => state.entities[id]).find((e) => e.ref === 'EntitySpec.avatar-spawn');
      const [x, y, z] = spawnEntity?.transform.pos ?? [0, 0, 0];
      visual.root.position.set(x, y, z);
      localAvatar.presence.position = [x, y, z];
      bus.emit('avatar.spawned', { avatar: localAvatar });
    };
    spawn();
    bus.on('world.loaded', spawn);
    bus.on('avatar.teleport', ({ position }) => visual.root.position.set(position[0], position[1], position[2]));

    const camera = new ArcRotateCamera('avatar.camera', -Math.PI / 2, 1.1, 9, new Vector3(0, 1.2, 0), scene);
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 40;
    camera.attachControl(canvas, true);
    scene.activeCamera = camera;

    const keys = new Set<string>();
    const isTyping = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
    };
    window.addEventListener('keydown', (e) => !isTyping() && keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

    let sinceSend = 0;
    scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000;
      if (store.getState().mode === 'play') {
        const forward = camera.getForwardRay().direction;
        forward.y = 0;
        forward.normalize();
        const right = Vector3.Cross(Vector3.Up(), forward);
        const move = Vector3.Zero();
        if (keys.has('w')) move.addInPlace(forward);
        if (keys.has('s')) move.subtractInPlace(forward);
        if (keys.has('d')) move.addInPlace(right);
        if (keys.has('a')) move.subtractInPlace(right);
        const moving = move.lengthSquared() > 0;
        if (moving) {
          move.normalize().scaleInPlace(5 * dt);
          visual.root.position.addInPlace(move);
          visual.root.rotation.y = Math.atan2(move.x, move.z);
        }
        localAvatar.motion = moving ? 'walk' : 'idle';
      }
      const p = visual.root.position;
      localAvatar.presence.position = [p.x, p.y, p.z];
      localAvatar.presence.yaw = visual.root.rotation.y;
      camera.target.set(p.x, p.y + 1.2, p.z);
      sinceSend += dt;
      if (sinceSend > 1 / 12) {
        sinceSend = 0;
        bus.emit('avatar.moved', { avatar: localAvatar });
      }
    });
  },
};
export default avatar;
