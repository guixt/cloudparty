import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSandbox } from '../src/scripting/runtime/sandbox';
import type { ScriptCommand } from '../src/scripting/runtime/commands';
import type { CompactGraph, GraphSpec } from './graph';
import { GRAPH_LIMITS } from './graph';
import { autoLayout, compactToGraph, graphToCompact } from './graphCompact';
import { compileGraph, entityScriptSource, validateGraph } from './graphCompile';
import { GRAPH_EXAMPLES } from './graphExamples';
import { NODE_DEFS, getNodeDef, nodesByCategory } from './graphNodes';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const AVATAR = { id: 'av1', name: 'Anna' };

function run(graph: GraphSpec, events: [string, unknown[]][], advanceMs = 0) {
  const r = compileGraph(graph);
  expect(r.errors).toEqual([]);
  const cmds: ScriptCommand[] = [];
  const logs: string[] = [];
  const sb = createSandbox({
    source: r.source,
    snapshot: { id: 'e1', name: 'Test', position: [0, 0, 0], rotation: [0, 0, 0], state: { zahl: 7, text: 'hi' } },
    post: (c) => cmds.push(c),
    log: (_l, m) => logs.push(m),
  });
  for (const [name, args] of events) sb.dispatch(name, args);
  if (advanceMs) vi.advanceTimersByTime(advanceMs);
  sb.dispose();
  expect(logs).toEqual([]);
  return cmds;
}
const G = (c: CompactGraph) => compactToGraph(c);
const click = { id: 'k', type: 'on_click' };

describe('Katalog', () => {
  it('ist konsistent', () => {
    expect(NODE_DEFS.length).toBeGreaterThanOrEqual(45);
    expect(new Set(NODE_DEFS.map((d) => d.type)).size).toBe(NODE_DEFS.length);
    for (const d of NODE_DEFS) {
      expect(new Set(d.inputs.map((p) => p.id)).size).toBe(d.inputs.length);
      expect(new Set(d.outputs.map((p) => p.id)).size).toBe(d.outputs.length);
      for (const p of d.inputs.filter((x) => x.kind !== 'flow')) {
        const param = d.params.find((q) => q.id === p.id);
        expect(param, `${d.type}.${p.id}`).toBeDefined();
      }
      if (d.category === 'Ereignisse') expect(d.inputs).toEqual([]);
      for (const p of d.params) if (p.kind === 'select') expect(p.options!.some((o) => o.value === p.default)).toBe(true);
    }
    for (const t of ['on_click', 'set_color', 'say', 'branch', 'number']) expect(getNodeDef(t)).toBeDefined();
    expect(nodesByCategory().length).toBe(7);
  });
});

// type, params, Verbindungen zusätzlich zu k.then -> a.in, erwartete Befehle
const ACTIONS: [string, Record<string, any>, ScriptCommand[]][] = [
  ['set_color', { color: '#00FF00' }, [{ c: 'color', v: '#00ff00' }]],
  ['set_emissive', { color: '#112233' }, [{ c: 'emissive', v: '#112233' }]],
  ['set_alpha', { alpha: 0.5 }, [{ c: 'alpha', v: 0.5 }]],
  ['move', { dx: 1, dy: 2, dz: 3 }, [{ c: 'position', v: [1, 2, 3] }]],
  ['set_position', { x: 4, y: 5, z: 6 }, [{ c: 'position', v: [4, 5, 6] }]],
  ['rotate', { dy: 90 }, [{ c: 'rotation', v: [0, 90, 0] }]],
  ['set_rotation', { x: 1, y: 2, z: 3 }, [{ c: 'rotation', v: [1, 2, 3] }]],
  ['set_scale', { x: 2, y: 2, z: 2 }, [{ c: 'scale', v: [2, 2, 2] }]],
  ['set_particles', { on: true, preset: 'fire' }, [{ c: 'particles', on: true, preset: 'fire' }]],
  ['apply_impulse', { y: 5 }, [{ c: 'impulse', v: [0, 5, 0] }]],
  ['set_physics', { mode: 'trigger' }, [{ c: 'physics', mode: 'trigger' }]],
  ['say', { text: 'Hi' }, [{ c: 'say', text: 'Hi' }]],
  ['play_sound', { name: 'pop' }, [{ c: 'sound', name: 'pop' }]],
  ['play_tone', { freq: 500, dur: 1 }, [{ c: 'tone', frequency: 500, duration: 1 }]],
  ['send_message', { target: 'X', message: 'm', data: 'd' }, [{ c: 'send', target: 'X', message: 'm', data: 'd' }]],
  ['broadcast', { message: 'm' }, [{ c: 'broadcast', message: 'm' }]],
  ['teleport_avatar', { x: 1, y: 2, z: 3 }, [{ c: 'teleport', avatarId: 'av1', v: [1, 2, 3] }]],
  ['set_image', { url: 'a.png' }, [{ c: 'media', op: 'setImage', value: 'a.png' }]],
  ['set_url', { url: 'https://x.de' }, [{ c: 'media', op: 'setUrl', value: 'https://x.de' }]],
  ['set_text', { text: 'T' }, [{ c: 'media', op: 'setText', value: 'T' }]],
  ['next_slide', {}, [{ c: 'media', op: 'nextSlide' }]],
  ['prev_slide', {}, [{ c: 'media', op: 'prevSlide' }]],
  ['set_state', { key: 'k', value: 'v' }, [{ c: 'setState', key: 'k', value: 'v' }]],
  ['set_state_number', { key: 'k', value: 3 }, [{ c: 'setState', key: 'k', value: 3 }]],
];

