/**
 * Echtzeit-Spiegel (`material.mirror`): pro Entity eine MirrorTexture auf der Hauptfläche (lokale +Z-Fläche).
 * Es sind höchstens MAX_ACTIVE Spiegel gleichzeitig aktiv (die nächsten, sichtbaren, in Reichweite);
 * die übrigen behalten ihr letztes Bild. Ohne Spiegel-Textur (Qualität „niedrig") bleibt der Chrom-Rückgriff
 * aus `applyMaterialSpec`.
 */
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { GameContext } from '../../core/context';
import { isBuildOnly } from '../entities/parts';

export const MAX_ACTIVE_MIRRORS = 2;
export const MIRROR_RANGE = 40;
const LIST_REFRESH_FRAMES = 30;

interface MirrorInst {
  id: string;
  node: TransformNode;
  mesh: AbstractMesh;
  mat: PBRMaterial;
  tex: MirrorTexture;
  active: boolean;
  own: Set<AbstractMesh>;
}

/** Wählt die aktiven Spiegel: sichtbar, in Reichweite, nächste zuerst. Rein, für Tests. */
export function pickActive(cands: { id: string; dist: number; visible: boolean }[], max = MAX_ACTIVE_MIRRORS, range = MIRROR_RANGE): Set<string> {
  return new Set(
    cands
      .filter((c) => c.visible && c.dist <= range)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, max)
      .map((c) => c.id),
  );
}

export function createMirrorManager(ctx: GameContext) {
  const { scene, bus, store, entityNodes } = ctx;
  const mirrors = new Map<string, MirrorInst>();
  let frame = 0;

  const mainMesh = (node: TransformNode): { mesh: AbstractMesh; mat: PBRMaterial } | null => {
    for (const mesh of node.getChildMeshes(false)) {
      const mat = mesh.material;
      if (mat instanceof PBRMaterial && (mat.metadata as { cpMain?: boolean } | null)?.cpMain) return { mesh, mat };
    }
    return null;
  };

  const remove = (id: string) => {
    const m = mirrors.get(id);
    if (!m) return;
    mirrors.delete(id);
    if (m.mat.reflectionTexture === m.tex) m.mat.reflectionTexture = null;
    try {
      m.tex.dispose();
    } catch {
      /* schon freigegeben */
    }
  };

  const refreshList = (m: MirrorInst) => {
    m.tex.renderList = scene.meshes.filter((mesh) => !m.own.has(mesh) && mesh.isEnabled() && !isBuildOnly(mesh) && mesh.getTotalVertices() > 0 && !(mesh.metadata as { cpMirror?: boolean } | null)?.cpMirror);
  };

  const sync = (id: string) => {
    const entity = store.getState().entities[id];
    const node = entityNodes.get(id);
    const size = ctx.quality.features().mirrorSize;
    const wanted = !!entity?.material?.mirror && size > 0 && !!node;
    const cur = mirrors.get(id);
    if (!wanted || !node) return remove(id);
    const found = mainMesh(node);
    if (!found) return remove(id);
    if (cur && cur.node === node && cur.mesh === found.mesh && cur.tex.getSize().width === size) return;
    remove(id);
    try {
      const tex = new MirrorTexture(`mirror.${id}`, size, scene, true);
      tex.adaptiveBlurKernel = 4;
      tex.refreshRate = 0;
      found.mat.reflectionTexture = tex;
      found.mesh.metadata = { ...(found.mesh.metadata ?? {}), cpMirror: true };
      const inst: MirrorInst = { id, node, mesh: found.mesh, mat: found.mat, tex, active: false, own: new Set(node.getChildMeshes(false)) };
      refreshList(inst);
      mirrors.set(id, inst);
    } catch (error) {
      console.warn('[materials] Spiegel konnte nicht erzeugt werden', error);
    }
  };

  const syncAll = () => {
    for (const id of [...mirrors.keys()]) remove(id);
    for (const [id] of entityNodes) sync(id);
  };

  const update = () => {
    if (mirrors.size === 0) return;
    const cam = scene.activeCamera;
    if (!cam) return;
    const camPos = cam.globalPosition;
    frame++;
    const cands: { id: string; dist: number; visible: boolean }[] = [];
    for (const m of mirrors.values()) {
      const centre = m.mesh.getBoundingInfo().boundingBox.centerWorld;
      const facing = Vector3.TransformNormal(new Vector3(0, 0, 1), m.node.getWorldMatrix()).normalize();
      // Babylon spiegelt an der Ebene; ihre Normale zeigt von der sichtbaren Seite weg.
      m.tex.mirrorPlane = Plane.FromPositionAndNormal(centre, facing.scale(-1));
      const toCam = camPos.subtract(centre);
      const front = Vector3.Dot(toCam, facing) > 0;
      cands.push({ id: m.id, dist: toCam.length(), visible: front && cam.isInFrustum(m.mesh) });
      if (frame % LIST_REFRESH_FRAMES === 0) refreshList(m);
    }
    const active = pickActive(cands);
    for (const m of mirrors.values()) {
      const on = active.has(m.id);
      if (on !== m.active) {
        m.active = on;
        m.tex.refreshRate = on ? 1 : 0;
      }
    }
  };

  const disposers = [
    bus.on('entity.node.created', ({ id }) => sync(id)),
    bus.on('entity.node.disposed', ({ id }) => remove(id)),
    bus.on('entity.changed', ({ entity }) => sync(entity.id)),
    ctx.quality.onChange(() => syncAll()),
  ];
  const obs = scene.onBeforeRenderObservable.add(update);
  syncAll();

  return {
    count: () => mirrors.size,
    dispose() {
      scene.onBeforeRenderObservable.remove(obs);
      for (const d of disposers) d();
      for (const id of [...mirrors.keys()]) remove(id);
    },
  };
}
