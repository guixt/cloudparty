/**
 * Übersetzer Graph → Skript (Paket 18). Reine Funktionen ohne DOM/Node-Abhängigkeit
 * (läuft im Browser, im Worker, auf dem Server und in Tests).
 *
 * Sicherheit: Alle Werte aus dem Graphen (Parameter, IDs) werden geprüft und nur als
 * Literale (JSON.stringify, begrenzte Zahlen, geprüfte Farben/Optionen) ausgegeben.
 */
import type { CompileResult, GraphEdge, GraphIssue, GraphNode, GraphSpec, NodeDef, ParamDef, ParamValue, PortKind } from './graph';
import { GRAPH_LIMITS } from './graph';
import { getNodeDef } from './graphNodes';
import type { EntitySpec } from './types';

const MAX_TEXT = 2000;
const MAX_EMITTED = 20000;
const MAX_REPEAT = 100;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const KIND_DE: Record<PortKind, string> = { flow: 'Ablauf', number: 'Zahl', text: 'Text', boolean: 'Ja/Nein', color: 'Farbe' };

/** Ereignis-Knoten → Funktion der Skript-API. */
const EVENTS: Record<string, { fn: string; args: string; avatar: boolean; outs: Record<string, string> }> = {
  on_start: { fn: 'onStart', args: '', avatar: false, outs: {} },
  on_click: { fn: 'onClick', args: 'avatar', avatar: true, outs: { name: 'avatar.name' } },
  on_touch: { fn: 'onTouch', args: 'avatar', avatar: true, outs: { name: 'avatar.name' } },
  on_trigger_enter: { fn: 'onTriggerEnter', args: 'avatar', avatar: true, outs: { name: 'avatar.name' } },
  on_trigger_exit: { fn: 'onTriggerExit', args: 'avatar', avatar: true, outs: { name: 'avatar.name' } },
  on_tick: { fn: 'onTick', args: 'dt, time', avatar: false, outs: { dt: 'dt', time: 'time' } },
  on_message: {
    fn: 'onMessage',
    args: 'message, data, fromId',
    avatar: false,
    outs: { data: "String(data ?? '')", number: '(Number(data) || 0)', sender: "String(fromId ?? '')" },
  },
  on_chat: { fn: 'onChat', args: 'text, avatar', avatar: true, outs: { text: 'String(text)', name: 'avatar.name' } },
  on_timer: { fn: 'onStart', args: '', avatar: false, outs: {} },
};
const HANDLER_ORDER = ['onStart', 'onClick', 'onTouch', 'onTriggerEnter', 'onTriggerExit', 'onTick', 'onMessage', 'onChat'];
const RANDOM_TYPES = new Set(['random', 'random_color']);
const VAR_KIND: Record<string, 'number' | 'text' | 'boolean'> = {
  set_var: 'number',
  change_var: 'number',
  get_var: 'number',
  set_var_text: 'text',
  get_var_text: 'text',
  set_var_boolean: 'boolean',
  get_var_boolean: 'boolean',
};
const VAR_INIT = { number: '0', text: "''", boolean: 'false' };

const HELPERS: Record<string, string[]> = {
  randomColor: [
    'function __g_randomColor() {',
    '  const h = Math.random() * 6, f = h - Math.floor(h);',
    '  const q = Math.round(255 * (1 - f)), t = Math.round(255 * f);',
    '  const rgb = [[255, t, 0], [q, 255, 0], [0, 255, t], [0, q, 255], [t, 0, 255], [255, 0, q]][Math.floor(h) % 6];',
    "  return '#' + rgb.map((v) => ('0' + v.toString(16)).slice(-2)).join('');",
    '}',
  ],
  div: ['function __g_div(a, b) {', '  return b === 0 ? 0 : a / b;', '}'],
  mod: ['function __g_mod(a, b) {', '  return b === 0 ? 0 : a % b;', '}'],
};

// ------------------------------------------------------------------ Literale

