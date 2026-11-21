/**
 * Reine Logik des Avatar-Pakets (ohne Babylon/DOM): Eingabe, Zustandsmaschine,
 * Sitzplätze, Rate-Gate für 'avatar.moved'. Alles hier ist unit-getestet.
 */
import type { AvatarMotion } from '../../../shared/avatar';
import type { EntitySpec, MovementMode, Quat, RulesSpec, Vec3 } from '../../../shared/types';

// ---------------------------------------------------------------- Eingabe

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  jump: boolean;
  /** Im Flugmodus: nach unten (C / Strg). */
  down: boolean;
}

export const EMPTY_INPUT: InputState = { forward: false, back: false, left: false, right: false, run: false, jump: false, down: false };

/** Tastencode → Eingabefeld. */
export const KEY_BINDINGS: Record<string, keyof InputState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'jump',
  KeyC: 'down',
  ControlLeft: 'down',
  ControlRight: 'down',
};

/** Gedrückt oder zwischen zwei Bildern angetippt. */
export function mergeInput(held: InputState, tapped: InputState): InputState {
  return {
    forward: held.forward || tapped.forward,
    back: held.back || tapped.back,
    left: held.left || tapped.left,
    right: held.right || tapped.right,
    run: held.run || tapped.run,
    jump: held.jump || tapped.jump,
    down: held.down || tapped.down,
  };
}

/** Hat der Spieler eine Bewegungstaste gedrückt (zum Aufstehen / Tanz beenden)? */
export function hasMoveIntent(input: InputState): boolean {
  return input.forward || input.back || input.left || input.right || input.jump;
}

/**
 * Eingabe → Bewegungsrichtung in Weltkoordinaten (x, z), Betrag 0 oder 1.
 * `cameraForward` ist die (beliebig lange) Blickrichtung der Kamera in der XZ-Ebene.
 * Babylon ist linkshändig: rechts = up × forward = (fz, -fx).
 */
export function movementVector(input: InputState, cameraForward: readonly [number, number]): [number, number] {
  let [fx, fz] = cameraForward;
  const len = Math.hypot(fx, fz);
  if (len < 1e-6) return [0, 0];
  fx /= len;
  fz /= len;
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (f === 0 && s === 0) return [0, 0];
  const x = fx * f + fz * s;
  const z = fz * f - fx * s;
  const l = Math.hypot(x, z);
  return l < 1e-6 ? [0, 0] : [x / l, z / l];
}

/** Kürzeste Winkeldifferenz b - a in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Dreht `current` exponentiell glatt Richtung `target` (rate in 1/s). */
export function smoothYaw(current: number, target: number, dt: number, rate = 12): number {
  return current + angleDelta(current, target) * (1 - Math.exp(-rate * dt));
}

/** Blickrichtung (Yaw) einer Bewegungsrichtung; Avatar schaut lokal nach +Z. */
export function yawFromDirection(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** Yaw aus Quaternion [x,y,z,w]: Drehung der lokalen +Z-Achse in der XZ-Ebene. */
export function yawFromQuat(q: Quat): number {
  const [x, y, z, w] = q;
  const fx = 2 * (x * z + w * y);
  const fz = 1 - 2 * (x * x + y * y);
  return Math.atan2(fx, fz);
}

// ---------------------------------------------------------------- Regeln

export interface MovementSettings {
  walkSpeed: number;
  runSpeed: number;
  flySpeed: number;
  gravity: number;
  mode: MovementMode;
  canFly: boolean;
}

export const RUN_FACTOR = 1.8;
export const FLY_FACTOR = 1.6;

export function movementSettings(rules: RulesSpec): MovementSettings {
  const walkSpeed = Number.isFinite(rules.movement.speed) && rules.movement.speed > 0 ? rules.movement.speed : 5;
  const gravity = rules.gravity.enabled ? Math.max(0, rules.gravity.strength ?? 9.81) : 0;
  const flyAbility = rules.abilities.find((a) => a.id === 'fly');
  return {
    walkSpeed,
    runSpeed: walkSpeed * RUN_FACTOR,
    flySpeed: walkSpeed * FLY_FACTOR,
    gravity,
    mode: rules.movement.mode,
    canFly: flyAbility ? flyAbility.enabled : true,
  };
}

/** Sprunghöhe in Metern → Absprunggeschwindigkeit. */
export function jumpVelocity(gravity: number, height = 1.25): number {
  return Math.sqrt(2 * Math.max(gravity, 4) * height);
}

// ---------------------------------------------------------------- Zustandsmaschine

export interface MotionInput {
  sitting: boolean;
  flying: boolean;
  grounded: boolean;
  moving: boolean;
  running: boolean;
}

export function deriveMotion(s: MotionInput): AvatarMotion {
  if (s.sitting) return 'sit';
  if (s.flying) return 'fly';
  if (!s.grounded) return 'jump';
  if (s.moving) return s.running ? 'run' : 'walk';
  return 'idle';
}

/** Entprellt "steht auf dem Boden" (kurze Lücken auf Kanten/Rampen zählen noch als Boden). */
export class GroundTracker {
  private since = 0;
  constructor(private readonly coyote = 0.12) {}
  update(supported: boolean, dt: number): boolean {
    this.since = supported ? 0 : this.since + dt;
    return this.since <= this.coyote;
  }
  reset(): void {
    this.since = 0;
  }
}

/** Fußpunkt-Höhe unter der der Avatar als "von der Insel gefallen" gilt. */
export const FALL_LIMIT_Y = -60;
export function shouldRespawn(y: number): boolean {
  return y < FALL_LIMIT_Y || !Number.isFinite(y);
}

// ---------------------------------------------------------------- avatar.moved-Drossel

export interface MoveSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  motion: AvatarMotion;
  emoteKey: string;
}

