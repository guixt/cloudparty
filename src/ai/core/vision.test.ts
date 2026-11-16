import { describe, expect, it, vi } from 'vitest';
import { AI_LIMITS } from '../../../shared/aiTools';
import { History } from '../../build/history';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import type { AssistantEvent } from '../api';
import { IMAGE_TOKENS, dropImages, estimateTokens, fitToBudget } from './budget';
import { cameraDistance, viewAngles, VIEW_NAMES } from './capture';
import type { ApiMessage } from './client';
import { createAssistant } from './loop';
import { buildSystemPrompt } from './prompt';
import { installLocalStorage, mockFetch, textResponse, toolResponse } from './testUtils';
import { executeTool, type RunCounters, type ToolContext } from './tools';

const FAKE_JPEG = 'A'.repeat(60_000); // großes Base64, soll nicht als Text gezählt werden

function setup(vision: boolean, captured: string | null = FAKE_JPEG) {
  installLocalStorage({ 'cloudparty.ai.key': 'sk-ant-test-0123456789', ...(vision ? { 'cloudparty.ai.vision': '1' } : {}) });
  const bus = new EventBus();
  const store = createWorldStore(bus);
  const history = new History(store, bus);
  history.attach();
  const captureView = vi.fn(async () => captured);
  const assistant = createAssistant({ store, bus, getAvatar: () => ({ position: [0, 0, 6], yaw: 0 }), getHistory: () => history, captureView });
  const events: AssistantEvent[] = [];
  const run = (prompt: string) => assistant.run(prompt, { onEvent: (e) => void events.push(e), confirm: async () => true });
  return { bus, store, captureView, run, events };
}

const toolCtx = (s: ReturnType<typeof setup>, vision = true, capture = s.captureView): ToolContext => ({
  store: s.store,
  bus: s.bus,
  getAvatar: () => ({ position: [0, 0, 6], yaw: 0 }),
  confirm: async () => true,
  vision,
  captureView: capture,
});
const counters = (): RunCounters => ({ toolCalls: 0, newEntities: 0, removals: 0 });

describe('Budget mit Bildern', () => {
  it('ein großes Base64-Bild zählt nur pauschal', () => {
    const msgs: ApiMessage[] = [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: FAKE_JPEG } }, { type: 'text', text: 'hi' }] }] }];
    const tokens = estimateTokens(msgs);
    expect(tokens).toBeGreaterThanOrEqual(IMAGE_TOKENS);
    expect(tokens).toBeLessThan(IMAGE_TOKENS + 200);
    expect(fitToBudget({ system: 's', tools: [], messages: msgs, currentFrom: 0, budget: 5000 })).toBeTruthy();
  });

  it('dropImages ersetzt Bilder, lässt auf Wunsch die letzte Nachricht unberührt, ändert die Eingabe nicht', () => {
    const withImage = (id: string): ApiMessage => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'x' } }, { type: 'text', text: 'T' }] }] });
    const msgs = [withImage('1'), withImage('2')];
    const kept = dropImages(msgs, true);
    expect(JSON.stringify(kept[0])).not.toContain('"image"');
    expect(JSON.stringify(kept[0])).toContain('Bild entfernt');
    expect(JSON.stringify(kept[1])).toContain('"image"');
    expect(JSON.stringify(msgs[0])).toContain('"image"');
    expect(JSON.stringify(dropImages(msgs, false)[1])).not.toContain('"image"');
  });

  it('passt die Anfrage nicht ins Budget, fallen zuerst die Bilder weg', () => {
    const img: ApiMessage = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'x' } }] }] };
    const msgs: ApiMessage[] = [img, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'weiter' }];
    const out = fitToBudget({ system: '', tools: [], messages: msgs, currentFrom: 2, budget: IMAGE_TOKENS - 100 });
    expect(JSON.stringify(out)).not.toContain('"image"');
  });
});

describe('Blickrichtungen', () => {
  it('alle Namen haben Winkel, top blickt von oben, Abstand wächst mit dem Radius', () => {
    for (const v of VIEW_NAMES) expect(Number.isFinite(viewAngles(v).alpha)).toBe(true);
    expect(viewAngles('top').beta).toBeLessThan(0.2);
    expect(cameraDistance(10)).toBeGreaterThan(cameraDistance(2));
    expect(cameraDistance(2, 500)).toBe(200);
    expect(cameraDistance(2, 0.1)).toBe(2);
  });
});

