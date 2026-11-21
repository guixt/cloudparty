/**
 * Paket 5 – Physik & Effekte.
 * Havok-Körper pro Entity (statisch/dynamisch/Trigger), Anstoßen/Greifen/Werfen,
 * Kollisions- und Trigger-Ereignisse sowie Partikelemitter.
 */
import '@babylonjs/core/Physics/v2/physicsEngineComponent';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import {
  PhysicsShape,
  PhysicsShapeBox,
  PhysicsShapeCylinder,
  PhysicsShapeSphere,
} from '@babylonjs/core/Physics/v2/physicsShape';
import {
  PhysicsEventType,
  PhysicsMotionType,
  PhysicsShapeType,
  type IPhysicsCollisionEvent,
} from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { EntitySpec, PhysicsMode, Vec3 } from '../../../shared/types';
import { entityIdOf, type GameContext, type GameModule } from '../../core/context';
import type { AvatarRef } from '../../core/events';
import {
  aabbOverlap,
  capsuleOverlapsAabb,
  clampImpulse,
  ContactTracker,
  gravityFor,
  inflateAabb,
  pairKey,
  pushImpulse,
  resolvePhysics,
  shapeKindForRef,
  Throttle,
  type Aabb,
} from './helpers';
import { createEmitter, disposeEmitter, particleRate, type EmitterHandle } from './particles';

const FALL_RESET_Y = -80;
const GRAB_RANGE = 6;
const HOLD_DELAY_MS = 220;
const CLICK_MOVE_PX = 10;
const MAX_THROW_SPEED = 14;
const MAX_IMPULSE = 5000;

interface BodyRec {
  id: string;
  body: PhysicsBody;
  shape: PhysicsShape;
  mode: PhysicsMode;
  mass: number;
  simulating: boolean;
  observers: Observer<IPhysicsCollisionEvent>[];
}

interface GrabState {
  rec: BodyRec;
  startX: number;
  startY: number;
  startT: number;
  holding: boolean;
  dist: number;
  history: { t: number; p: Vector3 }[];
  cameraWasAttached: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function setNodeTransform(node: TransformNode, entity: EntitySpec) {
  const { pos, rot } = entity.transform;
  node.position.set(pos[0], pos[1], pos[2]);
  if (node.rotationQuaternion) node.rotationQuaternion.set(rot[0], rot[1], rot[2], rot[3]);
  else node.rotationQuaternion = new Quaternion(rot[0], rot[1], rot[2], rot[3]);
  node.computeWorldMatrix(true);
}

/** Begrenzungsbox aller Kind-Meshes im Körperraum (Position + Drehung des Knotens, ohne Skalierung). */
function localBounds(node: TransformNode): { min: Vector3; max: Vector3 } | null {
  node.computeWorldMatrix(true);
  const meshes = node.getChildMeshes(false).filter((m) => m.isEnabled() && m.getTotalVertices() > 0);
  if (meshes.length === 0) return null;
  const scale = new Vector3();
  const rot = new Quaternion();
  const pos = new Vector3();
  node.getWorldMatrix().decompose(scale, rot, pos);
  const inverse = Matrix.Compose(Vector3.One(), rot, pos).invert();
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
      const local = Vector3.TransformCoordinates(corner, inverse);
      min.minimizeInPlace(local);
      max.maximizeInPlace(local);
    }
  }
  return min.x <= max.x ? { min, max } : null;
}

