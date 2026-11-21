/**
 * Prozedurale Avatar-Darstellung (AvatarFactory): gegliederter Mensch aus Primitiven,
 * ca. 1,75 m, T-Shirt, Hose, Schuhe, Gesicht. Reine Darstellung – keine Eingabe, keine Physik.
 * Austauschbar: eine glTF-Fabrik muss nur dieselbe AvatarVisual-Schnittstelle liefern.
 */
import '@babylonjs/core/Materials/standardMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { AvatarAppearance, AvatarMotion, EmoteState } from '../../../shared/avatar';
import type { AvatarFactory, AvatarVisual, GameContext } from '../../core/context';
import { applyEmote, basePose, clonePose, emoteWeight, JOINTS, stepRate, type JointName, type Pose } from './poses';

export const AVATAR_HEIGHT = 1.75;
const PELVIS_Y = 0.92;

function hex(color: string, fallback: string): Color3 {
  return Color3.FromHexString(/^#[0-9a-f]{6}$/i.test(color) ? color : fallback);
}

interface Palette {
  skin: StandardMaterial;
  hair: StandardMaterial;
  shirt: StandardMaterial;
  pants: StandardMaterial;
  shoe: StandardMaterial;
  sole: StandardMaterial;
  white: StandardMaterial;
  dark: StandardMaterial;
  mouth: StandardMaterial;
}

function material(scene: Scene, name: string, color: Color3, glow = 0.22): StandardMaterial {
  const m = new StandardMaterial(`avatar.${name}`, scene);
  m.diffuseColor = color;
  m.emissiveColor = color.scale(glow);
  m.specularColor = new Color3(0.03, 0.03, 0.03);
  m.specularPower = 24;
  return m;
}

function setColor(m: StandardMaterial, color: Color3, glow = 0.22): void {
  m.diffuseColor = color;
  m.emissiveColor = color.scale(glow);
}

export function createAvatarFactory(ctx: Pick<GameContext, 'scene' | 'shadows'>): AvatarFactory {
  return (appearance) => new ProceduralAvatar(ctx, appearance);
}

class ProceduralAvatar implements AvatarVisual {
  readonly root: TransformNode;
  readonly height = AVATAR_HEIGHT;

  private readonly palette: Palette;
  private readonly meshes: AbstractMesh[] = [];
  private readonly nodes = {} as Record<JointName, TransformNode>;
  private pelvisNode!: TransformNode;
  private motion: AvatarMotion = 'idle';
  private emotes: { channel: string; e: EmoteState; localStart: number }[] = [];
  private emoteSeen = new Map<string, number>();
  private current: Pose;
  private phase = 0;
  private time = Math.random() * 10;
  private clock = 0;
  private speed = 0;
  private lastX = NaN;
  private lastZ = NaN;
  private disposed = false;
  private style: 'normal' | 'neutral' = 'normal';
  private appearance: AvatarAppearance;

  constructor(private readonly ctx: Pick<GameContext, 'scene' | 'shadows'>, appearance: AvatarAppearance) {
    const { scene } = ctx;
    this.appearance = appearance;
    this.root = new TransformNode('avatar', scene);
    this.palette = {
      skin: material(scene, 'skin', hex(appearance.skin, '#e0b089')),
      hair: material(scene, 'hair', hex(appearance.hair, '#3b2a1e'), 0.15),
      shirt: material(scene, 'shirt', hex(appearance.shirt, '#3f8f4f')),
      pants: material(scene, 'pants', hex(appearance.pants, '#2f4468')),
      shoe: material(scene, 'shoe', new Color3(0.16, 0.14, 0.14)),
      sole: material(scene, 'sole', new Color3(0.9, 0.9, 0.88)),
      white: material(scene, 'eyewhite', new Color3(0.97, 0.97, 0.97), 0.5),
      dark: material(scene, 'eye', new Color3(0.08, 0.07, 0.1), 0.3),
      mouth: material(scene, 'mouth', new Color3(0.62, 0.28, 0.27)),
    };
    this.palette.hair.backFaceCulling = false;
    this.build();
    this.current = clonePose(basePose('idle', { phase: 0, time: this.time }));
    this.apply(this.current);
  }

  // ------------------------------------------------------------ Aufbau

  private track<T extends AbstractMesh>(mesh: T, parent: TransformNode, x = 0, y = 0, z = 0, casts = true): T {
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    this.meshes.push(mesh);
    if (casts) this.ctx.shadows.add(mesh);
    return mesh;
  }

  private joint(name: string, parent: TransformNode, x: number, y: number, z: number): TransformNode {
    const n = new TransformNode(`avatar.${name}`, this.ctx.scene);
    n.parent = parent;
    n.position.set(x, y, z);
    return n;
  }

  private sphere(parent: TransformNode, mat: StandardMaterial, d: [number, number, number], p: [number, number, number], seg = 14, casts = true) {
    const m = CreateSphere('avatar.part', { diameter: 1, segments: seg }, this.ctx.scene);
    m.scaling.set(d[0], d[1], d[2]);
    m.material = mat;
    return this.track(m, parent, p[0], p[1], p[2], casts);
  }

  private limb(parent: TransformNode, mat: StandardMaterial, length: number, radius: number, top = 0): AbstractMesh {
    const m = CreateCapsule('avatar.limb', { height: length, radius, tessellation: 14, subdivisions: 3, capSubdivisions: 5 }, this.ctx.scene);
    m.material = mat;
    return this.track(m, parent, 0, top - length / 2, 0);
  }

  private build(): void {
    const { scene } = this.ctx;
    const P = this.palette;

    const pelvis = this.joint('pelvis', this.root, 0, PELVIS_Y, 0);
    this.pelvisNode = pelvis;
    this.nodes.pelvis = pelvis;
    // Hüfte / Hosenbund
    this.sphere(pelvis, P.pants, [0.33, 0.2, 0.25], [0, -0.07, 0]);

    // Rumpf (T-Shirt): nach oben breiter, Tiefe flacher
    const torso = this.joint('torso', pelvis, 0, 0.02, 0);
    this.nodes.torso = torso;
    const body = CreateCylinder('avatar.torso', { height: 0.55, diameterTop: 0.4, diameterBottom: 0.325, tessellation: 24 }, scene);
    body.scaling.z = 0.74;
    body.material = P.shirt;
    this.track(body, torso, 0, 0.205, 0);
    this.sphere(torso, P.shirt, [0.4, 0.12, 0.28], [0, 0.435, 0]); // Schulterlinie

    // Hals und Kopf
    const neck = this.joint('neck', torso, 0, 0.5, 0);
    const neckMesh = CreateCylinder('avatar.neck', { height: 0.14, diameter: 0.088, tessellation: 14 }, scene);
    neckMesh.material = P.skin;
    this.track(neckMesh, neck, 0, 0.05, 0);
    const head = this.joint('head', neck, 0, 0.035, 0);
    this.nodes.head = head;
    this.buildHead(head);

    // Arme: rechts bei +X
    for (const side of [1, -1] as const) {
      const tag = side === 1 ? 'R' : 'L';
      const shoulder = this.joint(`shoulder${tag}`, torso, side * 0.225, 0.425, 0);
      this.nodes[`shoulder${tag}`] = shoulder;
      this.sphere(shoulder, P.shirt, [0.13, 0.13, 0.13], [0, 0, 0]);
      this.limb(shoulder, P.skin, 0.3, 0.04, 0.03);
      const sleeve = CreateCylinder('avatar.sleeve', { height: 0.14, diameterTop: 0.125, diameterBottom: 0.115, tessellation: 16 }, scene);
      sleeve.material = P.shirt;
      this.track(sleeve, shoulder, 0, -0.07, 0);
      const elbow = this.joint(`elbow${tag}`, shoulder, 0, -0.285, 0);
      this.nodes[`elbow${tag}`] = elbow;
      this.sphere(elbow, P.skin, [0.072, 0.072, 0.072], [0, 0, 0], 10, false);
      this.limb(elbow, P.skin, 0.27, 0.036, 0);
      this.sphere(elbow, P.skin, [0.075, 0.1, 0.045], [0, -0.3, 0.004], 12); // Hand
    }

    // Beine
    for (const side of [1, -1] as const) {
      const tag = side === 1 ? 'R' : 'L';
      const hip = this.joint(`hip${tag}`, pelvis, side * 0.092, -0.04, 0);
      this.nodes[`hip${tag}`] = hip;
      this.limb(hip, P.pants, 0.46, 0.078, 0.03);
      const knee = this.joint(`knee${tag}`, hip, 0, -0.43, 0);
      this.nodes[`knee${tag}`] = knee;
      this.sphere(knee, P.pants, [0.105, 0.105, 0.105], [0, 0, 0], 10, false);
      this.limb(knee, P.pants, 0.4, 0.06, 0.02);
      const ankle = this.joint(`ankle${tag}`, knee, 0, -0.36, 0);
      this.nodes[`ankle${tag}`] = ankle;
      const shoe = CreateBox('avatar.shoe', { width: 0.105, height: 0.07, depth: 0.26 }, scene);
      shoe.material = P.shoe;
      this.track(shoe, ankle, 0, -0.035, 0.055);
      this.sphere(ankle, P.shoe, [0.105, 0.075, 0.1], [0, -0.04, 0.165], 10);
      const sole = CreateBox('avatar.sole', { width: 0.108, height: 0.018, depth: 0.3 }, scene);
      sole.material = P.sole;
      this.track(sole, ankle, 0, -0.072, 0.07, false);
    }
  }

  private buildHead(head: TransformNode): void {
    const P = this.palette;
    const cy = 0.125; // Kopfmitte über dem Halsansatz
    const R = { x: 0.108, y: 0.128, z: 0.118 };
    this.sphere(head, P.skin, [R.x * 2, R.y * 2, R.z * 2], [0, cy, 0], 20);
    // Kinn/Wangen leicht betonen
    this.sphere(head, P.skin, [0.15, 0.1, 0.16], [0, cy - 0.065, 0.005], 14, false);
    // Haare: Kappe oben + Hinterkopf
    const cap = CreateSphere('avatar.hair', { diameter: 1, segments: 20, slice: 0.33 }, this.ctx.scene);
    cap.scaling.set(R.x * 2 * 1.07, R.y * 2 * 1.08, R.z * 2 * 1.08);
    cap.material = P.hair;
    this.track(cap, head, 0, cy + 0.006, -0.008);
    this.sphere(head, P.hair, [R.x * 2 * 1.05, R.y * 2 * 0.8, R.z * 2 * 0.86], [0, cy + 0.0, -0.034], 16);
    // Ohren
    for (const s of [1, -1]) this.sphere(head, P.skin, [0.02, 0.05, 0.035], [s * R.x * 0.98, cy - 0.005, -0.005], 8, false);
    // Gesicht: Position auf der Kopfoberfläche berechnen
    const surfaceZ = (x: number, y: number) => R.z * Math.sqrt(Math.max(0.05, 1 - (x / R.x) ** 2 - (y / R.y) ** 2));
    for (const s of [1, -1]) {
      const ex = s * 0.04;
      const ey = 0.015;
      const ez = surfaceZ(ex, ey) - 0.006;
      this.sphere(head, P.white, [0.034, 0.026, 0.014], [ex, cy + ey, ez], 10, false);
      this.sphere(head, P.dark, [0.017, 0.017, 0.01], [ex, cy + ey, ez + 0.005], 8, false);
      const brow = CreateBox('avatar.brow', { width: 0.05, height: 0.009, depth: 0.012 }, this.ctx.scene);
      brow.material = P.hair;
      this.track(brow, head, ex, cy + 0.052, surfaceZ(ex, 0.052) - 0.002, false);
      brow.rotation.z = s * -0.12;
    }
    this.sphere(head, P.skin, [0.026, 0.04, 0.036], [0, cy - 0.015, surfaceZ(0, -0.015) + 0.004], 10, false); // Nase
    const mouth = CreateBox('avatar.mouth', { width: 0.04, height: 0.007, depth: 0.008 }, this.ctx.scene);
    mouth.material = P.mouth;
    this.track(mouth, head, 0, cy - 0.052, surfaceZ(0, -0.052) - 0.001, false);
  }

  // ------------------------------------------------------------ AvatarVisual

  setMotion(motion: AvatarMotion): void {
    this.motion = motion;
  }

  setEmotes(emotes: Record<string, EmoteState>): void {
    const next: { channel: string; e: EmoteState; localStart: number }[] = [];
    const seen = new Map<string, number>();
    for (const [channel, e] of Object.entries(emotes)) {
      const key = `${channel}:${e.name}:${e.startedAt}`;
      // Lokale Startzeit merken: unabhängig von Uhrenabweichung zwischen Clients.
      const localStart = this.emoteSeen.get(key) ?? this.clock;
      seen.set(key, localStart);
      next.push({ channel, e, localStart });
    }
    this.emotes = next;
    this.emoteSeen = seen;
  }

  setAppearance(a: AvatarAppearance): void {
    this.appearance = a;
    this.refreshColors();
  }

  /** normal = bunte Figur; neutral = einfarbige helle Maßstabsfigur ohne Gesicht (wirkt in Entwürfen ruhiger). */
  setStyle(style: 'normal' | 'neutral'): void {
    if (this.style === style) return;
    this.style = style;
    this.refreshColors();
  }

  private refreshColors(): void {
    const a = this.appearance;
    const P = this.palette;
    if (this.style === 'neutral') {
      const body = Color3.FromHexString('#d3d7de');
      const dark = Color3.FromHexString('#b4bac4');
      setColor(P.skin, body);
      setColor(P.hair, body, 0.15);
      setColor(P.shirt, body);
      setColor(P.pants, dark);
      setColor(P.shoe, dark);
      setColor(P.sole, dark);
      setColor(P.white, body, 0.22);
      setColor(P.dark, body, 0.22);
      setColor(P.mouth, body, 0.22);
      return;
    }
    setColor(P.skin, hex(a.skin, '#e0b089'));
    setColor(P.hair, hex(a.hair, '#3b2a1e'), 0.15);
    setColor(P.shirt, hex(a.shirt, '#3f8f4f'));
    setColor(P.pants, hex(a.pants, '#2f4468'));
    setColor(P.shoe, new Color3(0.16, 0.14, 0.14));
    setColor(P.sole, new Color3(0.9, 0.9, 0.88));
    setColor(P.white, new Color3(0.97, 0.97, 0.97), 0.5);
    setColor(P.dark, new Color3(0.08, 0.07, 0.1), 0.3);
    setColor(P.mouth, new Color3(0.62, 0.28, 0.27));
  }

  update(dt: number): void {
    if (this.disposed) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.clock += dt;
    this.time += dt;

    // Geschwindigkeit aus der Positionsänderung schätzen (funktioniert auch für Netz-Avatare).
    const p = this.root.position;
    if (dt > 0) {
      if (!Number.isNaN(this.lastX)) {
        const v = Math.hypot(p.x - this.lastX, p.z - this.lastZ) / dt;
        this.speed += (Math.min(v, 30) - this.speed) * Math.min(1, dt * 8);
      }
      this.lastX = p.x;
      this.lastZ = p.z;
    }
    if (this.motion === 'walk' || this.motion === 'run') {
      this.phase += dt * Math.PI * 2 * stepRate(this.motion, this.speed);
      if (this.phase > Math.PI * 200) this.phase -= Math.PI * 200;
    } else {
      // Phase sanft zum nächsten Nulldurchgang, damit Start/Stopp nicht springt.
      this.phase *= Math.exp(-dt * 6);
    }

    const target = basePose(this.motion, { phase: this.phase, time: this.time });
    const sitting = this.motion === 'sit';
    // Ganzkörper-Gesten zuerst, danach Teilgesten.
    const order = [...this.emotes].sort((a, b) => Number(b.channel === 'fullBody') - Number(a.channel === 'fullBody'));
    for (const { e, localStart } of order) {
      const elapsed = this.clock - localStart;
      const duration = e.durationMs !== undefined && !e.loop ? e.durationMs / 1000 : undefined;
      if (duration !== undefined && elapsed > duration) continue;
      applyEmote(target, e.name, elapsed, emoteWeight(elapsed, duration) * (e.intensity ?? 1), sitting);
    }

    // Glättung der Gelenke (Überblendung zwischen Zuständen)
    const k = 1 - Math.exp(-dt * 16);
    const cur = this.current;
    cur.offsetY += (target.offsetY - cur.offsetY) * k;
    for (const j of JOINTS) {
      const c = cur.joints[j];
      const t = target.joints[j];
      c[0] += (t[0] - c[0]) * k;
      c[1] += (t[1] - c[1]) * k;
      c[2] += (t[2] - c[2]) * k;
    }
    this.apply(cur);
  }

  private apply(pose: Pose): void {
    for (const j of JOINTS) {
      const r = pose.joints[j];
      this.nodes[j].rotation.set(r[0], r[1], r[2]);
    }
    this.pelvisNode.position.y = PELVIS_Y + pose.offsetY;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.dispose(false, true);
    for (const m of Object.values(this.palette)) m.dispose();
  }
}