export function snapshotChanged(a: MoveSnapshot | null, b: MoveSnapshot): boolean {
  if (!a) return true;
  return (
    Math.abs(a.x - b.x) > 0.005 ||
    Math.abs(a.y - b.y) > 0.005 ||
    Math.abs(a.z - b.z) > 0.005 ||
    Math.abs(angleDelta(a.yaw, b.yaw)) > 0.005 ||
    a.motion !== b.motion ||
    a.emoteKey !== b.emoteKey
  );
}

/**
 * Sendet höchstens alle `intervalMs` und nur, wenn sich etwas geändert hat. Eine
 * ausstehende Änderung wird nachgeholt, sobald das Intervall verstrichen ist
 * (letztes Update beim Stehenbleiben).
 */
export class MovedGate {
  private last: MoveSnapshot | null = null;
  private dirty = false;
  private lastEmit = -Infinity;
  constructor(private readonly intervalMs = 1000 / 12) {}
  step(snapshot: MoveSnapshot, nowMs: number): boolean {
    if (snapshotChanged(this.last, snapshot)) {
      this.last = snapshot;
      this.dirty = true;
    }
    if (this.dirty && nowMs - this.lastEmit >= this.intervalMs) {
      this.dirty = false;
      this.lastEmit = nowMs;
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------- Sitzplätze

/** Sitzhöhe, für die die Sitz-Pose gebaut ist (Becken liegt 0,55 m über dem Fußpunkt). */
export const SEAT_HEIGHT = 0.45;
const BENCH_WIDTH = 1.6;

export function isSeat(entity: EntitySpec): boolean {
  return entity.ref === 'EntitySpec.bench' || entity.ref === 'EntitySpec.chair' || seatCount(entity) > 0;
}

export function seatCount(entity: EntitySpec): number {
  const seats = entity.state?.seats;
  if (typeof seats === 'number' && Number.isFinite(seats) && seats > 0) return Math.min(12, Math.floor(seats));
  if (entity.ref === 'EntitySpec.chair') return 1;
  if (entity.ref === 'EntitySpec.bench') return Math.max(1, Math.round((BENCH_WIDTH * entity.transform.scale[0]) / 0.6));
  return 0;
}

export interface SeatPlacement {
  /** Fußpunkt des sitzenden Avatars (Becken liegt SEAT_HEIGHT darüber). */
  position: Vec3;
  yaw: number;
  slot: number;
  slots: number;
}

function rotateY(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

/**
 * Sitzposition auf einer Entity. Bank/Stuhl haben ihren Ursprung am Boden (Sitzfläche
 * auf SEAT_HEIGHT); sonstige Entities (Würfel …) werden auf ihrer Oberseite besessen.
 * `clickPoint` wählt bei mehreren Plätzen den nächsten.
 */
export function seatPlacement(entity: EntitySpec, clickPoint?: Vec3): SeatPlacement | null {
  const slots = seatCount(entity);
  if (slots <= 0) return null;
  const { pos, rot, scale } = entity.transform;
  const yaw = yawFromQuat(rot);
  const isPrefab = entity.ref === 'EntitySpec.bench' || entity.ref === 'EntitySpec.chair';
  const width = isPrefab ? (entity.ref === 'EntitySpec.bench' ? BENCH_WIDTH : 0.5) * scale[0] : Math.max(0.5, scale[0]);
  const pitch = width / slots;

  let slot = Math.floor((slots - 1) / 2);
  if (clickPoint && slots > 1) {
    // Klickpunkt in lokale X-Koordinate umrechnen (Gegenrotation).
    const [lx] = rotateY(clickPoint[0] - pos[0], clickPoint[2] - pos[2], -yaw);
    slot = Math.min(slots - 1, Math.max(0, Math.round(lx / pitch + (slots - 1) / 2)));
  }
  const offsetX = (slot - (slots - 1) / 2) * pitch;
  const [dx, dz] = rotateY(offsetX, 0, yaw);
  const y = isPrefab ? pos[1] : pos[1] + scale[1] * 0.5 - SEAT_HEIGHT;
  return { position: [pos[0] + dx, y, pos[2] + dz], yaw, slot, slots };
}

/** Wo der Avatar nach dem Aufstehen steht: ein Stück vor dem Sitz, auf Sitzhöhe des Bodens. */
export function standUpPosition(seat: Pick<SeatPlacement, 'position' | 'yaw'>, distance = 0.7): Vec3 {
  return [seat.position[0] + Math.sin(seat.yaw) * distance, seat.position[1] + 0.05, seat.position[2] + Math.cos(seat.yaw) * distance];
}