/** Sicheres String-Literal (auch gegen Zeilentrenner U+2028/2029). */
function js(text: string): string {
  return JSON.stringify(text).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function numLit(v: number): string {
  const x = Object.is(v, -0) ? 0 : v;
  return x < 0 ? `(${x})` : String(x);
}
const clampNum = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const slug = (id: string) => id.replace(/[^A-Za-z0-9_]/g, '_');
const indent = (lines: string[]): string[] => lines.map((l) => (l ? `  ${l}` : l));
const short = (s: unknown) => String(s).slice(0, 40);

class Abort extends Error {}

interface Model {
  nodes: Map<string, { node: GraphNode; def: NodeDef }>;
  edges: GraphEdge[];
  dataIn: Map<string, GraphEdge>;
  flowOut: Map<string, GraphEdge[]>;
}

// ------------------------------------------------------------------ Prüfung

function buildModel(graph: GraphSpec, errors: GraphIssue[]): Model {
  const nodes: Model['nodes'] = new Map();
  const edges: GraphEdge[] = [];
  const dataIn: Model['dataIn'] = new Map();
  const flowOut: Model['flowOut'] = new Map();
  const err = (message: string, nodeId?: string) => errors.push(nodeId ? { nodeId, message } : { message });
  const label = (id: string) => {
    const e = nodes.get(id);
    return e ? `„${e.def.title}“ (${id})` : `„${short(id)}“`;
  };

  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    err('Der Graph ist ungültig aufgebaut.');
    return { nodes, edges, dataIn, flowOut };
  }
  if (graph.nodes.length > GRAPH_LIMITS.maxNodes) err(`Zu viele Knoten (${graph.nodes.length}, höchstens ${GRAPH_LIMITS.maxNodes}).`);
  if (graph.edges.length > GRAPH_LIMITS.maxEdges) err(`Zu viele Verbindungen (${graph.edges.length}, höchstens ${GRAPH_LIMITS.maxEdges}).`);
  if (errors.length) return { nodes, edges, dataIn, flowOut };

  const slugs = new Map<string, string>();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || !ID_RE.test(node.id)) {
      err(`Ungültige Knoten-ID „${short((node as GraphNode | undefined)?.id)}“ (erlaubt: Buchstaben, Ziffern, _ und -, höchstens 40 Zeichen).`);
      continue;
    }
    if (nodes.has(node.id)) {
      err(`Die Knoten-ID „${node.id}“ kommt mehrfach vor.`);
      continue;
    }
    const d = getNodeDef(node.type);
    if (!d) {
      err(`Unbekannter Knotentyp „${short(node.type)}“ (Knoten ${node.id}).`, node.id);
      continue;
    }
    const s = slug(node.id);
    if (slugs.has(s)) err(`Die Knoten-IDs „${slugs.get(s)}“ und „${node.id}“ sind sich zu ähnlich.`, node.id);
    slugs.set(s, node.id);
    nodes.set(node.id, { node, def: d });
  }

  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const f = edge?.from;
    const t = edge?.to;
    if (!f || !t || typeof f.node !== 'string' || typeof t.node !== 'string' || typeof f.port !== 'string' || typeof t.port !== 'string') {
      err('Eine Verbindung ist unvollständig.');
      continue;
    }
    const a = nodes.get(f.node);
    const b = nodes.get(t.node);
    if (!a || !b) {
      if (!a && !graph.nodes.some((n) => n?.id === f.node)) err(`Verbindung von unbekanntem Knoten „${short(f.node)}“.`);
      if (!b && !graph.nodes.some((n) => n?.id === t.node)) err(`Verbindung zu unbekanntem Knoten „${short(t.node)}“.`);
      continue;
    }
    const po = a.def.outputs.find((p) => p.id === f.port);
    const pi = b.def.inputs.find((p) => p.id === t.port);
    if (!po) {
      err(`${label(f.node)} hat keinen Ausgang „${short(f.port)}“ (vorhanden: ${a.def.outputs.map((p) => p.id).join(', ') || 'keine'}).`, f.node);
      continue;
    }
    if (!pi) {
      err(`${label(t.node)} hat keinen Eingang „${short(t.port)}“ (vorhanden: ${b.def.inputs.map((p) => p.id).join(', ') || 'keine'}).`, t.node);
      continue;
    }
    if (po.kind !== pi.kind && !(po.kind === 'number' && pi.kind === 'text')) {
      err(`Verbindung ${label(f.node)}.${f.port} (${KIND_DE[po.kind]}) → ${label(t.node)}.${t.port} (${KIND_DE[pi.kind]}) ist nicht erlaubt.`, t.node);
      continue;
    }
    const key = `${f.node}.${f.port}>${t.node}.${t.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(edge);
    if (pi.kind === 'flow') {
      const k = `${f.node}.${f.port}`;
      flowOut.set(k, [...(flowOut.get(k) ?? []), edge]);
    } else {
      const k = `${t.node}.${t.port}`;
      if (dataIn.has(k)) err(`Der Eingang „${pi.label || pi.id}“ von ${label(t.node)} hat mehrere Quellen.`, t.node);
      dataIn.set(k, edge);
    }
  }

  // Zyklen (Daten und Ablauf)
  const adj = new Map<string, string[]>();
  for (const e of edges) adj.set(e.from.node, [...(adj.get(e.from.node) ?? []), e.to.node]);
  const color = new Map<string, 1 | 2>();
  const stack: string[] = [];
  let cycleFound = false;
  const dfs = (id: string): void => {
    if (cycleFound) return;
    color.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      if (cycleFound) return;
      if (color.get(next) === 1) {
        const path = [...stack.slice(stack.indexOf(next)), next];
        err(`Der Graph enthält eine Schleife: ${path.map(label).join(' → ')}. Schleifen sind nicht erlaubt (nutze „Wiederholen“).`, next);
        cycleFound = true;
        return;
      }
      if (!color.has(next)) dfs(next);
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const id of nodes.keys()) if (!color.has(id) && !cycleFound) dfs(id);

  // Variablenarten
  const kinds = new Map<string, string>();
  for (const { node, def: d } of nodes.values()) {
    const k = VAR_KIND[d.type];
    if (!k) continue;
    const name = typeof node.params?.name === 'string' ? node.params.name.trim() : String(d.params.find((p) => p.id === 'name')?.default);
    if (!name || name.length > 40) {
      err(`${label(node.id)}: Der Variablenname muss 1 bis 40 Zeichen lang sein.`, node.id);
      continue;
    }
    const prev = kinds.get(name);
    if (prev && prev !== k) err(`Die Variable „${name}“ wird als ${KIND_DE[prev as PortKind]} und als ${KIND_DE[k]} benutzt – eine Variable hat nur eine Art.`, node.id);
    kinds.set(name, k);
  }
  return { nodes, edges, dataIn, flowOut };
}

function reachability(model: Model, warnings: GraphIssue[]): void {
  const label = (id: string) => `„${model.nodes.get(id)!.def.title}“ (${id})`;
  const reach = new Set<string>();
  const queue: string[] = [];
  for (const [id, { def: d }] of model.nodes) if (d.category === 'Ereignisse') (reach.add(id), queue.push(id));
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of model.edges) {
      if (e.from.node !== id || model.nodes.get(e.to.node)!.def.inputs.find((p) => p.id === e.to.port)?.kind !== 'flow') continue;
      if (!reach.has(e.to.node)) (reach.add(e.to.node), queue.push(e.to.node));
    }
  }
  const pending = [...reach];
  while (pending.length) {
    const id = pending.pop()!;
    for (const e of model.dataIn.values()) {
      if (e.to.node === id && !reach.has(e.from.node)) (reach.add(e.from.node), pending.push(e.from.node));
    }
  }
  for (const [id, { def: d }] of model.nodes) {
    if (d.category === 'Ereignisse') {
      if (!d.outputs.some((p) => p.kind === 'flow' && model.flowOut.has(`${id}.${p.id}`))) warnings.push({ nodeId: id, message: `${label(id)} ist mit nichts verbunden und tut nichts.` });
    } else if (!reach.has(id)) {
      warnings.push({ nodeId: id, message: `${label(id)} hängt an keinem Ereignis und wird nie ausgeführt.` });
    }
  }
}

// ------------------------------------------------------------------ Quelltext

interface Ev {
  id: string;
  type: string;
  avatar: boolean;
  outs: Record<string, string>;
  loops: Set<string>;
}

function generate(model: Model, errors: GraphIssue[]): string {
  const states = new Map<string, string>();
  const helpers = new Set<string>();
  const vars = new Map<string, { ident: string; kind: 'number' | 'text' | 'boolean' }>();
  const hoisted = new Map<string, string>();
  const reported = new Set<string>();
  let emitted = 0;

  const label = (id: string) => `„${model.nodes.get(id)!.def.title}“ (${id})`;
  const err = (message: string, nodeId?: string) => {
    const key = `${nodeId}|${message}`;
    if (reported.has(key)) return;
    reported.add(key);
    errors.push(nodeId ? { nodeId, message } : { message });
  };

  // Variablen-Bezeichner in Reihenfolge der Knoten
  for (const { node, def: d } of model.nodes.values()) {
    const k = VAR_KIND[d.type];
    if (!k) continue;
    const name = String(node.params?.name ?? d.params.find((p) => p.id === 'name')!.default).trim();
    if (!vars.has(name)) vars.set(name, { ident: `__v${vars.size + 1}_${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`, kind: k });
  }

  /** Geprüfter Parameterwert. */
  function param(id: string, pid: string): ParamValue {
    const { node, def: d } = model.nodes.get(id)!;
    const pd = d.params.find((p) => p.id === pid) as ParamDef;
    const raw = node.params?.[pid];
    if (raw === undefined) return pd.default;
    const bad = (why: string): ParamValue => {
      err(`${label(id)}: ${pd.label} – ${why}.`, id);
      return pd.default;
    };
    switch (pd.kind) {
      case 'number':
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return bad('eine Zahl erwartet');
        return clampNum(raw, pd.min ?? -1e9, pd.max ?? 1e9);
      case 'text':
        return typeof raw === 'string' ? raw.slice(0, MAX_TEXT) : bad('ein Text erwartet');
      case 'boolean':
        return typeof raw === 'boolean' ? raw : bad('Ja oder Nein erwartet');
      case 'color':
        return typeof raw === 'string' && COLOR_RE.test(raw) ? raw.toLowerCase() : bad('Farbe im Format #RRGGBB erwartet');
      case 'select':
        return typeof raw === 'string' && pd.options?.some((o) => o.value === raw) ? raw : bad(`ungültige Auswahl (erlaubt: ${pd.options?.map((o) => o.value).join(', ')})`);
    }
  }
  function lit(id: string, pid: string): string {
    const v = param(id, pid);
    return typeof v === 'string' ? js(v) : typeof v === 'number' ? numLit(v) : String(v);
  }
  const stateName = (id: string, init: string) => {
    const n = `__g_${slug(id)}`;
    if (!states.has(n)) states.set(n, init);
    return n;
  };
  const varIdent = (id: string) => {
    const name = String(param(id, 'name')).trim();
    return vars.get(name)!.ident;
  };

  function inp(id: string, port: string, ev: Ev): string {
    const edge = model.dataIn.get(`${id}.${port}`);
    if (!edge) return lit(id, port);
    const src = model.nodes.get(edge.from.node)!;
    const dstKind = model.nodes.get(id)!.def.inputs.find((p) => p.id === port)!.kind;
    const srcKind = src.def.outputs.find((p) => p.id === edge.from.port)!.kind;
    const e = outExpr(edge.from.node, edge.from.port, ev);
    return srcKind === 'number' && dstKind === 'text' ? `String(${e})` : e;
  }

  function outExpr(id: string, port: string, ev: Ev): string {
    const h = hoisted.get(id);
    if (h) return h;
    const { def: d } = model.nodes.get(id)!;
    const a = (p: string) => inp(id, p, ev);
    if (EVENTS[d.type]) {
      if (EVENTS[d.type].fn !== EVENTS[ev.type].fn) {
        err(`${label(id)}: Der Wert „${port}“ steht in diesem Ablauf nicht zur Verfügung (er gehört zu einem anderen Ereignis).`, id);
        return '0';
      }
      return EVENTS[d.type].outs[port] ?? '0';
    }
    switch (d.type) {
      case 'number':
      case 'text':
      case 'boolean':
      case 'color':
        return lit(id, 'value');
      case 'random': {
        const [lo, hi] = [a('min'), a('max')];
        return param(id, 'whole') === true ? `Math.floor(${lo} + Math.random() * (${hi} - ${lo} + 1))` : `(${lo} + Math.random() * (${hi} - ${lo}))`;
      }
      case 'random_color':
        helpers.add('randomColor');
        return '__g_randomColor()';
      case 'math': {
        const [x, y] = [a('a'), a('b')];
        switch (param(id, 'op')) {
          case 'add':
            return `(${x} + ${y})`;
          case 'sub':
            return `(${x} - ${y})`;
          case 'mul':
            return `(${x} * ${y})`;
          case 'div':
            helpers.add('div');
            return `__g_div(${x}, ${y})`;
          case 'min':
            return `Math.min(${x}, ${y})`;
          case 'max':
            return `Math.max(${x}, ${y})`;
          default:
            helpers.add('mod');
            return `__g_mod(${x}, ${y})`;
        }
      }
      case 'clamp':
        return `Math.max(${a('min')}, Math.min(${a('max')}, ${a('value')}))`;
      case 'lerp': {
        const [x, y, t] = [a('a'), a('b'), a('t')];
        return `(${x} + (${y} - ${x}) * ${t})`;
      }
      case 'time':
        return 'world.time()';
      case 'text_join':
        return `(String(${a('a')}) + String(${a('b')}))`;
      case 'number_to_text':
        return `Number(${a('value')}).toFixed(${Math.round(Number(param(id, 'decimals')))})`;
      case 'compare': {
        const ops: Record<string, string> = { eq: '===', ne: '!==', lt: '<', le: '<=', gt: '>', ge: '>=' };
        return `(${a('a')} ${ops[String(param(id, 'op'))]} ${a('b')})`;
      }
      case 'and':
        return `(${a('a')} && ${a('b')})`;
      case 'or':
        return `(${a('a')} || ${a('b')})`;
      case 'not':
        return `(!${a('value')})`;
      case 'is_empty':
        return `(String(${a('text')}).trim().length === 0)`;
      case 'text_contains':
        return param(id, 'ignoreCase') === true
          ? `String(${a('text')}).toLowerCase().includes(String(${a('part')}).toLowerCase())`
          : `String(${a('text')}).includes(String(${a('part')}))`;
      case 'get_var':
      case 'get_var_text':
      case 'get_var_boolean':
        return varIdent(id);
      case 'get_state':
        return `String(self.getState(${a('key')}) ?? '')`;
      case 'get_state_number':
        return `(Number(self.getState(${a('key')})) || 0)`;
      case 'toggle':
        return stateName(id, 'false');
      case 'counter':
        return stateName(id, '0');
      case 'repeat':
        if (!ev.loops.has(id)) {
          err(`${label(id)}: Die Nummer gibt es nur innerhalb von „Jedes Mal“.`, id);
          return '0';
        }
        return `__i_${slug(id)}`;
      default:
        err(`${label(id)} kann keinen Wert liefern.`, id);
        return '0';
    }
  }

  const out = (id: string, port: string, ev: Ev): string[] => {
    const lines: string[] = [];
    for (const e of model.flowOut.get(`${id}.${port}`) ?? []) lines.push(...emitNode(e.to.node, e.to.port, ev));
    return lines;
  };

  function randomDeps(id: string, acc: string[], seenIds: Set<string>): void {
    for (const p of model.nodes.get(id)!.def.inputs) {
      const edge = model.dataIn.get(`${id}.${p.id}`);
      if (!edge || seenIds.has(edge.from.node)) continue;
      seenIds.add(edge.from.node);
      randomDeps(edge.from.node, acc, seenIds);
      if (RANDOM_TYPES.has(model.nodes.get(edge.from.node)!.def.type) && !hoisted.has(edge.from.node)) acc.push(edge.from.node);
    }
  }

  function emitNode(id: string, entry: string, ev: Ev): string[] {
    if (++emitted > MAX_EMITTED) {
      err('Der Graph ist zu stark verzweigt (zu viel erzeugter Code).');
      throw new Abort();
    }
    const deps: string[] = [];
    randomDeps(id, deps, new Set());
    const saved = new Map(hoisted);
    const pre: string[] = [];
    for (const dep of deps) {
      const name = `__r_${slug(id)}_${slug(dep)}`;
      pre.push(`const ${name} = ${outExpr(dep, 'value', ev)};`);
      hoisted.set(dep, name);
    }
    const body = emitBody(id, entry, ev);
    hoisted.clear();
    for (const [k, v] of saved) hoisted.set(k, v);
    return deps.length ? ['{', ...indent([...pre, ...body]), '}'] : body;
  }

  function emitBody(id: string, entry: string, ev: Ev): string[] {
    const { def: d } = model.nodes.get(id)!;
    const a = (p: string) => inp(id, p, ev);
    const then = () => out(id, 'then', ev);
    const call = (stmt: string) => [stmt, ...then()];
    const xyz = (names = ['x', 'y', 'z']) => names.map(a).join(', ');
    switch (d.type) {
      case 'set_color':
        return call(`self.setColor(${a('color')});`);
      case 'set_emissive':
        return call(`self.setEmissive(${a('color')});`);
      case 'set_alpha':
        return call(`self.setAlpha(${a('alpha')});`);
      case 'move':
        return call(`self.move(${xyz(['dx', 'dy', 'dz'])});`);
      case 'set_position':
        return call(`self.setPosition(${xyz()});`);
      case 'rotate':
        return call(`self.rotate(${xyz(['dx', 'dy', 'dz'])});`);
      case 'set_rotation':
        return call(`self.setRotation(${xyz()});`);
      case 'set_scale':
        return call(`self.setScale(${xyz()});`);
      case 'set_particles':
        return call(`self.setParticles(${a('on')}, ${lit(id, 'preset')});`);
      case 'apply_impulse':
        return call(`self.applyImpulse(${xyz()});`);
      case 'set_physics':
        return call(`self.setPhysics(${lit(id, 'mode')});`);
      case 'say':
        return call(`self.say(${a('text')});`);
      case 'play_sound':
        return call(`world.playSound(${lit(id, 'name')});`);
      case 'play_tone':
        return call(`world.playTone(${a('freq')}, ${a('dur')});`);
      case 'send_message': {
        const noData = !model.dataIn.has(`${id}.data`) && param(id, 'data') === '';
        return call(`world.send(${a('target')}, ${a('message')}${noData ? '' : `, ${a('data')}`});`);
      }
      case 'broadcast': {
        const noData = !model.dataIn.has(`${id}.data`) && param(id, 'data') === '';
        return call(`world.broadcast(${a('message')}${noData ? '' : `, ${a('data')}`});`);
      }
      case 'teleport_avatar':
        if (!ev.avatar) {
          err(`${label(id)} geht nur nach „Beim Anklicken“, „Bei Berührung“, „Betritt/Verlässt Bereich“ oder „Bei Chat“ (dort gibt es einen Avatar).`, id);
          return [];
        }
        return call(`world.teleportAvatar(avatar.id, ${xyz()});`);
      case 'set_image':
        return call(`self.setImage(${a('url')});`);
      case 'set_url':
        return call(`self.setUrl(${a('url')});`);
      case 'set_text':
        return call(`self.setText(${a('text')});`);
      case 'next_slide':
        return call('self.nextSlide();');
      case 'prev_slide':
        return call('self.prevSlide();');
      case 'set_var':
      case 'set_var_text':
      case 'set_var_boolean':
        return call(`${varIdent(id)} = ${a('value')};`);
      case 'change_var':
        return call(`${varIdent(id)} += ${a('amount')};`);
      case 'set_state':
      case 'set_state_number':
        return call(`self.setState(${a('key')}, ${a('value')});`);
      case 'branch':
      case 'random_branch': {
        const cond = d.type === 'branch' ? a('condition') : `Math.random() < ${a('chance')}`;
        const t = out(id, 'true', ev);
        const f = out(id, 'false', ev);
        if (!t.length && !f.length) return [];
        if (!t.length) return [`if (!(${cond})) {`, ...indent(f), '}'];
        return [`if (${cond}) {`, ...indent(t), ...(f.length ? ['} else {', ...indent(f)] : []), '}'];
      }
      case 'wait': {
        const body = then();
        if (!body.length) return [];
        const ms = model.dataIn.has(`${id}.seconds`)
          ? `Math.round(Math.max(0, Math.min(3600, ${a('seconds')})) * 1000)`
          : String(Math.round(Number(param(id, 'seconds')) * 1000));
        return ['setTimeout(() => {', ...indent(body), `}, ${ms});`];
      }
      case 'repeat': {
        const n = model.dataIn.has(`${id}.count`)
          ? `Math.max(0, Math.min(${MAX_REPEAT}, Math.floor(${a('count')})))`
          : String(Math.min(MAX_REPEAT, Math.floor(Number(param(id, 'count')))));
        const lv = `__i_${slug(id)}`;
        ev.loops.add(id);
        const body = out(id, 'body', ev);
        ev.loops.delete(id);
        return [...(body.length ? [`for (let ${lv} = 0; ${lv} < ${n}; ${lv}++) {`, ...indent(body), '}'] : []), ...then()];
      }
      case 'sequence':
        return ['o1', 'o2', 'o3', 'o4'].flatMap((p) => out(id, p, ev));
      case 'toggle': {
        const st = stateName(id, 'false');
        const [x, y] = [out(id, 'a', ev), out(id, 'b', ev)];
        const lines = [`${st} = !${st};`];
        if (x.length || y.length) lines.push(`if (${st}) {`, ...indent(x), ...(y.length ? ['} else {', ...indent(y)] : []), '}');
        return lines;
      }
      case 'counter': {
        const st = stateName(id, '0');
        if (entry === 'reset') return [`${st} = 0;`];
        const limit = Math.floor(Number(param(id, 'limit')));
        const reached = limit > 0 ? out(id, 'reached', ev) : [];
        const lines = [`${st} += ${lit(id, 'step')};`, ...then()];
        if (limit > 0) lines.push(`if (${st} >= ${limit}) {`, ...indent([...reached, `${st} = 0;`]), '}');
        return lines;
      }
      case 'once': {
        const st = stateName(id, 'false');
        const body = then();
        return body.length ? [`if (!${st}) {`, ...indent([`${st} = true;`, ...body]), '}'] : [];
      }
      default:
        err(`${label(id)}: Dieser Knoten kann nicht im Ablauf stehen.`, id);
        return [];
    }
  }

  // Ereignis-Funktionen
  const handlers = new Map<string, { args: string; blocks: string[] }>();
  try {
    for (const { node, def: d } of model.nodes.values()) {
      const info = EVENTS[d.type];
      if (!info) continue;
      const ev: Ev = { id: node.id, type: d.type, avatar: info.avatar, outs: info.outs, loops: new Set() };
      let body = out(node.id, 'then', ev);
      if (!body.length) continue;
      const head = `// ${d.title} (${node.id})`;
      if (d.type === 'on_tick') {
        const every = Number(param(node.id, 'every'));
        if (every > 0) {
          const st = stateName(node.id, '0');
          body = [`${st} += dt;`, `if (${st} >= ${every}) {`, ...indent([`${st} -= ${every};`, ...body]), '}'];
        }
      } else if (d.type === 'on_message') {
        const f = String(param(node.id, 'message'));
        if (f) body = [`if (message === ${js(f)}) {`, ...indent(body), '}'];
      } else if (d.type === 'on_chat') {
        const f = String(param(node.id, 'contains'));
        if (f) body = [`if (String(text).toLowerCase().includes(${js(f.toLowerCase())})) {`, ...indent(body), '}'];
      } else if (d.type === 'on_timer') {
        const ms = Math.round(Number(param(node.id, 'seconds')) * 1000);
        body = [`${param(node.id, 'repeat') === true ? 'setInterval' : 'setTimeout'}(() => {`, ...indent(body), `}, ${ms});`];
      }
      const h = handlers.get(info.fn) ?? { args: info.args, blocks: [] };
      h.blocks.push(head, ...body);
      handlers.set(info.fn, h);
    }
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
  }

  const lines: string[] = ['// Automatisch aus dem Logik-Graphen erzeugt – Änderungen am Graphen ersetzen dieses Skript.'];
  const section = (...ls: string[]) => {
    if (ls.length) lines.push('', ...ls);
  };
  section(...[...helpers].sort().flatMap((k, i) => (i ? ['', ...HELPERS[k]] : HELPERS[k])));
  section(...[...vars.entries()].map(([n, v]) => `let ${v.ident} = ${VAR_INIT[v.kind]}; // Variable ${js(n)}`));
  section(...[...states].map(([n, init]) => `let ${n} = ${init};`));
  for (const fn of HANDLER_ORDER) {
    const h = handlers.get(fn);
    if (!h) continue;
    section(`function ${fn}(${h.args}) {`, ...indent(h.blocks), '}');
  }
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------ Öffentliche API

export function compileGraph(graph: GraphSpec): CompileResult {
  const errors: GraphIssue[] = [];
  const warnings: GraphIssue[] = [];
  const model = buildModel(graph, errors);
  if (errors.length) return { source: '', errors, warnings };
  reachability(model, warnings);
  const source = generate(model, errors);
  return errors.length ? { source: '', errors, warnings } : { source, errors, warnings };
}

/** Prüft Struktur, Typen der Verbindungen, Grenzen (GRAPH_LIMITS) und Zyklen; nur Fehler, ohne Quelltext. */
export function validateGraph(graph: GraphSpec): GraphIssue[] {
  return compileGraph(graph).errors;
}

export interface ResolvedScript {
  source: string;
  enabled: boolean;
  /** Fehler des (aktivierten) Graphen; dann wurde auf `entity.script` zurückgefallen. */
  graphErrors: GraphIssue[];
  fromGraph: boolean;
}

/** Wie `entityScriptSource`, meldet zusätzlich die Fehler eines aktivierten, fehlerhaften Graphen. */
export function resolveEntityScript(entity: Pick<EntitySpec, 'script' | 'graph'>): ResolvedScript | null {
  let graphErrors: GraphIssue[] = [];
  const g = entity.graph;
  if (g && g.enabled !== false && Array.isArray(g.nodes) && g.nodes.length > 0) {
    const r = compileGraph(g);
    if (!r.errors.length) return { source: r.source, enabled: true, graphErrors, fromGraph: true };
    graphErrors = r.errors;
  }
  if (entity.script) return { source: entity.script.source, enabled: entity.script.enabled, graphErrors, fromGraph: false };
  return graphErrors.length ? { source: '', enabled: false, graphErrors, fromGraph: false } : null;
}

/**
 * Der Quelltext, den die Skript-Laufzeit für diese Entity ausführen soll:
 * ein aktivierter, fehlerfreier Graph hat Vorrang vor `entity.script`.
 * Rückgabe null = nichts auszuführen.
 */
export function entityScriptSource(entity: Pick<EntitySpec, 'script' | 'graph'>): { source: string; enabled: boolean } | null {
  const r = resolveEntityScript(entity);
  if (!r || (!r.fromGraph && !entity.script)) return null;
  return { source: r.source, enabled: r.enabled };
}
