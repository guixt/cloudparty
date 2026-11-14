/** Hervorhebung der Auswahl (HighlightLayer um die Meshes des Entity-Knotens). */
import '@babylonjs/core/Layers/highlightLayer';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

export class SelectionHighlight {
  private layer: HighlightLayer | null = null;
  private meshes: Mesh[] = [];

  constructor(private scene: Scene) {}

  set(node: TransformNode | null | undefined): void {
    this.clear();
    if (!node) return;
    if (!this.layer) {
      this.layer = new HighlightLayer('build.highlight', this.scene, { blurHorizontalSize: 0.8, blurVerticalSize: 0.8 });
      this.layer.innerGlow = false;
    }
    const color = Color3.FromHexString('#4da3ff');
    const targets = [node, ...node.getChildMeshes(false)].filter((n): n is Mesh => n instanceof Mesh && n.getTotalVertices() > 0 && n.isVisible);
    for (const mesh of targets) {
      this.layer.addMesh(mesh, color, true);
      this.meshes.push(mesh);
    }
  }

  clear(): void {
    if (!this.layer) return;
    for (const mesh of this.meshes) {
      if (!mesh.isDisposed()) this.layer.removeMesh(mesh);
    }
    this.meshes = [];
  }

  dispose(): void {
    this.clear();
    this.layer?.dispose();
    this.layer = null;
  }
}