describe('Aktionen laufen im Sandbox', () => {
  it.each(ACTIONS)('%s', (type, params, expected) => {
    const cmds = run(G({ nodes: [click, { id: 'a', type, params }], connections: ['k.then -> a.in'] }), [['onClick', [AVATAR]]]);
    expect(cmds).toEqual(expected);
  });
});

describe('Ereignisse', () => {
  const say = (src: string) => ({ nodes: [{ id: 'e', type: src }, { id: 's', type: 'say' }], connections: ['e.then -> s.in'] });
  it.each([
    ['on_start', 'onStart', []],
    ['on_touch', 'onTouch', [AVATAR]],
    ['on_trigger_enter', 'onTriggerEnter', [AVATAR]],
    ['on_trigger_exit', 'onTriggerExit', [AVATAR]],
    ['on_tick', 'onTick', [0.05, 1]],
    ['on_message', 'onMessage', ['m', 'd', 'x']],
    ['on_chat', 'onChat', ['hallo', AVATAR]],
  ])('%s', (type, fn, args) => {
    expect(run(G(say(type)), [[fn, args as unknown[]]])).toEqual([{ c: 'say', text: 'Hallo!' }]);
  });
  it('Ausgänge der Ereignisse', () => {
    const g = G({
      nodes: [{ id: 'e', type: 'on_message', params: { message: 'm' } }, { id: 's', type: 'say' }],
      connections: ['e.then -> s.in', 'e.data -> s.text'],
    });
    expect(run(g, [['onMessage', ['x', 'no', 'a']], ['onMessage', ['m', 'ja', 'a']]])).toEqual([{ c: 'say', text: 'ja' }]);
    const g2 = G({ nodes: [{ id: 'e', type: 'on_chat', params: { contains: 'Wort' } }, { id: 's', type: 'say' }], connections: ['e.then -> s.in', 'e.name -> s.text'] });
    expect(run(g2, [['onChat', ['ein WORT', AVATAR]], ['onChat', ['nix', AVATAR]]])).toEqual([{ c: 'say', text: 'Anna' }]);
    const g3 = G({ nodes: [{ id: 'e', type: 'on_tick', params: { every: 1 } }, { id: 's', type: 'say' }, { id: 't', type: 'number_to_text', params: { decimals: 1 } }], connections: ['e.then -> s.in', 'e.time -> t.value', 't.result -> s.text'] });
    expect(run(g3, [['onTick', [0.6, 0.6]], ['onTick', [0.6, 1.2]], ['onTick', [0.6, 1.8]]])).toEqual([{ c: 'say', text: '1.2' }]);
  });
  it('Timer', () => {
    const g = G({ nodes: [{ id: 't', type: 'on_timer', params: { seconds: 1, repeat: true } }, { id: 's', type: 'say' }], connections: ['t.then -> s.in'] });
    expect(run(g, [['onStart', []]], 3500)).toHaveLength(3);
    const once = G({ nodes: [{ id: 't', type: 'on_timer', params: { seconds: 1 } }, { id: 's', type: 'say' }], connections: ['t.then -> s.in'] });
    expect(run(once, [['onStart', []]], 3500)).toHaveLength(1);
  });
  it('mehrere Knoten gleichen Ereignisses werden zusammengeführt', () => {
    const g = G({
      nodes: [{ id: 'a', type: 'on_click' }, { id: 'b', type: 'on_click' }, { id: 's1', type: 'say', params: { text: '1' } }, { id: 's2', type: 'say', params: { text: '2' } }],
      connections: ['a.then -> s1.in', 'b.then -> s2.in'],
    });
    const src = compileGraph(g).source;
    expect(src.match(/function onClick/g)).toHaveLength(1);
    expect(run(g, [['onClick', [AVATAR]]]).map((c: any) => c.text)).toEqual(['1', '2']);
  });
});

