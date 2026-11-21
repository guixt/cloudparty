/**
 * Prozedurale Posen: Gelenkwinkel (Euler, Radiant) pro Bewegungsart und Geste.
 * Reine Funktionen, unabhängig von Babylon. Konvention (Babylon, linkshändig, Avatar
 * schaut nach +Z, rechte Körperseite bei +X):
 *  - Rotation um X: positiv neigt den Rumpf/Kopf nach vorn, schwingt hängende Glieder nach hinten.
 *    Hüfte/Schulter nach vorn = negativ; Knie beugt positiv, Ellbogen beugt negativ.
 *  - Rotation um Z: positiv schwingt ein hängendes Glied nach +X (rechter Arm: nach außen/oben).
 */
import type { AvatarMotion } from '../../../shared/avatar';

export type V3 = [number, number, number];
export const JOINTS = [
  'pelvis',
  'torso',
  'head',
  'shoulderL',
  'shoulderR',
  'elbowL',
  'elbowR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
  'ankleL',
  'ankleR',
] as const;
export type JointName = (typeof JOINTS)[number];

export interface Pose {
  /** Höhenversatz des Beckens gegenüber dem Stand (Meter). */
  offsetY: number;
  joints: Record<JointName, V3>;
}

export const LEG_LENGTH = 0.88;

export function neutralPose(): Pose {
  const joints = {} as Record<JointName, V3>;
  for (const j of JOINTS) joints[j] = [0, 0, 0];
  return { offsetY: 0, joints };
}

export function clonePose(p: Pose): Pose {
  const joints = {} as Record<JointName, V3>;
  for (const j of JOINTS) joints[j] = [...p.joints[j]] as V3;
  return { offsetY: p.offsetY, joints };
}

function set(p: Pose, j: JointName, x: number, y = 0, z = 0): void {
  p.joints[j] = [x, y, z];
}

/** Absenkung des Beckens, wenn die Beine um `a` gespreizt sind. */
function stanceDrop(a: number): number {
  return LEG_LENGTH * (1 - Math.cos(a));
}

export interface PoseContext {
  /** Laufphase (Radiant, wächst mit der Schrittfrequenz). */
  phase: number;
  /** Allgemeine Zeit in Sekunden (Atmen, Schweben). */
  time: number;
}

