/**
 * Unterstützung für Punktlichter (Laternen, Lichtquellen):
 * - Babylon beachtet pro Material standardmäßig nur 4 Lichter; Sonne und Himmelslicht belegen schon 2.
 *   Wir erlauben 8 und halten die nächsten MAX_POINT_LIGHTS Punktlichter eingeschaltet.
 * - Babylon wählt die Lichter sonst in Szenenreihenfolge, nicht nach Nähe. Darum schalten wir pro Bild
 *   (alle paar Frames) die dem Betrachter nächsten gewollten Punktlichter ein und weiter entfernte aus.
 * Ein Punktlicht gehört dazu, wenn es `metadata.cpMainLight` trägt (siehe Entity-Prefabs).
 */
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { GameContext } from '../../core/context';

export const MAX_POINT_LIGHTS = 6;
/** Sonne + Himmelslicht + Punktlichter. */
export const MAX_LIGHTS_PER_MATERIAL = 2 + MAX_POINT_LIGHTS;
const UPDATE_EVERY_FRAMES = 6;

export function raiseLightLimit(material: Material): void {
  if (material instanceof StandardMaterial || material instanceof PBRMaterial) material.maxSimultaneousLights = MAX_LIGHTS_PER_MATERIAL;
}

/** Wählt aus (Abstand, gewollt)-Einträgen die Indizes der einzuschaltenden Lichter: die nächsten `max` gewollten. */
export function pickNearest(entries: { distance: number; wanted: boolean }[], max: number): Set<number> {
  const order = entries
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.wanted)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
  return new Set(order.map((entry) => entry.index));
}

export function installPointLightSupport(ctx: GameContext): () => void {
  const { scene, store } = ctx;
  for (const material of scene.materials) raiseLightLimit(material);
  const materialObserver = scene.onNewMaterialAddedObservable.add(raiseLightLimit);

  let frame = 0;
  const cam = new Vector3();
  const update = (scene: Scene) => {
    const lights = scene.lights.filter((light): light is PointLight => light instanceof PointLight && !!(light.metadata as { cpMainLight?: boolean } | null)?.cpMainLight);
    if (lights.length <= MAX_POINT_LIGHTS && lights.every((light) => isWanted(light))) {
      for (const light of lights) if (!light.isEnabled(false)) light.setEnabled(true);
      return;
    }
    const origin = scene.activeCamera?.globalPosition ?? cam;
    const entries = lights.map((light) => ({ distance: Vector3.Distance(origin, light.getAbsolutePosition()), wanted: isWanted(light) }));
    const on = pickNearest(entries, MAX_POINT_LIGHTS);
    lights.forEach((light, i) => {
      const shouldBeOn = on.has(i);
      if (light.isEnabled(false) !== shouldBeOn) light.setEnabled(shouldBeOn);
    });
  };
  /** Ein Licht ist gewollt, solange die Entity es nicht ausdrücklich ausschaltet (Laterne: state.on === false). */
  function isWanted(light: PointLight): boolean {
    const id = (light.parent?.metadata as { entityId?: string } | null)?.entityId;
    const entity = id ? store.getState().entities[id] : undefined;
    return entity?.state?.on !== false;
  }

  const frameObserver = scene.onBeforeRenderObservable.add(() => {
    frame += 1;
    if (frame % UPDATE_EVERY_FRAMES === 0) update(scene);
  });
  return () => {
    scene.onNewMaterialAddedObservable.remove(materialObserver);
    scene.onBeforeRenderObservable.remove(frameObserver);
  };
}