describe('Ablauf, Logik, Werte', () => {
  const T = (nodes: CompactGraph['nodes'], connections: string[], events: [string, unknown[]][] = [['onClick', [AVATAR]]], ms = 0) =>
    run(G({ nodes: [click, ...nodes], connections }), events, ms).map((c: any) => c.text ?? c);
  const say = (id: string, text = id) => ({ id, type: 'say', params: { text } });

  it('branch', () => {
    const n = [{ id: 'b', type: 'branch', params: { condition: false } }, say('ja'), say('nein')];
    expect(T(n, ['k.then -> b.in', 'b.true -> ja.in', 'b.false -> nein.in'])).toEqual(['nein']);
  });
  it('wait', () => {
    expect(T([{ id: 'w', type: 'wait', params: { seconds: 2 } }, say('s')], ['k.then -> w.in', 'w.then -> s.in'], [['onClick', [AVATAR]]], 1900)).toEqual([]);
    expect(T([{ id: 'w', type: 'wait', params: { seconds: 2 } }, say('s')], ['k.then -> w.in', 'w.then -> s.in'], [['onClick', [AVATAR]]], 2100)).toEqual(['s']);
  });
  it('repeat mit Nummer, Begrenzung auf 100', () => {
    const nodes = [{ id: 'r', type: 'repeat', params: { count: 3 } }, { id: 's', type: 'say' }, { id: 't', type: 'number_to_text' }, say('fertig')];
    expect(T(nodes, ['k.then -> r.in', 'r.body -> s.in', 'r.index -> t.value', 't.result -> s.text', 'r.then -> fertig.in'])).toEqual(['0', '1', '2', 'fertig']);
    const g = G({ nodes: [click, { id: 'r', type: 'repeat', params: { count: 100000 } }, { id: 'm', type: 'move', params: { dx: 1 } }], connections: ['k.then -> r.in', 'r.body -> m.in'] });
    expect(compileGraph(g).source).toContain('< 100;');
  });
  it('sequence', () => {
    expect(T([{ id: 'q', type: 'sequence' }, say('a'), say('b'), say('c')], ['k.then -> q.in', 'q.o1 -> a.in', 'q.o2 -> b.in', 'q.o4 -> c.in'])).toEqual(['a', 'b', 'c']);
  });
  it('toggle, Zustand bleibt', () => {
    const n = [{ id: 't', type: 'toggle' }, say('A'), say('B')];
    expect(T(n, ['k.then -> t.in', 't.a -> A.in', 't.b -> B.in'], [['onClick', [AVATAR]], ['onClick', [AVATAR]], ['onClick', [AVATAR]]])).toEqual(['A', 'B', 'A']);
  });
  it('counter mit Ziel und Zurücksetzen', () => {
    const n = [{ id: 'c', type: 'counter', params: { limit: 3 } }, say('hit'), { id: 'n', type: 'number_to_text' }, { id: 's', type: 'say' }];
    const c = ['k.then -> c.in', 'c.reached -> hit.in', 'c.value -> n.value', 'n.result -> s.text', 'c.then -> s.in'];
    expect(T(n, c, Array(4).fill(['onClick', [AVATAR]]) as any)).toEqual(['1', '2', '3', 'hit', '1']);
    const r = [{ id: 'c', type: 'counter' }, { id: 'rk', type: 'on_touch' }, { id: 'n', type: 'number_to_text' }, { id: 's', type: 'say' }];
    expect(T(r, ['k.then -> c.in', 'rk.then -> c.reset', 'c.value -> n.value', 'n.result -> s.text', 'c.then -> s.in'], [['onClick', [AVATAR]], ['onClick', [AVATAR]], ['onTouch', [AVATAR]], ['onClick', [AVATAR]]])).toEqual(['1', '2', '1']);
  });
  it('once', () => {
    expect(T([{ id: 'o', type: 'once' }, say('x')], ['k.then -> o.in', 'o.then -> x.in'], [['onClick', [AVATAR]], ['onClick', [AVATAR]]])).toEqual(['x']);
  });
  it('random_branch', () => {
    const n = [{ id: 'r', type: 'random_branch', params: { chance: 1 } }, say('ja'), say('nein')];
    expect(T(n, ['k.then -> r.in', 'r.true -> ja.in', 'r.false -> nein.in'])).toEqual(['ja']);
    const n0 = [{ id: 'r', type: 'random_branch', params: { chance: 0 } }, say('ja'), say('nein')];
    expect(T(n0, ['k.then -> r.in', 'r.true -> ja.in', 'r.false -> nein.in'])).toEqual(['nein']);
  });

  const val = (nodes: CompactGraph['nodes'], conns: string[], from: string) =>
    T([...nodes, { id: 's', type: 'say' }], ['k.then -> s.in', ...conns, `${from} -> s.text`])[0];
  it.each([
    ['compare', { a: 2, b: 3, op: 'lt' }, 'result', 'true'],
    ['compare', { a: 2, b: 3, op: 'ge' }, 'result', 'false'],
    ['and', { a: true, b: false }, 'result', 'false'],
    ['or', { a: true, b: false }, 'result', 'true'],
    ['not', { value: false }, 'result', 'true'],
    ['is_empty', { text: ' ' }, 'result', 'true'],
    ['text_contains', { text: 'Hallo Welt', part: 'WELT' }, 'result', 'true'],
    ['text_contains', { text: 'Hallo Welt', part: 'WELT', ignoreCase: false }, 'result', 'false'],
    ['number', { value: 4.5 }, 'value', '4.5'],
    ['text', { value: 'abc' }, 'value', 'abc'],
    ['boolean', { value: false }, 'value', 'false'],
    ['color', { value: '#ABCDEF' }, 'value', '#abcdef'],
    ['random', { min: 3, max: 3 }, 'value', '3'],
    ['random', { min: 2, max: 2, whole: true }, 'value', '2'],
    ['math', { a: 6, b: 4, op: 'add' }, 'value', '10'],
    ['math', { a: 6, b: 4, op: 'sub' }, 'value', '2'],
    ['math', { a: 6, b: 4, op: 'mul' }, 'value', '24'],
    ['math', { a: 6, b: 4, op: 'div' }, 'value', '1.5'],
    ['math', { a: 6, b: 0, op: 'div' }, 'value', '0'],
    ['math', { a: 6, b: 4, op: 'min' }, 'value', '4'],
    ['math', { a: 6, b: 4, op: 'max' }, 'value', '6'],
    ['math', { a: 6, b: 4, op: 'mod' }, 'value', '2'],
    ['clamp', { value: 9, min: 0, max: 5 }, 'result', '5'],
    ['lerp', { a: 0, b: 10, t: 0.25 }, 'result', '2.5'],
    ['time', {}, 'value', '0'],
    ['text_join', { a: 'x', b: 'y' }, 'result', 'xy'],
    ['number_to_text', { value: 3.14159, decimals: 2 }, 'result', '3.14'],
    ['get_state', { key: 'text' }, 'value', 'hi'],
    ['get_state_number', { key: 'zahl' }, 'value', '7'],
    ['get_var', { name: 'x' }, 'value', '0'],
    ['get_var_text', { name: 'x' }, 'value', ''],
    ['get_var_boolean', { name: 'x' }, 'value', 'false'],
  ])('Wert %s %j', (type, params, port, expected) => {
    const outKind = getNodeDef(type)!.outputs.find((o) => o.id === port)!.kind;
    if (outKind === 'text' || outKind === 'number') return expect(val([{ id: 'v', type, params } as any], [], `v.${port}`)).toBe(expected);
    const sink = outKind === 'boolean' ? { id: 'z', type: 'branch' } : { id: 'z', type: 'set_color' };
    const cmds = T([{ id: 'v', type, params } as any, sink, say('ja'), say('nein')], ['k.then -> z.in', `v.${port} -> z.${outKind === 'boolean' ? 'condition' : 'color'}`, ...(outKind === 'boolean' ? ['z.true -> ja.in', 'z.false -> nein.in'] : [])]);
    expect(outKind === 'boolean' ? cmds[0] === 'ja' : cmds[0].v).toBe(outKind === 'boolean' ? expected === 'true' : expected);
  });
  it('random_color liefert gültige Farben, gleicher Wert bei mehrfacher Nutzung', () => {
    const g = G({ nodes: [click, { id: 'c', type: 'random_color' }, { id: 'a', type: 'set_color' }, { id: 'b', type: 'set_emissive' }], connections: ['k.then -> a.in', 'a.then -> b.in', 'c.value -> a.color', 'c.value -> b.color'] });
    const [x, y] = run(g, [['onClick', [AVATAR]]]) as any[];
    expect(x.v).toMatch(/^#[0-9a-f]{6}$/);
    expect(y.v).toBe(x.v);
  });
  it('Variablen: setzen, ändern, lesen', () => {
    const n: CompactGraph['nodes'] = [
      { id: 'a', type: 'set_var', params: { name: 'punkte', value: 10 } },
      { id: 'b', type: 'change_var', params: { name: 'punkte', amount: 5 } },
      { id: 'g', type: 'get_var', params: { name: 'punkte' } },
      { id: 't', type: 'number_to_text' },
      { id: 'tx', type: 'set_var_text', params: { name: 'wort', value: 'Welt' } },
      { id: 'gt', type: 'get_var_text', params: { name: 'wort' } },
      { id: 'j', type: 'text_join' },
      say('s'),
    ];
    const c = ['k.then -> a.in', 'a.then -> b.in', 'b.then -> tx.in', 'tx.then -> s.in', 'g.value -> t.value', 't.result -> j.a', 'gt.value -> j.b', 'j.result -> s.text'];
    expect(T(n, c)).toEqual(['15Welt']);
  });
  it('Zahl → Text wird umgewandelt', () => {
    const g = G({ nodes: [click, { id: 'n', type: 'number', params: { value: 5 } }, { id: 's', type: 'say' }], connections: ['k.then -> s.in', 'n.value -> s.text'] });
    expect(run(g, [['onClick', [AVATAR]]])).toEqual([{ c: 'say', text: '5' }]);
  });
});

describe('Fehler und Warnungen', () => {
  const errs = (c: CompactGraph) => compileGraph(G(c)).errors.map((e) => e.message).join('\n');
  it('Typfehler', () => {
    expect(errs({ nodes: [click, { id: 'n', type: 'say' }, { id: 'b', type: 'branch' }], connections: ['k.name -> b.condition'] })).toMatch(/Text.*Ja\/Nein.*nicht erlaubt/);
    expect(errs({ nodes: [click, { id: 's', type: 'say' }], connections: ['k.name -> s.in'] })).toMatch(/nicht erlaubt/);
  });
  it('Zyklen', () => {
    expect(errs({ nodes: [{ id: 'a', type: 'math' }, { id: 'b', type: 'math' }], connections: ['a.value -> b.a', 'b.value -> a.a'] })).toMatch(/Schleife/);
    expect(errs({ nodes: [click, { id: 'w', type: 'wait' }, { id: 'x', type: 'wait' }], connections: ['k.then -> w.in', 'w.then -> x.in', 'x.then -> w.in'] })).toMatch(/Schleife/);
  });
  it('mehrere Quellen, unbekannte Ports/Typen', () => {
    expect(errs({ nodes: [{ id: 'a', type: 'number' }, { id: 'b', type: 'number' }, { id: 'c', type: 'math' }], connections: ['a.value -> c.a', 'b.value -> c.a'] })).toMatch(/mehrere Quellen/);
    const g: GraphSpec = { version: 1, enabled: true, nodes: [{ id: 'a', type: 'gibtsnicht', x: 0, y: 0 }], edges: [] };
    expect(compileGraph(g).errors[0].message).toMatch(/Unbekannter Knotentyp/);
    const g2 = G({ nodes: [click, { id: 's', type: 'say' }], connections: ['k.then -> s.in'] });
    g2.edges.push({ from: { node: 'k', port: 'nope' }, to: { node: 's', port: 'in' } });
    expect(compileGraph(g2).errors[0].message).toMatch(/keinen Ausgang/);
  });
  it('Variablen-Konflikt, Teleport ohne Avatar, Index außerhalb', () => {
    expect(errs({ nodes: [{ id: 'a', type: 'set_var', params: { name: 'x' } }, { id: 'b', type: 'set_var_text', params: { name: 'x' } }], connections: [] })).toMatch(/nur eine Art/);
    expect(errs({ nodes: [{ id: 't', type: 'on_tick' }, { id: 'p', type: 'teleport_avatar' }], connections: ['t.then -> p.in'] })).toMatch(/Avatar/);
    expect(errs({ nodes: [click, { id: 'r', type: 'repeat' }, { id: 's', type: 'say' }, { id: 't', type: 'number_to_text' }], connections: ['k.then -> r.in', 'r.then -> s.in', 'r.index -> t.value', 't.result -> s.text'] })).toMatch(/Nummer/);
  });
  it('Warnungen: unverbundene Knoten und Ereignisse', () => {
    const r = compileGraph(G({ nodes: [click, { id: 'x', type: 'say' }, { id: 'n', type: 'number' }], connections: [] }));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.nodeId).sort()).toEqual(['k', 'n', 'x']);
  });
  it('Grenzen', () => {
    const many: GraphSpec = { version: 1, enabled: true, nodes: Array.from({ length: GRAPH_LIMITS.maxNodes + 1 }, (_, i) => ({ id: `n${i}`, type: 'number', x: 0, y: 0 })), edges: [] };
    expect(validateGraph(many)[0].message).toMatch(/Zu viele Knoten/);
    const e = G({ nodes: [click], connections: [] });
    e.edges = Array.from({ length: GRAPH_LIMITS.maxEdges + 1 }, () => ({ from: { node: 'k', port: 'then' }, to: { node: 'k', port: 'in' } }));
    expect(validateGraph(e)[0].message).toMatch(/Zu viele Verbindungen/);
  });
  it('Fan-in-Explosion wird abgebrochen', () => {
    const nodes: CompactGraph['nodes'] = [click];
    const conns: string[] = [];
    let prev = 'k.then';
    for (let i = 0; i < 30; i++) {
      nodes.push({ id: `a${i}`, type: 'say' }, { id: `b${i}`, type: 'say' }, { id: `j${i}`, type: 'once' });
      conns.push(`${prev} -> a${i}.in`, `${prev} -> b${i}.in`, `a${i}.then -> j${i}.in`, `b${i}.then -> j${i}.in`);
      prev = `j${i}.then`;
    }
    expect(errs({ nodes, connections: conns })).toMatch(/zu stark verzweigt/);
  });
});

