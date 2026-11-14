/**
 * Charakterbewegung mit Havok (PhysicsCharacterController): Laufen, Springen, Fliegen, Sitzen.
 * Besitzt Position/Yaw/Bewegungsart des lokalen Avatars; Darstellung und Kamera liegen woanders.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CharacterSupportedState, PhysicsCharacterController } from '@babylonjs/core/Physics/v2/characterController';
import type { AvatarMotion } from '../../../shared/avatar';
import type { Vec3 } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import {
  deriveMotion,
  GroundTracker,
  hasMoveIntent,
  jumpVelocity,
  movementSettings,
  movementVector,
  shouldRespawn,
  smoothYaw,
  standUpPosition,
  yawFromDirection,
  type InputState,
  type SeatPlacement,
} from './logic';

export const CAPSULE_HEIGHT = 1.7;
export const CAPSULE_RADIUS = 0.3;
const HALF = CAPSULE_HEIGHT / 2;

export interface ControllerFrame {
  /** Eingabe ist aktiv (Spielmodus, canMove)? */
  enabled: boolean;
  input: InputState;
  cameraForward: readonly [number, number];
}

export interface ControllerEvents {
  fell(): void;
  stoodUp(): void;
}

export class AvatarController {
  private readonly cc: PhysicsCharacterController;
  readonly feet: Vec3 = [0, 0, 0];
  yaw = 0;
  motion: AvatarMotion = 'idle';
  flying = false;
  seat: (SeatPlacement & { entityId: string }) | null = null;