/** Grundpose für eine Bewegungsart. */
export function basePose(motion: AvatarMotion, c: PoseContext): Pose {
  const p = neutralPose();
  const breathe = Math.sin(c.time * 1.7);
  const t = c.time;
  switch (motion) {
    case 'idle': {
      p.joints.torso = [0.02 + 0.012 * breathe, 0.03 * Math.sin(t * 0.35), 0];
      p.joints.head = [-0.02 - 0.01 * breathe, 0.1 * Math.sin(t * 0.3), 0.015 * Math.sin(t * 0.45)];
      set(p, 'shoulderR', 0.03, 0, 0.1 + 0.012 * breathe);
      set(p, 'shoulderL', 0.03, 0, -0.1 - 0.012 * breathe);
      set(p, 'elbowR', -0.14);
      set(p, 'elbowL', -0.14);
      set(p, 'hipR', 0, 0, 0.035);
      set(p, 'hipL', 0, 0, -0.035);
      p.joints.pelvis = [0, 0, 0.012 * Math.sin(t * 0.5)];
      p.offsetY = -0.004 * breathe;
      break;
    }
    case 'walk':
    case 'run': {
      const run = motion === 'run';
      const a = run ? 0.82 : 0.5; // Beinschwung
      const arm = run ? 0.95 : 0.55;
      const s = Math.sin(c.phase);
      const sL = Math.sin(c.phase + Math.PI);
      const swingKnee = (phase: number) => (run ? 0.35 + 1.25 : 0.12 + 0.75) * Math.max(0, Math.cos(phase)) + (run ? 0.3 : 0.05);
      set(p, 'hipR', -a * s, 0, 0.03);
      set(p, 'hipL', -a * sL, 0, -0.03);
      set(p, 'kneeR', swingKnee(c.phase));
      set(p, 'kneeL', swingKnee(c.phase + Math.PI));
      set(p, 'ankleR', -0.35 * Math.max(0, s) + 0.12 * Math.max(0, -s));
      set(p, 'ankleL', -0.35 * Math.max(0, sL) + 0.12 * Math.max(0, -sL));
      set(p, 'shoulderR', arm * s, 0, 0.07);
      set(p, 'shoulderL', arm * sL, 0, -0.07);
      const elbow = (v: number) => -(run ? 1.25 : 0.28) - (run ? 0.2 : 0.3) * Math.max(0, -v);
      set(p, 'elbowR', elbow(s));
      set(p, 'elbowL', elbow(sL));
      p.joints.pelvis = [run ? 0.16 : 0.05, (run ? 0.14 : 0.09) * s, (run ? 0.04 : 0.025) * Math.cos(c.phase)];
      p.joints.torso = [run ? 0.1 : 0.02, -(run ? 0.22 : 0.13) * s, 0];
      p.joints.head = [run ? -0.16 : -0.04, (run ? 0.1 : 0.05) * s, 0];
      p.offsetY = -stanceDrop(a) * Math.pow(Math.sin(c.phase), 2) * (run ? 0.85 : 1) + (run ? 0.04 * Math.abs(Math.cos(c.phase)) : 0);
      break;
    }
    case 'jump': {
      set(p, 'hipR', -0.75, 0, 0.1);
      set(p, 'hipL', -0.2, 0, -0.1);
      set(p, 'kneeR', 1.05);
      set(p, 'kneeL', 0.5);
      set(p, 'ankleR', 0.1);
      set(p, 'ankleL', -0.3);
      set(p, 'shoulderR', -0.25, 0, 1.15);
      set(p, 'shoulderL', -0.25, 0, -1.15);
      set(p, 'elbowR', -0.35);
      set(p, 'elbowL', -0.35);
      p.joints.torso = [-0.05, 0, 0];
      p.joints.head = [-0.1, 0, 0];
      break;
    }
    case 'fly': {
      const f = Math.sin(t * 2.2);
      p.joints.pelvis = [1.0, 0, 0.03 * Math.sin(t * 1.1)];
      p.joints.torso = [0.05, 0, 0];
      p.joints.head = [-0.95, 0, 0]; // Blick geradeaus statt zum Boden
      set(p, 'shoulderR', 0.45, 0, 0.55 + 0.05 * f);
      set(p, 'shoulderL', 0.45, 0, -0.55 - 0.05 * f);
      set(p, 'elbowR', -0.2);
      set(p, 'elbowL', -0.2);
      set(p, 'hipR', 0.12 + 0.06 * f, 0, 0.08);
      set(p, 'hipL', 0.12 - 0.06 * f, 0, -0.08);
      set(p, 'kneeR', 0.25 + 0.1 * f);
      set(p, 'kneeL', 0.25 - 0.1 * f);
      set(p, 'ankleR', -0.5);
      set(p, 'ankleL', -0.5);
      p.offsetY = 0.04 * Math.sin(t * 1.4);
      break;
    }
    case 'sit': {
      set(p, 'hipR', -1.5, 0, 0.06);
      set(p, 'hipL', -1.5, 0, -0.06);
      set(p, 'kneeR', 1.5);
      set(p, 'kneeL', 1.5);
      p.joints.torso = [0.04 + 0.012 * breathe, 0, 0];
      p.joints.head = [-0.04, 0.1 * Math.sin(t * 0.3), 0];
      set(p, 'shoulderR', -0.35, 0, 0.1);
      set(p, 'shoulderL', -0.35, 0, -0.1);
      set(p, 'elbowR', -1.05);
      set(p, 'elbowL', -1.05);
      p.offsetY = -(0.92 - (0.45 + 0.1)) + 0.0;
      break;
    }
  }
  return p;
}

// ---------------------------------------------------------------- Gesten