describe('Einschleusen von Code', () => {
  const evil = ['"); self.say("x"); ("', "'; self.say('x'); '", ' self.say(1) ', '`${self.say(1)}`', '\\', '*/ self.say(1); /*', '</script>'];
  it.each(evil)('Textparameter %j bleibt Text', (payload) => {
    const g = G({ nodes: [click, { id: 's', type: 'say', params: { text: payload } }], connections: ['k.then -> s.in'] });
    expect(run(g, [['onClick', [AVATAR]]])).toEqual([{ c: 'say', text: payload }]);
  });
  it('Variablennamen und Schlüssel', () => {
    const name = '"; self.say("pwn"); //\n*/';
    const g = G({ nodes: [click, { id: 'v', type: 'set_var', params: { name, value: 1 } }, { id: 's', type: 'set_state', params: { key: name, value: name } }], connections: ['k.then -> v.in', 'v.then -> s.in'] });
    const r = compileGraph(g);
    if (r.errors.length === 0) expect(run(g, [['onClick', [AVATAR]]])).toEqual([{ c: 'setState', key: name, value: name }]);
  });
  it('ungültige Zahlen, Farben, Auswahl und IDs sind Fehler', () => {
    const bad = (type: string, params: Record<string, unknown>) => {
      const g = G({ nodes: [click, { id: 'a', type }], connections: ['k.then -> a.in'] });
      g.nodes[1].params = params as any;
      return compileGraph(g);
    };
    expect(bad('move', { dx: NaN }).errors).toHaveLength(1);
    expect(bad('move', { dx: Infinity }).errors).toHaveLength(1);
    expect(bad('move', { dx: '1); self.say(1' }).errors).toHaveLength(1);
    expect(bad('set_color', { color: "#ff0000'); self.say('x" }).errors).toHaveLength(1);
    expect(bad('set_color', { color: 'red' }).errors).toHaveLength(1);
    expect(bad('play_sound', { name: "x'); evil(); ('" }).errors).toHaveLength(1);
    expect(bad('say', { text: 5 }).errors).toHaveLength(1);
    expect(bad('say', { text: 'x'.repeat(5000) }).errors).toEqual([]);
    expect(bad('say', { text: 'x'.repeat(5000) }).source.length).toBeLessThan(3000);
  });
  it('böse Knoten-IDs werden abgelehnt', () => {
    const g: GraphSpec = { version: 1, enabled: true, nodes: [{ id: 'a);evil(', type: 'on_click', x: 0, y: 0 }], edges: [] };
    expect(compileGraph(g).errors[0].message).toMatch(/Ungültige Knoten-ID/);
    expect(() => compactToGraph({ nodes: [{ id: 'a.b', type: 'on_click' }], connections: [] })).toThrow(/Ungültige Knoten-ID/);
  });
  it('Zahlen werden begrenzt', () => {
    const g = G({ nodes: [click, { id: 'a', type: 'set_alpha', params: { alpha: 50 } }], connections: ['k.then -> a.in'] });
    expect(run(g, [['onClick', [AVATAR]]])).toEqual([{ c: 'alpha', v: 1 }]);
  });
});

