/** Werkzeug look: Screenshot der Welt. Nur mit Erlaubnis des Nutzers, mit Limit pro Auftrag. */
import { AI_LIMITS } from '../../../shared/aiTools';
import type { Vec3 } from '../../../shared/types';
import { VIEW_NAMES, type ViewName } from './capture';
import { entityBox } from './buildTools';
import { unionBox } from './buildGeometry';
import { getRunLimits } from './runLimits';
import { HIDDEN_TEXT, appHidden, fail, getEntityOrGroup, resolveTargets, num, ok, type Handler, type ToolContext } from './tools';

/** Mittelpunkt und Radius um ein Objekt (bei Gruppen: um alle Mitglieder). */
export function boundsFor(ctx: ToolContext, id: unknown): { center: Vec3; radius: number } {
  const entity = getEntityOrGroup(ctx, id);
  const { entities, order } = ctx.store.getState();
  const members = entity.group ? order.map((i) => entities[i]).filter((e) => e?.group === entity.group) : [entity];
  const { min, max } = unionBox(members.map((m) => entityBox(m).box));
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(1.5, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  return { center, radius };
}

export const visionHandlers: Record<string, Handler> = {
  async look(input, ctx, counters) {
    if (!ctx.vision) {
      return { ok: false, content: 'Screenshots sind ausgeschaltet. Bitte den Nutzer, sie in den KI-Einstellungen („KI darf Screenshots der Welt ansehen“) zu erlauben, und arbeite bis dahin ohne Bild weiter.', summary: 'Screenshots sind ausgeschaltet', mutated: false };
    }
    const capture = ctx.captureView ?? fail('Screenshots sind hier nicht verfügbar.');
    if (appHidden()) return { ok: false, content: HIDDEN_TEXT, summary: 'App-Fenster im Hintergrund', mutated: false };
    const maxShots = getRunLimits().maxScreenshots;
    if ((counters.screenshots ?? 0) >= maxShots) {
      return { ok: false, content: `Limit erreicht: höchstens ${maxShots} Screenshots pro Auftrag. Arbeite mit den Daten aus get_world weiter oder beende den Auftrag.`, summary: 'Screenshot-Limit erreicht', mutated: false };
    }
    const view = input.view === undefined ? 'iso' : input.view;
    if (typeof view !== 'string' || !(VIEW_NAMES as readonly string[]).includes(view)) fail(`view muss eines von ${VIEW_NAMES.join(', ')} sein.`);
    let views: [ViewName, ViewName] | undefined;
    if (input.views !== undefined) {
      const v = input.views;
      if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'string' || !(VIEW_NAMES as readonly string[]).includes(x))) fail(`views muss genau zwei Ansichten aus ${VIEW_NAMES.join(', ')} enthalten.`);
      views = [(v as unknown[])[0], (v as unknown[])[1]] as [ViewName, ViewName];
    }
    const distance = input.distance === undefined ? undefined : num(input.distance, 'distance', 2, 200);

    let center: Vec3;
    let radius = 4;
    const target = input.target;
    let highlight: string[] | undefined;
    if (typeof target === 'string') {
      ({ center, radius } = boundsFor(ctx, target));
      if (input.mark !== false) highlight = resolveTargets(ctx, target).targets.map((e) => e.id);
    } else if (Array.isArray(target)) {
      if (target.length !== 3) fail('target als Position braucht genau 3 Zahlen [x, y, z].');
      center = [num(target[0], 'target[0]', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate), num(target[1], 'target[1]', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate), num(target[2], 'target[2]', -AI_LIMITS.maxCoordinate, AI_LIMITS.maxCoordinate)];
    } else if (target === undefined) {
      const avatar = ctx.getAvatar();
      center = avatar ? [avatar.position[0], avatar.position[1] + 1, avatar.position[2]] : [0, 1, 0];
    } else {
      return fail('target muss eine Objekt-id (Text) oder eine Position [x, y, z] sein.');
    }

    counters.screenshots = (counters.screenshots ?? 0) + 1;
    const data = await capture({ center, radius, view: (views ? views[0] : view) as ViewName, ...(views ? { views } : {}), ...(highlight ? { highlight } : {}), ...(distance !== undefined ? { distance } : {}) });
    if (!data) return fail('Der Screenshot ist fehlgeschlagen.');
    const left = maxShots - counters.screenshots;
    return { ok: true, content: `Screenshot (${views ? `${views[0]} links, ${views[1]} rechts` : view}${highlight ? ', Ziel magenta markiert' : ''}) um [${center.map((n) => Math.round(n * 10) / 10).join(', ')}]. Noch ${left} Screenshot(s) in diesem Auftrag erlaubt.`, summary: 'Welt angesehen', mutated: false, image: data };
  },
};