describe('Werkzeug look', () => {
  it('ausgeschaltet: verständliche Meldung, kein Screenshot', async () => {
    const s = setup(false);
    const r = await executeTool('look', {}, toolCtx(s, false), counters());
    expect(r.ok).toBe(false);
    expect(r.content).toContain('ausgeschaltet');
    expect(s.captureView).not.toHaveBeenCalled();
  });

  it('liefert ein Bild, zählt mit und lehnt nach dem Limit ab', async () => {
    const s = setup(true);
    const c = counters();
    const first = await executeTool('look', { view: 'front' }, toolCtx(s), c);
    expect(first.ok).toBe(true);
    expect(first.image).toBe(FAKE_JPEG);
    expect(s.captureView).toHaveBeenCalledWith(expect.objectContaining({ view: 'front', center: [0, 1, 6] }));
    for (let i = 1; i < AI_LIMITS.maxScreenshotsPerRun; i++) await executeTool('look', {}, toolCtx(s), c);
    const over = await executeTool('look', {}, toolCtx(s), c);
    expect(over.ok).toBe(false);
    expect(over.content).toContain('Limit');
    expect(s.captureView).toHaveBeenCalledTimes(AI_LIMITS.maxScreenshotsPerRun);
  });

  it('Ziel: Objekt, Gruppe und Position; ungültige Eingaben werden abgewiesen', async () => {
    const s = setup(true);
    const add = (id: string, pos: [number, number, number], group?: string) =>
      s.store.getState().addEntity({ id, ref: 'EntitySpec.box', transform: { pos, rot: [0, 0, 0, 1], scale: [2, 2, 2] }, ...(group ? { group } : {}) }, { source: 'local' });
    add('a', [0, 1, 0], 'g');
    add('b', [10, 1, 0], 'g');
    await executeTool('look', { target: 'a' }, toolCtx(s), counters());
    expect(s.captureView).toHaveBeenLastCalledWith(expect.objectContaining({ center: [5, 1, 0] })); // ganze Gruppe
    await executeTool('look', { target: [3, 2, 1] }, toolCtx(s), counters());
    expect(s.captureView).toHaveBeenLastCalledWith(expect.objectContaining({ center: [3, 2, 1] }));
    expect((await executeTool('look', { target: 'gibt-es-nicht' }, toolCtx(s), counters())).ok).toBe(false);
    expect((await executeTool('look', { target: [1, 2] }, toolCtx(s), counters())).ok).toBe(false);
    expect((await executeTool('look', { view: 'unten' }, toolCtx(s), counters())).ok).toBe(false);
    expect((await executeTool('look', { distance: 9999 }, toolCtx(s), counters())).ok).toBe(false);
  });

  it('fehlgeschlagene Aufnahme verbraucht Meldung statt Bild', async () => {
    const s = setup(true, null);
    const r = await executeTool('look', {}, toolCtx(s), counters());
    expect(r.ok).toBe(false);
    expect(r.content).toContain('fehlgeschlagen');
  });

  it('ohne Baurecht ist look trotzdem erlaubt (ändert nichts)', async () => {
    const s = setup(true);
    s.store.getState().setCanBuild(false);
    expect((await executeTool('look', {}, toolCtx(s), counters())).ok).toBe(true);
  });

  it('Systemprompt erklärt das Sehen', () => {
    expect(buildSystemPrompt(setup(true).store.getState())).toContain('look');
  });
});

describe('Schleife mit Screenshot', () => {
  it('das Bild steht im tool_result der nächsten Anfrage; ältere Bilder werden ersetzt', async () => {
    const s = setup(true);
    const requests = mockFetch([
      toolResponse([{ id: 'l1', name: 'look', input: { view: 'iso' } }]),
      toolResponse([{ id: 'l2', name: 'look', input: { view: 'top' } }]),
      textResponse('sieht gut aus'),
    ]);
    await s.run('prüfe den Bau');
    expect(requests).toHaveLength(3);
    const lastBlocks = requests[2].body.messages.at(-1).content;
    expect(lastBlocks[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    const earlier = JSON.stringify(requests[2].body.messages.slice(0, -1));
    expect(earlier).not.toContain('"type":"image"');
    expect(earlier).toContain('Bild entfernt');
    expect(s.events.some((e) => e.type === 'error')).toBe(false);
  });

  it('Schalter aus: die KI bekommt die Meldung statt eines Bilds, es wird nicht fotografiert', async () => {
    const s = setup(false);
    const requests = mockFetch([toolResponse([{ id: 'l1', name: 'look', input: {} }]), textResponse('ok')]);
    await s.run('schau hin');
    expect(s.captureView).not.toHaveBeenCalled();
    expect(JSON.stringify(requests[1].body.messages.at(-1))).toContain('ausgeschaltet');
    expect(JSON.stringify(requests[1].body.messages.at(-1))).not.toContain('"image"');
  });
});

describe('Einstellung', () => {
  it('Screenshots sind standardmäßig aus und lassen sich ein- und ausschalten', async () => {
    const { getVision, setVision } = await import('./settings');
    installLocalStorage({});
    expect(getVision()).toBe(false);
    setVision(true);
    expect(getVision()).toBe(true);
    setVision(false);
    expect(getVision()).toBe(false);
  });
});