  private readonly ground = new GroundTracker();
  private readonly tmpDesired = new Vector3();
  private readonly tmpOut = new Vector3();
  private readonly tmpForward = new Vector3();
  private readonly down = new Vector3(0, -1, 0);
  private readonly up = new Vector3(0, 1, 0);
  private flyVelocity = new Vector3();
  private jumpCooldown = 0;
  /** Eigene Fallgeschwindigkeit in der Luft (der Controller verwirft sonst Aufwärtsimpulse). */
  private vy = 0;
  private wasSupported = true;
  private fallCheckFrames = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly events: ControllerEvents,
  ) {
    this.cc = new PhysicsCharacterController(new Vector3(0, HALF + 0.1, 0), { capsuleHeight: CAPSULE_HEIGHT, capsuleRadius: CAPSULE_RADIUS }, ctx.scene);
    this.cc.maxSlopeCosine = Math.cos((55 * Math.PI) / 180);
    this.cc.maxStepHeight = 0.35;
    this.cc.characterMass = 80;
    this.cc.characterStrength = 90;
  }

  /** Kapselmitte über dem Fußpunkt: halbe Höhe plus der Schwebeabstand des Controllers (keepDistance). */
  private get centerOffset(): number {
    return HALF + this.cc.keepDistance;
  }

  get speedSettings() {
    return movementSettings(this.ctx.store.getState().world.rules);
  }

  /** Setzt den Fußpunkt (Teleport/Spawn); beendet Sitzen und Geschwindigkeit. */
  place(pos: Vec3, yaw?: number): void {
    this.seat = null;
    this.cc.setPosition(new Vector3(pos[0], pos[1] + this.centerOffset, pos[2]));
    this.cc.setVelocity(Vector3.Zero());
    this.flyVelocity.setAll(0);
    this.ground.reset();
    this.feet[0] = pos[0];
    this.feet[1] = pos[1];
    this.feet[2] = pos[2];
    if (yaw !== undefined) this.yaw = yaw;
    this.motion = 'idle';
  }

  sitDown(seat: SeatPlacement & { entityId: string }): void {
    this.seat = seat;
    this.flying = false;
    this.cc.setVelocity(Vector3.Zero());
    this.flyVelocity.setAll(0);
    this.feet[0] = seat.position[0];
    this.feet[1] = seat.position[1];
    this.feet[2] = seat.position[2];
    this.yaw = seat.yaw;
    this.motion = 'sit';
  }

  standUp(): void {
    const seat = this.seat;
    if (!seat) return;
    this.place(standUpPosition(seat), this.yaw);
    this.events.stoodUp();
  }

  setFlying(on: boolean): boolean {
    const rules = this.speedSettings;
    if (on && !rules.canFly) return false;
    if (this.seat) this.standUp();
    this.flying = on;
    this.flyVelocity.copyFrom(this.cc.getVelocity());
    return true;
  }

  /** Sollen Sprung/Fliegen gerade wie Schweben behandelt werden (keine Schwerkraft)? */
  private get weightless(): boolean {
    return this.flying || this.speedSettings.gravity <= 0;
  }

  update(dt: number, frame: ControllerFrame): void {
    dt = Math.min(Math.max(dt, 1 / 240), 0.05);
    const settings = this.speedSettings;
    const { input } = frame;
    const intent = frame.enabled && hasMoveIntent(input);

    if (this.seat) {
      if (intent) this.standUp();
      else {
        this.motion = 'sit';
        return;
      }
    }

    const [dx, dz] = frame.enabled ? movementVector(input, frame.cameraForward) : [0, 0];
    const moving = dx !== 0 || dz !== 0;
    const flyMode = this.weightless;
    const gravityVec = new Vector3(0, -settings.gravity, 0);

    const support = this.cc.checkSupport(dt, this.down);
    // Beim Aufsteigen nach einem Sprung gilt der Avatar nicht mehr als gestützt.
    const supported = support.supportedState === CharacterSupportedState.SUPPORTED && !(this.vy > 0 && !this.weightless);
    const grounded = this.ground.update(supported, dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);

    if (moving) {
      const target = yawFromDirection(dx, dz);
      this.yaw = smoothYaw(this.yaw, target, dt, 13);
    }

    const running = input.run && !flyMode;
    const speed = flyMode ? settings.flySpeed * (input.run ? 1.6 : 1) : running ? settings.runSpeed : settings.walkSpeed;

    if (settings.mode === 'noclip') {
      // Ohne Kollision: Position direkt verschieben.
      const vy = (frame.enabled ? (input.jump ? 1 : 0) - (input.down ? 1 : 0) : 0) * speed * 0.8;
      const p = this.cc.getPosition();
      this.cc.setPosition(new Vector3(p.x + dx * speed * dt, p.y + vy * dt, p.z + dz * speed * dt));
      this.cc.setVelocity(Vector3.Zero());
    } else if (flyMode) {
      const vy = frame.enabled ? ((input.jump ? 1 : 0) - (input.down ? 1 : 0)) * settings.flySpeed * 0.7 : 0;
      this.tmpDesired.set(dx * speed, vy, dz * speed);
      const k = 1 - Math.exp(-dt * 7);
      this.flyVelocity.x += (this.tmpDesired.x - this.flyVelocity.x) * k;
      this.flyVelocity.y += (this.tmpDesired.y - this.flyVelocity.y) * k;
      this.flyVelocity.z += (this.tmpDesired.z - this.flyVelocity.z) * k;
      this.cc.setVelocity(this.flyVelocity);
      this.cc.integrate(dt, support, Vector3.Zero());
      // Mit gedrückter Abwärtstaste auf dem Boden landen und Flug beenden.
      if (this.flying && supported && input.down && frame.enabled) this.flying = false;
    } else {
      this.tmpDesired.set(dx * speed, 0, dz * speed);
      this.tmpForward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const current = this.cc.getVelocity();
      if (supported) {
        this.vy = 0;
        this.cc.calculateMovementToRef(dt, this.tmpForward, support.averageSurfaceNormal, current, support.averageSurfaceVelocity, this.tmpDesired, this.up, this.tmpOut);
        // Auf die Oberfläche projizieren (Rampen).
        this.tmpOut.subtractInPlace(support.averageSurfaceVelocity);
        if (this.tmpOut.dot(this.up) > 1e-3) {
          const len = this.tmpOut.length();
          this.tmpOut.scaleInPlace(1 / len);
          const horiz = len / support.averageSurfaceNormal.dot(this.up);
          const c = support.averageSurfaceNormal.cross(this.tmpOut);
          const projected = c.cross(this.up);
          projected.scaleInPlace(horiz);
          this.tmpOut.copyFrom(projected);
        }
        this.tmpOut.addInPlace(support.averageSurfaceVelocity);
        if (frame.enabled && input.jump && this.jumpCooldown <= 0) {
          const u = jumpVelocity(settings.gravity);
          this.vy = u;
          this.tmpOut.y = u;
          this.jumpCooldown = 0.25;
          this.ground.reset();
        }
      } else {
        this.cc.calculateMovementToRef(dt, this.tmpForward, this.up, current, Vector3.Zero(), this.tmpDesired, this.up, this.tmpOut);
        // Vertikal bleibt die bisherige Geschwindigkeit plus Schwerkraft.
        if (this.wasSupported) this.vy = Math.min(current.y, 0);
        this.vy = Math.max(-80, this.vy + gravityVec.y * dt);
        this.tmpOut.y = this.vy;
      }
      this.cc.setVelocity(this.tmpOut);
      this.cc.integrate(dt, support, gravityVec);
      this.wasSupported = supported && this.vy <= 0;
    }

    const p = this.cc.getPosition();
    this.feet[0] = p.x;
    this.feet[1] = p.y - this.centerOffset;
    this.feet[2] = p.z;

    const airborne = !grounded && !flyMode;
    this.motion = deriveMotion({
      sitting: false,
      flying: flyMode && !supported,
      grounded: flyMode || !airborne,
      moving,
      running: running && moving,
    });

    // Nach Fall unter die Insel: Rückmeldung (der Aufrufer setzt zurück).
    if (shouldRespawn(this.feet[1])) {
      this.fallCheckFrames += 1;
      if (this.fallCheckFrames > 2) {
        this.fallCheckFrames = 0;
        this.events.fell();
      }
    } else this.fallCheckFrames = 0;
  }

  dispose(): void {
    this.cc.dispose();
  }
}
