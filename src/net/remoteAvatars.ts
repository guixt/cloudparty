/** Entfernte Avatare: Darstellung, Interpolation und Animationszustand. */
import type { AvatarNetState } from '../../shared/avatar';
import type { RemoteAvatarInfo } from '../../shared/protocol';
import type { AvatarFactory, AvatarVisual } from '../core/context';
import { InterpBuffer } from './interpolation';

interface Entry {
  info: RemoteAvatarInfo;
  visual: AvatarVisual;
  buffer: InterpBuffer;
  motion: string;
  emotesKey: string;
}

export class RemoteAvatars {
  private entries = new Map<string, Entry>();

  constructor(
    private getFactory: () => AvatarFactory,
    private now: () => number = () => performance.now(),
  ) {}

  get count(): number {
    return this.entries.size;
  }
  ids(): string[] {
    return [...this.entries.keys()];
  }
  has(id: string): boolean {
    return this.entries.has(id);
  }
  getInfo(id: string): RemoteAvatarInfo | undefined {
    return this.entries.get(id)?.info;
  }
  getVisual(id: string): AvatarVisual | undefined {
    return this.entries.get(id)?.visual;
  }

  add(info: RemoteAvatarInfo): AvatarVisual {
    this.remove(info.id);
    const visual = this.getFactory()(info.appearance);
    const entry: Entry = { info, visual, buffer: new InterpBuffer(), motion: '', emotesKey: '' };
    this.entries.set(info.id, entry);
    this.applyState(info.id, info.state);
    // Erster Stand sofort übernehmen, nicht erst nach der Pufferverzögerung.
    const first = entry.buffer.sample(this.now() + 1e6);
    if (first) this.place(visual, first.x, first.y, first.z, first.yaw);
    return visual;
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    try {
      entry.visual.dispose();
    } catch (error) {
      console.error('[net] Avatar konnte nicht entfernt werden', error);
    }
  }

  clear(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
  }

  applyState(id: string, state: AvatarNetState): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.buffer.push({ t: this.now(), x: state.position[0], y: state.position[1], z: state.position[2], yaw: state.yaw });
    if (state.motion !== entry.motion) {
      entry.motion = state.motion;
      entry.visual.setMotion(state.motion);
    }
    const key = JSON.stringify(state.emotes ?? {});
    if (key !== entry.emotesKey) {
      entry.emotesKey = key;
      entry.visual.setEmotes(state.emotes ?? {});
    }
  }

  /** Pro Frame; dt in Sekunden. */
  update(dt: number): void {
    const now = this.now();
    for (const entry of this.entries.values()) {
      const s = entry.buffer.sample(now);
      if (s) this.place(entry.visual, s.x, s.y, s.z, s.yaw);
      entry.visual.update(dt);
    }
  }

  private place(visual: AvatarVisual, x: number, y: number, z: number, yaw: number): void {
    visual.root.position.set(x, y, z);
    visual.root.rotation.y = yaw;
  }
}
