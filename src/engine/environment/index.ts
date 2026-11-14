/**
 * STUB des Fundaments – Paket 1 (Umgebung & Look) ersetzt diese Datei.
 * Liefert vorerst: Licht, flache Inselscheibe (Oberseite y = 0) mit statischer Physik.
 */
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { DEFAULT_ISLAND } from '../../../shared/types';
import type { GameModule } from '../../core/context';

const environment: GameModule = {
  id: 'environment',
  init(ctx) {
    const { scene, store } = ctx;
    const hemi = new HemisphericLight('env.hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.7;
    const sun = new DirectionalLight('env.sun', new Vector3(-0.5, -1, -0.4), scene);
    sun.intensity = 1.2;

    const island = store.getState().world.island ?? DEFAULT_ISLAND;
    const ground = CreateCylinder('env.island', { diameter: island.radius * 2, height: 2, tessellation: 48 }, scene);
    ground.position.y = -1;
    const material = new StandardMaterial('env.grass', scene);
    material.diffuseColor = new Color3(0.3, 0.62, 0.25);
    material.specularColor = Color3.Black();
    ground.material = material;
    ground.receiveShadows = true;
    new PhysicsAggregate(ground, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.8 }, scene);
  },
};
export default environment;