const physicsModule: GameModule & { _dispose?: () => void } = {
  id: 'physics',
  init(ctx: GameContext) {
    const { scene, bus, store, entityNodes, canvas, engine } = ctx;
    const recs = new Map<string, BodyRec>();
    const bodyIds = new Map<PhysicsBody, string>();
    const pending = new Set<string>();
    const pulses = new Set<PhysicsBody>();
    const boundsCache = new Map<string, Aabb>();
    const emitters = new Map<string, EmitterHandle>();
    const collisionThrottle = new Throttle(150);
    const contacts = new ContactTracker<string>();
    const unsubs: (() => void)[] = [];
    let grab: GrabState | null = null;
    let lastGravity = Number.NaN;
    let frame = 0;

    const state = () => store.getState();
    const avatarRef = (): AvatarRef => ({ id: ctx.localAvatar.identity.id, name: ctx.localAvatar.identity.displayName });
    const isPlay = () => state().mode === 'play';

    // ---------- Schwerkraft ----------
    const applyGravity = () => {
      const g = gravityFor(state().world.rules);
      if (g === lastGravity) return;
      lastGravity = g;
      scene.getPhysicsEngine()?.setGravity(new Vector3(0, -g, 0));
    };

    // ---------- Körper ----------
    const pulse = (body: PhysicsBody) => {
      body.disablePreStep = false;
      pulses.add(body);
    };
    scene.onAfterPhysicsObservable.add(() => {
      for (const body of pulses) body.disablePreStep = true;
      pulses.clear();
    });

    const zeroVelocity = (rec: BodyRec) => {
      if (!rec.simulating) return;
      rec.body.setLinearVelocity(Vector3.Zero());
      rec.body.setAngularVelocity(Vector3.Zero());
    };

    const teleport = (rec: BodyRec) => {
      zeroVelocity(rec);
      pulse(rec.body);
    };

    const createShape = (node: TransformNode, entity: EntitySpec, mode: PhysicsMode, params: ReturnType<typeof resolvePhysics>) => {
      const bounds = localBounds(node);
      if (!bounds) return null;
      const size = bounds.max.subtract(bounds.min);
      const center = bounds.min.add(bounds.max).scale(0.5);
      const thin = (v: number) => Math.max(0.02, v);
      let shape: PhysicsShape | null = null;
      const kind = shapeKindForRef(entity.ref, mode);
      try {
        if (kind === 'sphere') {
          shape = new PhysicsShapeSphere(center, thin(Math.max(size.x, size.y, size.z) / 2), scene);
        } else if (kind === 'cylinder') {
          shape = new PhysicsShapeCylinder(
            new Vector3(center.x, bounds.min.y, center.z),
            new Vector3(center.x, bounds.max.y, center.z),
            thin(Math.max(size.x, size.z) / 2),
            scene,
          );
        } else if (kind === 'convex' || kind === 'mesh') {
          shape = new PhysicsShape(
            {
              type: kind === 'convex' ? PhysicsShapeType.CONVEX_HULL : PhysicsShapeType.MESH,
              parameters: { mesh: node as unknown as Mesh, includeChildMeshes: true },
            },
            scene,
          );
        }
      } catch (error) {
        console.warn(`[physics] Form für ${entity.id} nicht möglich, nutze Box`, error);
        shape = null;
      }
      if (!shape) {
        shape = new PhysicsShapeBox(center, Quaternion.Identity(), new Vector3(thin(size.x), thin(size.y), thin(size.z)), scene);
      }
      shape.material = { friction: params.friction, restitution: params.restitution };
      if (mode === 'trigger') shape.isTrigger = true;
      return shape;
    };

    const destroyBody = (id: string) => {
      pending.delete(id);
      const rec = recs.get(id);
      if (!rec) return;
      if (grab?.rec === rec) cancelGrab();
      recs.delete(id);
      bodyIds.delete(rec.body);
      pulses.delete(rec.body);
      for (const observer of rec.observers) rec.body.getCollisionObservable().remove(observer);
      try {
        rec.body.dispose();
        rec.shape.dispose();
      } catch {
        /* Knoten war schon weg */
      }
    };

    const startSimulation = (rec: BodyRec) => {
      rec.body.setMotionType(PhysicsMotionType.DYNAMIC);
      rec.body.setMassProperties({ mass: rec.mass });
      rec.simulating = true;
      zeroVelocity(rec);
    };

    const freeze = (rec: BodyRec) => {
      if (!rec.simulating) return;
      zeroVelocity(rec);
      rec.body.setMotionType(PhysicsMotionType.STATIC);
      rec.simulating = false;
      const entity = state().entities[rec.id];
      const node = entityNodes.get(rec.id);
      if (entity && node) setNodeTransform(node, entity);
      pulse(rec.body);
    };

    const buildBody = (id: string) => {
      destroyBody(id);
      const entity = state().entities[id];
      const node = entityNodes.get(id);
      const mode = entity?.physics?.mode ?? 'none';
      if (!entity || !node || mode === 'none') return;
      if (node.physicsBody) {
        try {
          node.physicsBody.dispose();
        } catch {
          /* ignorieren */
        }
      }
      const params = resolvePhysics(entity.physics);
      const shape = createShape(node, entity, mode, params);
      if (!shape) {
        pending.add(id); // Meshes (z. B. glTF) sind noch nicht da
        return;
      }
      const wantDynamic = mode === 'dynamic' && isPlay();
      const body = new PhysicsBody(node, wantDynamic ? PhysicsMotionType.DYNAMIC : PhysicsMotionType.STATIC, false, scene);
      body.shape = shape;
      if (mode === 'dynamic') {
        body.setMassProperties({ mass: params.mass });
        body.setLinearDamping(0.02);
        body.setAngularDamping(0.2);
      }
      const rec: BodyRec = { id, body, shape, mode, mass: params.mass, simulating: wantDynamic, observers: [] };
      if (mode !== 'trigger') {
        body.setCollisionCallbackEnabled(true);
        rec.observers.push(body.getCollisionObservable().add((event) => onCollision(event)));
      }
      recs.set(id, rec);
      bodyIds.set(body, id);
      boundsCache.delete(id);
    };

    function onCollision(event: IPhysicsCollisionEvent) {
      if (event.type !== PhysicsEventType.COLLISION_STARTED) return;
      const a = bodyIds.get(event.collider);
      const b = bodyIds.get(event.collidedAgainst);
      if (!a || !b || a === b) return;
      if (!collisionThrottle.allow(pairKey(a, b), performance.now())) return;
      bus.emit('physics.collision', { a, b, impulse: Math.abs(event.impulse) });
    }

    // ---------- Weltgrenzen / Hilfen ----------
    const worldBounds = (id: string, node: TransformNode, cache: boolean): Aabb | null => {
      if (cache) {
        const cached = boundsCache.get(id);
        if (cached) return cached;
      }
      node.computeWorldMatrix(true);
      const { min, max } = node.getHierarchyBoundingVectors(true);
      let box: Aabb;
      if (min.x > max.x) {
        const p = node.getAbsolutePosition();
        box = { min: [p.x, p.y, p.z], max: [p.x, p.y, p.z] };
        return box; // noch ohne Meshes: nicht zwischenspeichern
      }
      box = { min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] };
      if (cache) boundsCache.set(id, box);
      return box;
    };

    // ---------- Partikel ----------
    const syncParticles = (id: string) => {
      const entity = state().entities[id];
      const node = entityNodes.get(id);
      const spec = entity?.particles;
      const current = emitters.get(id);
      if (!spec || !node) {
        if (current) {
          disposeEmitter(current);
          emitters.delete(id);
        }
        return;
      }
      let handle = current;
      if (handle && handle.preset !== spec.preset) {
        disposeEmitter(handle);
        emitters.delete(id);
        handle = undefined;
      }
      if (!handle) {
        handle = createEmitter(scene, id, spec);
        emitters.set(id, handle);
      }
      handle.system.emitRate = particleRate(spec);
      placeEmitter(id, handle);
      if (spec.enabled && !handle.running) {
        handle.system.start();
        handle.running = true;
      } else if (!spec.enabled && handle.running) {
        handle.system.stop();
        handle.running = false;
      }
    };
    const placeEmitter = (id: string, handle: EmitterHandle) => {
      const node = entityNodes.get(id);
      if (!node) return;
      const dynamic = recs.get(id)?.mode === 'dynamic';
      const box = worldBounds(id, node, !dynamic);
      if (!box) return;
      handle.position.set((box.min[0] + box.max[0]) / 2, box.max[1] - 0.05, (box.min[2] + box.max[2]) / 2);
    };

    // ---------- Anlegen / Entfernen pro Knoten ----------
    const attachNode = (id: string) => {
      buildBody(id);
      syncParticles(id);
    };
    const detachNode = (id: string) => {
      const wasTrigger = recs.get(id)?.mode === 'trigger';
      destroyBody(id);
      boundsCache.delete(id);
      const handle = emitters.get(id);
      if (handle) {
        disposeEmitter(handle);
        emitters.delete(id);
      }
      if (contacts.delete(id) && wasTrigger) {
        bus.emit('trigger.exit', { entityId: id, avatar: avatarRef() });
      }
    };

    for (const id of entityNodes.keys()) attachNode(id);
    applyGravity();

    unsubs.push(bus.on('entity.node.created', ({ id }) => attachNode(id)));
    unsubs.push(bus.on('entity.node.disposed', ({ id }) => detachNode(id)));
    unsubs.push(
      bus.on('world.loaded', () => {
        applyGravity();
        cancelGrab();
        for (const id of entityNodes.keys()) if (!recs.has(id) && !pending.has(id)) attachNode(id);
      }),
    );
    unsubs.push(
      bus.on('entity.changed', ({ entity, prev }) => {
        const id = entity.id;
        const node = entityNodes.get(id);
        if (!node) return;
        boundsCache.delete(id);
        if (!same(entity.physics, prev.physics)) buildBody(id);
        if (!same(entity.transform, prev.transform)) {
          const rec = recs.get(id);
          if (rec) {
            setNodeTransform(node, entity);
            if (!same(entity.transform.scale, prev.transform.scale)) buildBody(id);
            else teleport(rec);
          }
        }
        if (!same(entity.particles, prev.particles)) syncParticles(id);
      }),
    );
    unsubs.push(
      bus.on('entity.impulse', ({ entityId, impulse }) => {
        const rec = recs.get(entityId);
        if (!rec || !rec.simulating) return;
        const [x, y, z] = clampImpulse(impulse, MAX_IMPULSE);
        rec.body.applyImpulse(new Vector3(x, y, z), rec.body.getObjectCenterWorld());
      }),
    );
    unsubs.push(
      bus.on('mode.changed', ({ mode }) => {
        cancelGrab();
        for (const rec of recs.values()) {
          if (rec.mode !== 'dynamic') continue;
          if (mode === 'build') freeze(rec);
          else {
            const entity = state().entities[rec.id];
            const node = entityNodes.get(rec.id);
            if (entity && node) setNodeTransform(node, entity);
            pulse(rec.body);
            startSimulation(rec);
          }
        }
        if (mode === 'build') endContacts();
      }),
    );

    // ---------- Avatar-Kontakte ----------
    const endContacts = () => {
      for (const id of contacts.clear()) {
        if (recs.get(id)?.mode === 'trigger') bus.emit('trigger.exit', { entityId: id, avatar: avatarRef() });
      }
    };
    const updateAvatarContacts = () => {
      if (!isPlay()) return;
      const feet = ctx.localAvatar.presence.position;
      const hits: string[] = [];
      for (const rec of recs.values()) {
        const node = entityNodes.get(rec.id);
        if (!node) continue;
        const box = worldBounds(rec.id, node, rec.mode !== 'dynamic');
        if (!box) continue;
        if (capsuleOverlapsAabb(feet, inflateAabb(box, 0.05))) hits.push(rec.id);
      }
      const { began, ended } = contacts.update(hits);
      const avatar = avatarRef();
      for (const id of ended) if (recs.get(id)?.mode === 'trigger') bus.emit('trigger.exit', { entityId: id, avatar });
      for (const id of began) {
        bus.emit('entity.touched', { entityId: id, avatar });
        if (recs.get(id)?.mode === 'trigger') bus.emit('trigger.enter', { entityId: id, avatar });
      }
    };

    // ---------- Greifen / Werfen ----------
    const canvasPoint = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width > 0 ? engine.getRenderWidth() / rect.width : 1;
      const sy = rect.height > 0 ? engine.getRenderHeight() / rect.height : 1;
      return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    };
    let pointer = { x: 0, y: 0 };
    let clientPointer = { x: 0, y: 0 };

    const attachCamera = (attach: boolean) => {
      const cam = scene.activeCamera as unknown as {
        attachControl(...args: unknown[]): void;
        detachControl(...args: unknown[]): void;
        inputs?: { attachedToElement?: boolean };
      } | null;
      if (!cam) return;
      try {
        if (attach) cam.attachControl(canvas, true);
        else cam.detachControl();
      } catch (error) {
        console.warn('[physics] Kamera-Steuerung', error);
      }
    };

    function cancelGrab() {
      if (!grab) return;
      const g = grab;
      grab = null;
      if (g.holding && recs.get(g.rec.id) === g.rec) g.rec.body.setGravityFactor(1);
      if (g.cameraWasAttached) attachCamera(true);
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || grab || !isPlay()) return;
      const p = canvasPoint(event.clientX, event.clientY);
      pointer = p;
      clientPointer = { x: event.clientX, y: event.clientY };
      const pick = scene.pick(p.x, p.y);
      const id = entityIdOf(pick?.pickedMesh);
      const rec = id ? recs.get(id) : undefined;
      if (!rec || rec.mode !== 'dynamic' || !rec.simulating || !pick?.pickedPoint) return;
      const feet = ctx.localAvatar.presence.position;
      const hit = pick.pickedPoint;
      if (Math.hypot(hit.x - feet[0], hit.y - (feet[1] + 1), hit.z - feet[2]) > GRAB_RANGE) return;
      const cam = scene.activeCamera as unknown as { inputs?: { attachedToElement?: boolean } } | null;
      const cameraWasAttached = cam?.inputs?.attachedToElement ?? true;
      grab = {
        rec,
        startX: event.clientX,
        startY: event.clientY,
        startT: performance.now(),
        holding: false,
        dist: 3,
        history: [],
        cameraWasAttached,
      };
      if (cameraWasAttached) attachCamera(false);
    };
    const onPointerMove = (event: PointerEvent) => {
      pointer = canvasPoint(event.clientX, event.clientY);
      clientPointer = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!grab || event.button !== 0) return;
      const g = grab;
      const rec = g.rec;
      const alive = recs.get(rec.id) === rec;
      const moved = Math.hypot(event.clientX - g.startX, event.clientY - g.startY);
      if (alive && rec.simulating) {
        if (!g.holding && moved < CLICK_MOVE_PX) {
          const center = rec.body.getObjectCenterWorld();
          const [x, y, z] = pushImpulse(ctx.localAvatar.presence.position, [center.x, center.y, center.z], rec.mass);
          rec.body.applyImpulse(new Vector3(x, y, z), center);
        } else if (g.holding) {
          rec.body.setGravityFactor(1);
          const now = performance.now();
          const recent = g.history.filter((h) => now - h.t < 160);
          let velocity = Vector3.Zero();
          if (recent.length >= 2) {
            const first = recent[0];
            const last = recent[recent.length - 1];
            const dt = (last.t - first.t) / 1000;
            if (dt > 0.01) velocity = last.p.subtract(first.p).scale(1 / dt);
          }
          const driven = rec.body.getLinearVelocity();
          if (driven.length() > velocity.length()) velocity = driven.clone();
          if (velocity.length() > MAX_THROW_SPEED) velocity.scaleInPlace(MAX_THROW_SPEED / velocity.length());
          rec.body.setLinearVelocity(velocity);
        }
      }
      grab = null;
      if (g.cameraWasAttached) attachCamera(true);
    };
    canvas.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    const driveGrab = () => {
      const g = grab;
      if (!g) return;
      const rec = g.rec;
      if (recs.get(rec.id) !== rec || !rec.simulating || !isPlay()) {
        cancelGrab();
        return;
      }
      const now = performance.now();
      if (!g.holding) {
        const moved = Math.hypot(clientPointer.x - g.startX, clientPointer.y - g.startY);
        if (now - g.startT < HOLD_DELAY_MS && moved < CLICK_MOVE_PX) return;
        g.holding = true;
        const cam = scene.activeCamera;
        const center = rec.body.getObjectCenterWorld();
        g.dist = cam ? Math.min(6, Math.max(2, Vector3.Distance(cam.globalPosition, center))) : 3;
        rec.body.setGravityFactor(0);
      }
      const cam = scene.activeCamera;
      if (!cam) return;
      const ray = scene.createPickingRay(pointer.x, pointer.y, Matrix.Identity(), cam);
      const target = ray.origin.add(ray.direction.scale(g.dist));
      if (target.y < 0.3) target.y = 0.3;
      const center = rec.body.getObjectCenterWorld();
      const velocity = target.subtract(center).scale(12);
      if (velocity.length() > 25) velocity.scaleInPlace(25 / velocity.length());
      rec.body.setLinearVelocity(velocity);
      rec.body.setAngularVelocity(rec.body.getAngularVelocity().scale(0.8));
      g.history.push({ t: now, p: target });
      while (g.history.length > 0 && now - g.history[0].t > 300) g.history.shift();
    };

    // ---------- Frame-Schleife ----------
    const frameObserver = scene.onBeforeRenderObservable.add(() => {
      frame += 1;
      applyGravity();
      if (pending.size > 0 && frame % 6 === 0) {
        for (const id of [...pending]) {
          if (!entityNodes.has(id) || !state().entities[id]) pending.delete(id);
          else buildBody(id);
        }
      }
      if (isPlay()) {
        for (const rec of recs.values()) {
          if (!rec.simulating) continue;
          const node = entityNodes.get(rec.id);
          if (node && node.position.y < FALL_RESET_Y) {
            const entity = state().entities[rec.id];
            if (entity) {
              setNodeTransform(node, entity);
              teleport(rec);
            }
          }
        }
      }
      driveGrab();
      updateAvatarContacts();
      for (const [id, handle] of emitters) placeEmitter(id, handle);
    });

    physicsModule._dispose = () => {
      scene.onBeforeRenderObservable.remove(frameObserver);
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      cancelGrab();
      for (const off of unsubs) off();
      for (const id of [...recs.keys()]) destroyBody(id);
      for (const handle of emitters.values()) disposeEmitter(handle);
      emitters.clear();
    };
  },
  dispose() {
    physicsModule._dispose?.();
  },
};

export default physicsModule;
export type { Vec3 };