describe('entityScriptSource', () => {
  const graph = G({ nodes: [click, { id: 's', type: 'say' }], connections: ['k.then -> s.in'] });
  const script = { enabled: true, source: 'function onStart(){}' };
  it('Graph gewinnt, Fallbacks', () => {
    expect(entityScriptSource({ graph, script })!.source).toContain('onClick');
    expect(entityScriptSource({ graph: { ...graph, enabled: false }, script })).toEqual(script);
    const broken: GraphSpec = { ...graph, edges: [{ from: { node: 'k', port: 'name' }, to: { node: 's', port: 'in' } }] };
    expect(entityScriptSource({ graph: broken, script })).toEqual(script);
    expect(entityScriptSource({ graph: broken })).toBeNull();
    expect(entityScriptSource({ graph: { ...graph, enabled: false } })).toBeNull();
    expect(entityScriptSource({ graph: { ...graph, nodes: [], edges: [] }, script })).toEqual(script);
    expect(entityScriptSource({})).toBeNull();
  });
});

describe('Kompaktform und Layout', () => {
  it('Rundreise', () => {
    for (const e of GRAPH_EXAMPLES) {
      const compact = graphToCompact(e.graph);
      const again = compactToGraph(compact);
      expect(graphToCompact(again)).toEqual(compact);
      expect(compileGraph(again).source).toBe(compileGraph(e.graph).source);
    }
  });
  it('toleriert Leerzeichen und Unicode-Pfeile', () => {
    const g = compactToGraph({ nodes: [click, { id: 's', type: 'say' }, { id: 't', type: 'text' }], connections: ['k.then→s.in', '  t.value   ->   s.text '] });
    expect(g.edges).toHaveLength(2);
  });
  it('präzise deutsche Fehler', () => {
    expect(() => compactToGraph({ nodes: [{ id: 'k', type: 'on_klick' }], connections: [] })).toThrow(/Unbekannter Typ.*Gültige Typen: on_start/);
    expect(() => compactToGraph({ nodes: [click, { id: 's', type: 'say' }], connections: ['k.then -> s.eingang'] })).toThrow(/keinen Eingang „eingang“.*Eingänge: in, text/);
    expect(() => compactToGraph({ nodes: [click], connections: ['k.then -> x.in'] })).toThrow(/keinen Knoten „x“/);
    expect(() => compactToGraph({ nodes: [click], connections: ['k.then'] })).toThrow(/Erwartet wird die Form/);
    expect(() => compactToGraph({ nodes: [{ id: 's', type: 'say', params: { text: 5 as any } }], connections: [] })).toThrow(/Parameter „text\*?/);
    expect(() => compactToGraph({ nodes: [{ id: 's', type: 'say', params: { foo: 1 } }], connections: [] })).toThrow(/Unbekannter Parameter „foo“/);
  });
  it('Standardwerte werden gefüllt', () => {
    const g = compactToGraph({ nodes: [{ id: 's', type: 'say' }], connections: [] });
    expect(g.nodes[0].params).toEqual({ text: 'Hallo!' });
  });
  it('autoLayout ist deterministisch, Spalten nach Ablauf, Daten links', () => {
    const g = GRAPH_EXAMPLES.find((e) => e.id === 'zaehler')!.graph;
    const a = autoLayout(g);
    expect(autoLayout(g)).toEqual(a);
    expect(autoLayout(a)).toEqual(a);
    const x = (id: string) => a.nodes.find((n) => n.id === id)!.x;
    expect(x('klick')).toBeLessThan(x('zaehler'));
    expect(x('zaehler')).toBeLessThan(x('sagen'));
    expect(x('text')).toBeLessThan(x('sagen'));
    expect(new Set(a.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(a.nodes.length);
    expect(g.nodes[0].x).toBe(a.nodes[0].x); // Eingabe nicht verändert
  });
});

describe('Beispiele', () => {
  it('mindestens 8, alle fehlerfrei', () => {
    expect(GRAPH_EXAMPLES.length).toBeGreaterThanOrEqual(8);
    for (const e of GRAPH_EXAMPLES) {
      const r = compileGraph(e.graph);
      expect(r.errors, e.id).toEqual([]);
      expect(r.warnings, e.id).toEqual([]);
      expect(e.title && e.description).toBeTruthy();
    }
  });
  const ex = (id: string) => GRAPH_EXAMPLES.find((e) => e.id === id)!.graph;
  it('Tür', () => {
    const cmds = run(ex('tuer'), [['onClick', [AVATAR]], ['onClick', [AVATAR]]]);
    expect(cmds.filter((c) => c.c === 'rotation')).toEqual([{ c: 'rotation', v: [0, 90, 0] }, { c: 'rotation', v: [0, 0, 0] }]);
  });
  it('Lichtschalter', () => {
    const cmds = run(ex('lichtschalter'), [['onClick', [AVATAR]], ['onClick', [AVATAR]]]);
    expect(cmds.filter((c) => c.c === 'send')).toMatchObject([{ target: 'Lampe', message: 'an' }, { target: 'Lampe', message: 'aus' }]);
  });
  it('Lampe', () => {
    const cmds = run(ex('lampe'), [['onStart', []], ['onMessage', ['an', undefined, 'x']], ['onMessage', ['aus', undefined, 'x']]]);
    expect(cmds.filter((c) => c.c === 'emissive').map((c: any) => c.v)).toEqual(['#000000', '#ffee88', '#000000']);
  });
  it('Farbwechsler', () => {
    expect(run(ex('farbwechsler'), [['onStart', []]], 4100).filter((c) => c.c === 'color')).toHaveLength(2);
  });
  it('Begrüßer', () => {
    expect(run(ex('begruesser'), [['onTriggerEnter', [AVATAR]]])).toEqual([{ c: 'say', text: 'Hallo Anna' }]);
  });
  it('Zähler', () => {
    const cmds = run(ex('zaehler'), Array(5).fill(['onClick', [AVATAR]]) as any, 3100);
    expect(cmds.filter((c) => c.c === 'say').map((c: any) => c.text)).toEqual(['Klicks: 1', 'Klicks: 2', 'Klicks: 3', 'Klicks: 4', 'Klicks: 5']);
    expect(cmds.filter((c) => c.c === 'particles')).toEqual([{ c: 'particles', on: true, preset: 'confetti' }, { c: 'particles', on: false, preset: 'confetti' }]);
  });
  it('Aufzug', () => {
    const cmds = run(ex('aufzug'), [['onTick', [0.05, 0]]].concat(Array.from({ length: 250 }, (_, i) => ['onTick', [0.05, i * 0.05]] as any)) as any, 600);
    expect(cmds.filter((c) => c.c === 'position')).toEqual([{ c: 'position', v: [0, 3, 0] }, { c: 'position', v: [0, 0, 0] }]);
    expect(cmds.filter((c) => c.c === 'sound')).toHaveLength(2);
  });
  it('Sprungfeld, Diashow, Teleporter', () => {
    expect(run(ex('sprungfeld'), [['onTouch', [AVATAR]]]).map((c) => c.c)).toEqual(['impulse', 'sound']);
    expect(run(ex('diashow-fernbedienung'), [['onClick', [AVATAR]]])[0]).toMatchObject({ c: 'send', target: 'Tafel', message: 'weiter' });
    expect(run(ex('diashow-tafel'), [['onMessage', ['weiter', undefined, 'x']], ['onMessage', ['zurück', undefined, 'x']]])).toEqual([{ c: 'media', op: 'nextSlide' }, { c: 'media', op: 'prevSlide' }]);
    expect(run(ex('teleporter'), [['onTriggerEnter', [AVATAR]]])[0]).toMatchObject({ c: 'teleport' });
  });
});
