/**
 * Modul „Klemmbaustein-Sichtbarkeit“: Steine, die komplett von anderen Steinen eingeschlossen sind, werden im Spielmodus
 * nicht gezeichnet (Babylon macht nur Sichtfeld-Culling, keine Verdeckungsprüfung). Im Baumodus ist alles sichtbar.
 */
import { BRICK_REF, hiddenBrickIds, type CullBrick } from '../../../shared/bricks';
import type { GameContext, GameModule } from '../../core/context';

const DEBOUNCE_MS = 250;

/** Versteckt/zeigt die Meshes eines Entity-Knotens. */
function setNodeVisible(ctx: GameContext, id: string, visible: boolean): void {
  const node = ctx.entityNodes.get(id);
  if (!node) return;
  for (const mesh of node.getChildMeshes(false)) if (mesh.isEnabled(false) !== visible) mesh.setEnabled(visible);
}

export function collectBricks(ctx: GameContext): CullBrick[] {
  const s = ctx.store.getState();
  const out: CullBrick[] = [];
  for (const id of s.order) {
    const e = s.entities[id];
    if (!e || e.ref !== BRICK_REF) continue;
    out.push({ id, pos: e.transform.pos, rot: e.transform.rot, state: e.state, fixed: !e.physics || e.physics.mode === 'static' || e.physics.mode === 'none' });
  }
  return out;
}

const bricks: GameModule = {
  id: 'brickCulling',
  init(ctx) {
    let hidden = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disposers: (() => void)[] = [];

    const apply = () => {
      timer = undefined;
      const play = ctx.store.getState().mode === 'play';
      const next = play ? hiddenBrickIds(collectBricks(ctx)) : new Set<string>();
      for (const id of hidden) if (!next.has(id)) setNodeVisible(ctx, id, true);
      for (const id of next) setNodeVisible(ctx, id, false);
      hidden = next;
    };
    const schedule = () => {
      if (timer === undefined) timer = setTimeout(apply, DEBOUNCE_MS);
    };

    disposers.push(
      ctx.bus.on('entity.added', ({ entity }) => entity.ref === BRICK_REF && schedule()),
      ctx.bus.on('entity.removed', ({ entity }) => entity.ref === BRICK_REF && schedule()),
      ctx.bus.on('entity.changed', ({ entity }) => entity.ref === BRICK_REF && schedule()),
      ctx.bus.on('world.loaded', () => {
        hidden = new Set();
        schedule();
      }),
      ctx.bus.on('mode.changed', () => apply()),
      // Neu gebauter Knoten (z. B. nach Änderung): ist ein Stein schon als verdeckt bekannt, gleich wieder verstecken.
      ctx.bus.on('entity.node.created', ({ id }) => {
        if (hidden.has(id)) setNodeVisible(ctx, id, false);
      }),
    );
    schedule();
    (bricks as { dispose?: () => void }).dispose = () => {
      if (timer !== undefined) clearTimeout(timer);
      disposers.splice(0).forEach((d) => d());
      hidden.clear();
    };
  },
};
export default bricks;
