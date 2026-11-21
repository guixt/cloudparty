import { afterEach, describe, expect, it } from 'vitest';
import { AI_LIMITS } from '../../../shared/aiTools';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { attachScriptLog, describeChanges } from './scriptTestTools';
import { executeTool, type RunCounters, type ToolContext } from './tools';

let detach: (() => void) | null = null;
afterEach(() => detach?.());

/** Ein „Host“, der ein einfaches Verhalten nachspielt: Klick auf die Tür öffnet sie (Position + Zustand + Chat). */
function setup(behaviour: 'ok' | 'error' | 'silent' = 'ok') {
  const bus = new EventBus();
  const store = createWorldStore(bus);
  store.getState().setCanBuild(true);
  store.getState().setMode('build');
  detach = attachScriptLog(bus);
  store.getState().addEntity({ id: 'door', ref: 'EntitySpec.box', name: 'Tür', script: { enabled: true, source: 'function onClick(){}' }, transform: { pos: [0, 1, 0], rot: [0, 0, 0, 1], scale: [1, 2, 0.2] }, state: { offen: false } }, { source: 'local' });
  bus.on('mode.changed', ({ mode }) => {
    if (mode === 'play') setTimeout(() => bus.emit('script.status', { entityId: 'door', status: behaviour === 'error' ? 'error' : 'running', ...(behaviour === 'error' ? { message: 'SyntaxError: kaputt (Zeile 3)' } : {}) }), 10);
  });
  bus.on('script.test.dispatch', ({ entityId, name }) => {
    if (behaviour === 'silent' || name !== 'onClick') return;
    bus.emit('script.log', { entityId, level: 'log', message: 'Tür wird geöffnet', ts: Date.now() });
    store.getState().updateEntity(entityId, { transform: { pos: [2, 1, 0], rot: [0, 0, 0, 1], scale: [1, 2, 0.2] }, state: { offen: true } }, { source: 'script' });
    bus.emit('chat.message', { from: entityId, name: 'Tür', text: 'Offen!', ts: Date.now(), kind: 'object' });
    store.getState().addEntity({ id: 'sp_door_1_x', ref: 'EntitySpec.sphere', transform: { pos: [0, 5, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } }, { source: 'script' });
  });
  const ctx: ToolContext = { store, bus, getAvatar: () => null, confirm: async () => true };
  const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
  return { store, bus, run: (n: string, i: unknown) => executeTool(n, i, ctx, counters), counters };
}

const parse = (content: string) => JSON.parse(/<welt_daten>\n([\s\S]*)\n<\/welt_daten>/.exec(content)![1]);

describe('script_test', () => {
  it('löst onClick aus, meldet Protokoll, Änderungen, Chat, erzeugte Objekte und setzt alles zurück', async () => {
    const t = setup();
    const r = await t.run('script_test', { id: 'Tür', event: 'onClick', wait_ms: 200 });
    expect(r.ok).toBe(true);
    const out = parse(r.content);
    expect(out.skript_status).toBe('running');
    expect(out.protokoll).toContain('Tür wird geöffnet');
    expect(out.objekt_hat_gesagt).toEqual(['Tür: Offen!']);
    expect(out.erzeugte_objekte).toBe(1);
    expect(out.geaenderte_objekte[0].aenderungen.join(' ')).toContain('Position (0, 1, 0) → (2, 1, 0)');
    expect(out.geaenderte_objekte[0].aenderungen.join(' ')).toContain('Zustand offen: false → true');
    // zurückgesetzt, Modus wieder wie vorher
    const s = t.store.getState();
    expect(s.entities.door.transform.pos).toEqual([0, 1, 0]);
    expect(s.entities.door.state?.offen).toBe(false);
    expect(s.entities.sp_door_1_x).toBeUndefined();
    expect(s.mode).toBe('build');
  });

  it('ohne restore bleiben die Änderungen', async () => {
    const t = setup();
    await t.run('script_test', { id: 'door', event: 'onClick', wait_ms: 200, restore: false });
    expect(t.store.getState().entities.door.transform.pos).toEqual([2, 1, 0]);
  });

  it('Skriptfehler: ok=false mit Fehlermeldung; „nichts geschehen“ bekommt einen Hinweis', async () => {
    const bad = setup('error');
    const r = await bad.run('script_test', { id: 'door', wait_ms: 200 });
    expect(r.ok).toBe(false);
    expect(parse(r.content).status_meldung).toContain('Zeile 3');
    detach?.();
    const quiet = setup('silent');
    const q = parse((await quiet.run('script_test', { id: 'door', wait_ms: 200 })).content);
    expect(q.hinweis).toContain('Nichts hat sich geändert');
  });

  it('prüft Eingaben, Objekt ohne Skript, Limit', async () => {
    const t = setup();
    t.store.getState().addEntity({ id: 'k', ref: 'EntitySpec.box', name: 'Kiste', transform: { pos: [5, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } }, { source: 'local' });
    expect((await t.run('script_test', { id: 'k' })).ok).toBe(false);
    expect((await t.run('script_test', { id: 'door', event: 'onFly' })).ok).toBe(false);
    expect((await t.run('script_test', { id: 'gibtsnicht' })).ok).toBe(false);
    t.counters.scriptTests = AI_LIMITS.maxScriptTestsPerRun;
    const over = await t.run('script_test', { id: 'door', wait_ms: 200 });
    expect(over.ok).toBe(false);
    expect(over.content).toContain('Limit');
  });
});

describe('script_log', () => {
  it('liest Status und Protokoll eines Objekts und die Fehlerliste ohne id', async () => {
    const t = setup();
    t.bus.emit('script.status', { entityId: 'door', status: 'running' });
    t.bus.emit('script.log', { entityId: 'door', level: 'error', message: 'ReferenceError: x (Zeile 2)', ts: 1 });
    const one = parse((await t.run('script_log', { id: 'Tür' })).content);
    expect(one.status).toBe('running');
    expect(one.protokoll[0]).toContain('Zeile 2');
    const all = parse((await t.run('script_log', {})).content);
    expect(all.objekte_mit_fehlern).toHaveLength(1);
  });
});

describe('describeChanges', () => {
  it('nennt nur Unterschiede', () => {
    const base = { id: 'x', ref: 'EntitySpec.box', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } } as never;
    expect(describeChanges(base, base)).toEqual([]);
  });
});
