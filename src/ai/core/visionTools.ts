/** Werkzeug look: Screenshot der Welt. Nur mit Erlaubnis des Nutzers, mit Limit pro Auftrag. */
import { AI_LIMITS } from '../../../shared/aiTools';
import type { Vec3 } from '../../../shared/types';
import { VIEW_NAMES, type ViewName } from './capture';
import { fail, getEntity, num, ok, type Handler, type ToolContext } from './tools';

/** Mittelpunkt und Radius um ein Objekt (bei Gruppen: um alle Mitglieder). */
export function boundsFor(ctx: ToolContext, id: unknown): { center: Vec3; radius: number } {
  const entity = getEntity(ctx, id);
  const { entities, order } = ctx.store.getState();
  const members = entity.group ? order.map((i) => entities[i]).filter((e) => e?.group === entity.group) : [entity];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const e of members) {
    const half = Math.max(...e.transform.scale) / 2;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], e.transform.pos[k] - half);
      max[k] = Math.max(max[k], e.transform.pos[k] + half);
    }
  }
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
    if ((counters.screenshots ?? 0) >= AI_LIMITS.maxScreenshotsPerRun) {
      return { ok: false, content: `Limit erreicht: höchstens ${AI_LIMITS.maxScreenshotsPerRun} Screenshots pro Auftrag. Arbeite mit den Daten aus get_world weiter oder beende den Auftrag.`, summary: 'Screenshot-Limit erreicht', mutated: false };
    }
    const view = input.view === undefined ? 'iso' : input.view;
    if (typeof view !== 'string' || !(VIEW_NAMES as readonly string[]).includes(view)) fail(`view muss eines von ${VIEW_NAMES.join(', ')} sein.`);
    const distance = input.distance === undefined ? undefined : num(input.distance, 'distance', 2, 200);

    let center: Vec3;
    let radius = 4;
    const target = input.target;
    if (typeof target === 'string') {
      ({ center, radius } = boundsFor(ctx, target));
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
    const data = await capture({ center, radius, view: view as ViewName, ...(distance !== undefined ? { distance } : {}) });
    if (!data) return fail('Der Screenshot ist fehlgeschlagen.');
    const left = AI_LIMITS.maxScreenshotsPerRun - counters.screenshots;
    return { ok: true, content: `Screenshot (${view}) um [${center.map((n) => Math.round(n * 10) / 10).join(', ')}]. Noch ${left} Screenshot(s) in diesem Auftrag erlaubt.`, summary: 'Welt angesehen', mutated: false, image: data };
  },
};
