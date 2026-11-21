/**
 * Reine Hilfsfunktionen der Physik (ohne Babylon), damit sie testbar bleiben.
 */
import type { PhysicsMode, Vec3 } from '../../../shared/types';

export type ShapeKind = 'box' | 'sphere' | 'cylinder' | 'convex' | 'mesh';

/**
 * Wählt die Kollisionsform nach Prefab-Verweis und Modus.
 * Grundformen bekommen eine passende Primitive; alles andere eine konvexe Hülle
 * (dynamisch) bzw. ein Netz (statisch). Trigger und Medien-Tafeln nutzen eine Box.
 */
export function shapeKindForRef(ref: string, mode: PhysicsMode): ShapeKind {
  if (mode === 'trigger') return 'box';
  switch (ref) {
    case 'EntitySpec.box':
    case 'EntitySpec.plane':
    case 'EntitySpec.avatar-spawn':
    case 'EntitySpec.light':
    case 'EntitySpec.media-image':
    case 'EntitySpec.media-web':
    case 'EntitySpec.media-video':
    case 'EntitySpec.media-slides':
    case 'EntitySpec.media-text':
      return 'box';
    case 'EntitySpec.sphere':
      return 'sphere';
    case 'EntitySpec.cylinder':
      return 'cylinder';
    case 'EntitySpec.freeform':
      // Gekrümmte Flächen: statisch exakt (Mesh-Collider), dynamisch konvexe Hülle.
      return mode === 'dynamic' ? 'convex' : 'mesh';
    default:
      return mode === 'dynamic' ? 'convex' : 'mesh';
  }
}

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export function inflateAabb(box: Aabb, amount: number): Aabb {
  return {
    min: [box.min[0] - amount, box.min[1] - amount, box.min[2] - amount],
    max: [box.max[0] + amount, box.max[1] + amount, box.max[2] + amount],
  };
}

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return (
    a.min[0] <= b.max[0] && a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] && a.max[2] >= b.min[2]
  );
}

export const AVATAR_RADIUS = 0.35;
export const AVATAR_HEIGHT = 1.75;

/** Überschneidet die senkrechte Kapsel des Avatars (Fußpunkt `feet`) die Box? */
export function capsuleOverlapsAabb(
  feet: Vec3,
  box: Aabb,
  radius = AVATAR_RADIUS,
  height = AVATAR_HEIGHT,
): boolean {
  const segLow = feet[1] + radius;
  const segHigh = feet[1] + Math.max(radius, height - radius);
  const gapY = Math.max(box.min[1] - segHigh, segLow - box.max[1], 0);
  const dx = Math.max(box.min[0] - feet[0], feet[0] - box.max[0], 0);
  const dz = Math.max(box.min[2] - feet[2], feet[2] - box.max[2], 0);
  return dx * dx + dz * dz + gapY * gapY <= radius * radius;
}

/** Verfolgt Kontakte: meldet, welche Schlüssel neu hinzukamen und welche weg sind. */
export class ContactTracker<K = string> {
  private current = new Set<K>();

  update(next: Iterable<K>): { began: K[]; ended: K[] } {
    const nextSet = new Set(next);
    const began: K[] = [];
    const ended: K[] = [];
    for (const key of nextSet) if (!this.current.has(key)) began.push(key);
    for (const key of this.current) if (!nextSet.has(key)) ended.push(key);
    this.current = nextSet;
    return { began, ended };
  }

  delete(key: K): boolean {
    return this.current.delete(key);
  }

  has(key: K): boolean {
    return this.current.has(key);
  }

  clear(): K[] {
    const all = [...this.current];
    this.current.clear();
    return all;
  }
}

/** Schlüssel eines ungeordneten Paares. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Drosselt Ereignisse pro Schlüssel auf ein Mindestintervall (Millisekunden). */
export class Throttle {
  private last = new Map<string, number>();
  constructor(private readonly intervalMs: number) {}

  allow(key: string, now: number): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < this.intervalMs) return false;
    this.last.set(key, now);
    if (this.last.size > 512) this.prune(now);
    return true;
  }

  private prune(now: number) {
    for (const [key, time] of this.last) if (now - time > this.intervalMs * 4) this.last.delete(key);
  }

  clear() {
    this.last.clear();
  }
}

/** Begrenzt die Länge eines Stoßes (Schutz vor Skripten, die Objekte ins All schießen). */
export function clampImpulse(impulse: Vec3, maxLength: number): Vec3 {
  const length = Math.hypot(impulse[0], impulse[1], impulse[2]);
  if (!Number.isFinite(length)) return [0, 0, 0];
  if (length <= maxLength || length === 0) return [impulse[0], impulse[1], impulse[2]];
  const k = maxLength / length;
  return [impulse[0] * k, impulse[1] * k, impulse[2] * k];
}

/** Kleiner Schubs eines angeklickten Objekts, vom Avatar weg (waagerecht + etwas nach oben). */
export function pushImpulse(avatarPos: Vec3, objectPos: Vec3, mass: number, strength = 2.5): Vec3 {
  let dx = objectPos[0] - avatarPos[0];
  let dz = objectPos[2] - avatarPos[2];
  const length = Math.hypot(dx, dz);
  if (length < 1e-4) {
    dx = 0;
    dz = 1;
  } else {
    dx /= length;
    dz /= length;
  }
  const m = Math.max(0.1, mass);
  return [dx * strength * m, 0.35 * strength * m, dz * strength * m];
}

export function gravityFor(rules: { gravity: { enabled: boolean; strength?: number } }): number {
  const g = rules.gravity;
  if (!g.enabled) return 0;
  const strength = g.strength ?? 9.81;
  return Number.isFinite(strength) ? Math.max(0, strength) : 9.81;
}

export interface PhysicsDefaults {
  mass: number;
  friction: number;
  restitution: number;
}
export function resolvePhysics(spec: { mass?: number; friction?: number; restitution?: number } | undefined): PhysicsDefaults {
  const clampNum = (value: number | undefined, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    mass: clampNum(spec?.mass, 1, 0.001, 100000),
    friction: clampNum(spec?.friction, 0.6, 0, 10),
    restitution: clampNum(spec?.restitution, 0.2, 0, 1.5),
  };
}