function mixV(a: V3, b: V3, w: number): V3 {
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
}

function blend(p: Pose, joint: JointName, target: V3, w: number): void {
  p.joints[joint] = mixV(p.joints[joint], target, w);
}

/** Einblend-/Ausblendgewicht einer Geste (0..1). */
export function emoteWeight(elapsedS: number, durationS: number | undefined): number {
  const fadeIn = Math.min(1, Math.max(0, elapsedS / 0.25));
  if (durationS === undefined) return fadeIn;
  const fadeOut = Math.min(1, Math.max(0, (durationS - elapsedS) / 0.3));
  return Math.min(fadeIn, fadeOut);
}

/**
 * Überlagert eine Geste auf die Pose. `t` = Sekunden seit Start, `w` = Gewicht 0..1.
 * Unbekannte Gesten werden ignoriert.
 */
export function applyEmote(p: Pose, name: string, t: number, w: number, sitting = false): void {
  if (w <= 0) return;
  switch (name) {
    case 'wave': {
      blend(p, 'shoulderR', [0, 0, 2.55], w);
      blend(p, 'elbowR', [-0.25, 0, 0.55 * Math.sin(t * 10)], w);
      blend(p, 'head', [p.joints.head[0], 0.15, 0.1], w * 0.6);
      break;
    }
    case 'raise-hand': {
      blend(p, 'shoulderR', [0.05, 0, 3.0 + 0.04 * Math.sin(t * 2)], w);
      blend(p, 'elbowR', [-0.05, 0, 0], w);
      blend(p, 'head', [-0.08, 0, 0.05], w * 0.6);
      break;
    }
    case 'agree': {
      const nod = 0.26 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * 2.1));
      blend(p, 'head', [p.joints.head[0] + nod * 1.6, 0, 0], w);
      blend(p, 'torso', [p.joints.torso[0] + nod * 0.25, 0, 0], w);
      break;
    }
    case 'dance': {
      if (sitting) break;
      const f = 1.8;
      const s = Math.sin(t * Math.PI * 2 * f);
      const c = Math.cos(t * Math.PI * 2 * f);
      const d = emoteDanceTargets(s, c, t);
      for (const j of JOINTS) blend(p, j, d.joints[j], w);
      p.offsetY += (d.offsetY - p.offsetY) * w;
      break;
    }
    default:
      break;
  }
}

function emoteDanceTargets(s: number, c: number, t: number): Pose {
  const d = neutralPose();
  const lift = (v: number) => Math.max(0, v);
  d.joints.pelvis = [0.04, 0.32 * s, 0.14 * c];
  d.joints.torso = [0.05, -0.3 * s, -0.1 * c];
  d.joints.head = [-0.06 + 0.1 * Math.abs(c), 0.15 * s, 0.1 * c];
  set(d, 'shoulderR', -0.2, 0, 1.7 + 0.65 * s);
  set(d, 'shoulderL', -0.2, 0, -(1.7 - 0.65 * s));
  set(d, 'elbowR', -0.7 - 0.3 * c);
  set(d, 'elbowL', -0.7 + 0.3 * c);
  set(d, 'hipR', -0.55 * lift(s), 0, 0.12);
  set(d, 'hipL', -0.55 * lift(-s), 0, -0.12);
  set(d, 'kneeR', 0.2 + 1.0 * lift(s));
  set(d, 'kneeL', 0.2 + 1.0 * lift(-s));
  set(d, 'ankleR', 0.05 * Math.sin(t));
  d.offsetY = -0.08 + 0.07 * Math.abs(s) - 0.03 * Math.abs(c);
  return d;
}

/** Schrittfrequenz (Zyklen/s) aus der Geschwindigkeit; mit Obergrenzen, damit es nicht flimmert. */
export function stepRate(motion: AvatarMotion, speed: number): number {
  if (motion === 'run') return Math.min(3.1, Math.max(1.6, speed / 3.4 || 2.4));
  return Math.min(2.2, Math.max(0.9, speed / 2.4 || 1.6));
}
