/**
 * Paket 22 (Materialien): Baustein `EntitySpec.mirror` (Rahmen + Spiegelfläche) und Echtzeit-Spiegel
 * (`material.mirror`) für beliebige Entities. Material-Abbildung: src/world/entities/materials.ts.
 */
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { GameModule } from '../../core/context';
import { createFixedMaterial, createMainMaterial } from '../entities/materials';
import { registerPrefab } from '../entities/prefabs';
import { place, slab } from '../entities/parts';
import { dropFallbackWhereUnneeded } from '../entities/fallbackEnv';
import { createMirrorManager } from './mirrors';

const FRAME = '#262a33';

registerPrefab({
  ref: 'EntitySpec.mirror',
  label: 'Spiegel',
  category: 'Technik',
  icon: '🪞',
  groundOffset: 0,
  stateKeys: [],
  defaults: {
    transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1.6, 2.2, 1] },
    material: { preset: 'spiegel', mirror: true },
    physics: { mode: 'static' },
  },
  build(ctx, entity, root) {
    const { scene } = ctx;
    const frame = createFixedMaterial(scene, 'mirrorFrame', FRAME, { metallic: 0.8, roughness: 0.35 });
    // Spiegelfläche 1×1 (Unterkante am Boden), Vorderseite = lokale +Z-Richtung.
    const pane = createMainMaterial(scene, 'main', entity.material, { color: '#ffffff', metallic: 1, roughness: 0.02 });
    place(CreateBox('mirrorPane', { width: 1, height: 1, depth: 0.02 }, scene), root, pane, 0, 0.5 + 0.05, 0);
    const t = 0.05;
    slab(scene, root, frame, 1 + 2 * t, t, 0.06, 0, 0, 0);
    slab(scene, root, frame, 1 + 2 * t, t, 0.06, 0, 1 + t, 0);
    slab(scene, root, frame, t, 1, 0.06, -(0.5 + t / 2), t, 0);
    slab(scene, root, frame, t, 1, 0.06, 0.5 + t / 2, t, 0);
  },
});

let watch: ReturnType<Scene['onBeforeRenderObservable']['add']> = null;
let watchScene: Scene | null = null;
let manager: ReturnType<typeof createMirrorManager> | null = null;
const mod: GameModule = {
  id: 'materials',
  init(ctx) {
    manager = createMirrorManager(ctx);
    let n = 0;
    watch = ctx.scene.onBeforeRenderObservable.add(() => {
      if (++n % 60 === 0) dropFallbackWhereUnneeded(ctx.scene);
    });
    watchScene = ctx.scene;
  },
  dispose() {
    if (watchScene) watchScene.onBeforeRenderObservable.remove(watch);
    watchScene = null;
    manager?.dispose();
    manager = null;
  },
};
export default mod;
