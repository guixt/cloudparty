/**
 * Babylon.js wird über Unterpfade importiert (kleines Bundle). Viele Funktionen
 * brauchen dabei Seiteneffekt-Importe. Die gängigen stehen hier zentral, damit
 * kein Modul daran scheitert. Fehlt einer (Laufzeitfehler „… is not a function"
 * oder „needs to be imported"), im EIGENEN Modul zusätzlich importieren.
 */
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import '@babylonjs/core/Physics/v2/physicsEngineComponent';
import '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Collisions/collisionCoordinator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Particles/particleSystemComponent';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/core/Materials/Textures/dynamicTexture';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';
import '@babylonjs/core/Animations/animatable';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import '@babylonjs/core/Rendering/boundingBoxRenderer';
import '@babylonjs/core/Rendering/outlineRenderer';
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import '@babylonjs/core/Engines/Extensions/engine.dynamicTexture';
import '@babylonjs/core/Engines/Extensions/engine.renderTarget';
import '@babylonjs/core/Engines/Extensions/engine.multiRender';
import '@babylonjs/core/Engines/Extensions/engine.uniformBuffer';
import '@babylonjs/core/Engines/Extensions/engine.videoTexture';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/core/Helpers/sceneHelpers';
import '@babylonjs/core/Shaders/particles.vertex';
import '@babylonjs/core/Shaders/particles.fragment';
