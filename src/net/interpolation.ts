/** Interpolationspuffer für entfernte Avatare (rein, testbar). */
export interface Snapshot {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const INTERP_DELAY_MS = 120;
export const SNAP_DISTANCE = 8;

/** Interpoliert Winkel auf dem kürzesten Bogen. */
export function lerpAngle(a: number, b: number, k: number): number {
  const twoPi = Math.PI * 2;
  let d = (b - a) % twoPi;
  if (d > Math.PI) d -= twoPi;
  else if (d < -Math.PI) d += twoPi;
  return a + d * k;
}

export class InterpBuffer {
  private snaps: Snapshot[] = [];
  constructor(
    private delay = INTERP_DELAY_MS,
    private snapDistance = SNAP_DISTANCE,
  ) {}

  push(s: Snapshot): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && Math.hypot(s.x - last.x, s.y - last.y, s.z - last.z) > this.snapDistance) this.snaps = [];
    this.snaps.push(s);
    if (this.snaps.length > 30) this.snaps.shift();
  }

  /** Zustand zum Zeitpunkt now - delay; null, solange nichts empfangen wurde. */
  sample(now: number): Snapshot | null {
    const s = this.snaps;
    if (s.length === 0) return null;
    const rt = now - this.delay;
    let i = 0;
    while (i + 1 < s.length && s[i + 1].t <= rt) i++;
    if (i > 0) s.splice(0, i);
    const a = s[0];
    const b = s[1];
    if (!b || rt <= a.t) return { ...a, t: rt };
    const k = Math.min(1, Math.max(0, (rt - a.t) / Math.max(1, b.t - a.t)));
    return {
      t: rt,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      z: a.z + (b.z - a.z) * k,
      yaw: lerpAngle(a.yaw, b.yaw, k),
    };
  }
}
