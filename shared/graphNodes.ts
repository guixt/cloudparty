/**
 * Katalog der Knoten des Logik-Graphen (Paket 18).
 * Die Namen (type) und Port-IDs hier sind Teil des gespeicherten Formats: nach Auslieferung nicht umbenennen.
 * Regel: Ein Daten-Eingang ohne Verbindung nimmt den Parameter mit gleicher ID (siehe shared/graph.ts).
 */
import type { NodeCategory, NodeDef, ParamDef, ParamValue, PortDef, PortKind } from './graph';
import { NODE_CATEGORIES } from './graph';

const FLOW_IN: PortDef = { id: 'in', label: '', kind: 'flow' };
const THEN: PortDef = { id: 'then', label: 'Dann', kind: 'flow' };
const flowOut = (id: string, label: string): PortDef => ({ id, label, kind: 'flow' });
const out = (id: string, label: string, kind: PortKind): PortDef => ({ id, label, kind });

type Opt = { min?: number; max?: number; step?: number };
const num = (id: string, label: string, def: number, o: Opt = {}): ParamDef => ({ id, label, kind: 'number', default: def, ...o });
const txt = (id: string, label: string, def = ''): ParamDef => ({ id, label, kind: 'text', default: def });
const bool = (id: string, label: string, def: boolean): ParamDef => ({ id, label, kind: 'boolean', default: def });
const col = (id: string, label: string, def: string): ParamDef => ({ id, label, kind: 'color', default: def });
const sel = (id: string, label: string, def: string, options: [string, string][]): ParamDef => ({
  id,
  label,
  kind: 'select',
  default: def,
  options: options.map(([value, label]) => ({ value, label })),
});

/** Daten-Eingang samt gleichnamigem Parameter. */
const data = (p: ParamDef): { port: PortDef; param: ParamDef } => ({
  port: { id: p.id, label: p.label, kind: p.kind === 'select' ? 'text' : (p.kind as PortKind) },
  param: p,
});

function def(
  type: string,
  title: string,
  category: NodeCategory,
  description: string,
  parts: { flowIn?: PortDef[]; data?: ParamDef[]; outputs?: PortDef[]; params?: ParamDef[] },
): NodeDef {
  const ds = (parts.data ?? []).map(data);
  return {
    type,
    title,
    category,
    description,
    inputs: [...(parts.flowIn ?? []), ...ds.map((d) => d.port)],
    outputs: parts.outputs ?? [],
    params: [...ds.map((d) => d.param), ...(parts.params ?? [])],
  };
}

const event = (type: string, title: string, description: string, outputs: PortDef[], params: ParamDef[] = []) =>
  def(type, title, 'Ereignisse', description, { outputs: [THEN, ...outputs], params });
const action = (type: string, title: string, description: string, dataParams: ParamDef[], params: ParamDef[] = [], category: NodeCategory = 'Aktionen') =>
  def(type, title, category, description, { flowIn: [FLOW_IN], data: dataParams, outputs: [THEN], params });
const value = (type: string, title: string, description: string, dataParams: ParamDef[], outputs: PortDef[], params: ParamDef[] = [], category: NodeCategory = 'Werte') =>
  def(type, title, category, description, { data: dataParams, outputs, params });

const xyz = (prefix: string, dflt: [number, number, number], labels: [string, string, string], o: Opt = {}) =>
  ['x', 'y', 'z'].map((a, i) => num(prefix + (prefix ? a.toUpperCase() : a), labels[i], dflt[i], { min: -1000000, max: 1000000, step: 0.1, ...o }));
const delta = (labels: [string, string, string]) => ['dx', 'dy', 'dz'].map((id, i) => num(id, labels[i], 0, { min: -1000000, max: 1000000, step: 0.1 }));

const SOUNDS: [string, string][] = [
  ['click', 'Klick'],
  ['ding', 'Ding'],
  ['pop', 'Pop'],
  ['whoosh', 'Wusch'],
  ['error', 'Fehler'],
];

export const NODE_DEFS: NodeDef[] = [
  // ---------------------------------------------------------------- Ereignisse
  event('on_start', 'Beim Start', 'Startet einmal, wenn das Skript geladen wird.', []),
  event('on_click', 'Beim Anklicken', 'Startet, wenn ein Avatar das Objekt anklickt.', [out('name', 'Name des Avatars', 'text')]),
  event('on_touch', 'Bei Berührung', 'Startet, wenn ein Avatar das Objekt berührt.', [out('name', 'Name des Avatars', 'text')]),
  event('on_trigger_enter', 'Betritt Bereich', 'Startet, wenn ein Avatar den Trigger-Bereich des Objekts betritt (Physik-Modus „Trigger“).', [out('name', 'Name des Avatars', 'text')]),
  event('on_trigger_exit', 'Verlässt Bereich', 'Startet, wenn ein Avatar den Trigger-Bereich verlässt.', [out('name', 'Name des Avatars', 'text')]),
  event(
    'on_tick',
    'Laufend',
    'Startet regelmäßig (ca. 20-mal pro Sekunde) oder alle N Sekunden.',
    [out('dt', 'Zeitschritt (s)', 'number'), out('time', 'Zeit (s)', 'number')],
    [num('every', 'Alle … Sekunden (0 = jeden Takt)', 0, { min: 0, max: 3600, step: 0.1 })],
  ),
  event(
    'on_message',
    'Bei Nachricht',
    'Startet, wenn ein anderes Objekt eine Nachricht schickt.',
    [out('data', 'Daten', 'text'), out('number', 'Daten als Zahl', 'number'), out('sender', 'Absender-ID', 'text')],
    [txt('message', 'Nachricht (leer = alle)')],
  ),
  event(
    'on_chat',
    'Bei Chat',
    'Startet, wenn jemand im Chat schreibt.',
    [out('text', 'Text', 'text'), out('name', 'Name', 'text')],
    [txt('contains', 'Enthält (leer = alles)')],
  ),
  event(
    'on_timer',
    'Nach Zeit',
    'Startet nach einer Wartezeit, auf Wunsch wiederholt.',
    [],
    [num('seconds', 'Sekunden', 1, { min: 0.05, max: 3600, step: 0.1 }), bool('repeat', 'Wiederholen', false)],
  ),

  // ---------------------------------------------------------------- Aktionen
  action('set_color', 'Farbe setzen', 'Setzt die Farbe des Objekts.', [col('color', 'Farbe', '#ff0000')]),
  action('set_emissive', 'Leuchten setzen', 'Setzt die Leuchtfarbe („#000000“ = aus).', [col('color', 'Farbe', '#ffee88')]),
  action('set_alpha', 'Durchsichtigkeit', 'Setzt die Deckkraft (0 = unsichtbar, 1 = voll).', [num('alpha', 'Deckkraft', 1, { min: 0, max: 1, step: 0.05 })]),
  action('move', 'Verschieben', 'Verschiebt das Objekt relativ (Meter).', delta(['dx (Meter)', 'dy (Meter)', 'dz (Meter)'])),
  action('set_position', 'Position setzen', 'Setzt die Position im Raum.', xyz('', [0, 0, 0], ['X', 'Y', 'Z'])),
  action('rotate', 'Drehen', 'Dreht das Objekt relativ (Grad).', delta(['dx (Grad)', 'dy (Grad)', 'dz (Grad)'])),
  action('set_rotation', 'Drehung setzen', 'Setzt die Drehung (Grad).', xyz('', [0, 0, 0], ['X (Grad)', 'Y (Grad)', 'Z (Grad)'], { min: -3600, max: 3600, step: 1 })),
  action('set_scale', 'Größe setzen', 'Setzt die Größe des Objekts.', xyz('', [1, 1, 1], ['X', 'Y', 'Z'], { min: 0.01, max: 1000, step: 0.1 })),
  action('set_particles', 'Partikel', 'Schaltet Partikeleffekte ein oder aus.', [bool('on', 'An', true)], [
    sel('preset', 'Effekt', 'confetti', [
      ['fire', 'Feuer'],
      ['sparks', 'Funken'],
      ['smoke', 'Rauch'],
      ['confetti', 'Konfetti'],
    ]),
  ]),
  action('apply_impulse', 'Stoß geben', 'Gibt einem dynamischen Physikobjekt einen Stoß.', xyz('', [0, 5, 0], ['X', 'Y', 'Z'], { min: -1000, max: 1000 })),
  action('set_physics', 'Physik-Modus', 'Wechselt den Physik-Modus des Objekts.', [], [
    sel('mode', 'Modus', 'static', [
      ['none', 'Keine'],
      ['static', 'Fest'],
      ['dynamic', 'Beweglich'],
      ['trigger', 'Trigger'],
    ]),
  ]),
  action('say', 'Sagen', 'Gibt einen Text im Chat aus.', [txt('text', 'Text', 'Hallo!')]),
  action('play_sound', 'Ton abspielen', 'Spielt einen Standardton.', [], [sel('name', 'Ton', 'ding', SOUNDS)]),
  action('play_tone', 'Ton erzeugen', 'Spielt einen Sinuston.', [
    num('freq', 'Frequenz (Hz)', 440, { min: 20, max: 20000, step: 10 }),
    num('dur', 'Dauer (s)', 0.3, { min: 0.05, max: 5, step: 0.05 }),
  ]),
  action('send_message', 'Nachricht senden', 'Schickt eine Nachricht an das Skript eines anderen Objekts (Name oder ID).', [
    txt('target', 'Ziel (Name oder ID)'),
    txt('message', 'Nachricht', 'hallo'),
    txt('data', 'Daten'),
  ]),
  action('broadcast', 'An alle senden', 'Schickt eine Nachricht an alle Skripte der Insel.', [txt('message', 'Nachricht', 'hallo'), txt('data', 'Daten')]),
  action(
    'teleport_avatar',
    'Avatar teleportieren',
    'Versetzt den auslösenden Avatar (nur nach Klick, Berührung, Trigger oder Chat; wirkt nur auf den lokalen Avatar).',
    xyz('', [0, 1, 0], ['X', 'Y', 'Z']),
  ),

  // ---------------------------------------------------------------- Medien
  action('set_image', 'Bild setzen', 'Setzt das Bild einer Medien-Fläche.', [txt('url', 'Bild-Adresse')], [], 'Medien'),
  action('set_url', 'Adresse setzen', 'Setzt Webseite oder Video einer Medien-Fläche.', [txt('url', 'Adresse')], [], 'Medien'),
  action('set_text', 'Text setzen', 'Setzt den Text einer Text-Fläche.', [txt('text', 'Text', 'Hallo!')], [], 'Medien'),
  action('next_slide', 'Nächste Folie', 'Blättert auf einer Folien-Fläche vor.', [], [], 'Medien'),
  action('prev_slide', 'Vorherige Folie', 'Blättert auf einer Folien-Fläche zurück.', [], [], 'Medien'),

  // ---------------------------------------------------------------- Ablauf
  def('branch', 'Wenn … dann', 'Ablauf', 'Führt je nach Bedingung den einen oder den anderen Zweig aus.', {
    flowIn: [FLOW_IN],
    data: [bool('condition', 'Bedingung', true)],
    outputs: [flowOut('true', 'Ja'), flowOut('false', 'Nein')],
  }),
  def('wait', 'Warten', 'Ablauf', 'Wartet, bevor der Ablauf weitergeht.', {
    flowIn: [FLOW_IN],
    data: [num('seconds', 'Sekunden', 1, { min: 0, max: 3600, step: 0.1 })],
    outputs: [THEN],
  }),
  def('repeat', 'Wiederholen', 'Ablauf', 'Führt den Zweig mehrmals nacheinander aus (höchstens 100-mal).', {
    flowIn: [FLOW_IN],
    data: [num('count', 'Anzahl', 3, { min: 0, max: 100, step: 1 })],
    outputs: [flowOut('body', 'Jedes Mal'), THEN, out('index', 'Nummer (ab 0)', 'number')],
  }),
  def('sequence', 'Der Reihe nach', 'Ablauf', 'Führt die Ausgänge nacheinander aus.', {
    flowIn: [FLOW_IN],
    outputs: [flowOut('o1', 'Erst'), flowOut('o2', 'Dann'), flowOut('o3', 'Danach'), flowOut('o4', 'Zuletzt')],
  }),
  def('toggle', 'Umschalter', 'Ablauf', 'Wechselt bei jedem Durchlauf zwischen A und B (beginnt mit A). Merkt sich den Zustand.', {
    flowIn: [FLOW_IN],
    outputs: [flowOut('a', 'A'), flowOut('b', 'B'), out('on', 'Zustand A', 'boolean')],
  }),
  def('counter', 'Zähler', 'Ablauf', 'Zählt bei jedem Durchlauf hoch. Mit „Ziel“ > 0 beginnt er danach wieder bei 0.', {
    flowIn: [FLOW_IN, { id: 'reset', label: 'Zurücksetzen', kind: 'flow' }],
    outputs: [THEN, flowOut('reached', 'Ziel erreicht'), out('value', 'Wert', 'number')],
    params: [num('step', 'Schritt', 1, { min: -1000, max: 1000 }), num('limit', 'Ziel (0 = keins)', 0, { min: 0, max: 1000000, step: 1 })],
  }),
  def('once', 'Nur einmal', 'Ablauf', 'Lässt den Ablauf nur beim ersten Mal durch.', { flowIn: [FLOW_IN], outputs: [THEN] }),
  def('random_branch', 'Zufallsweiche', 'Ablauf', 'Wählt zufällig einen Zweig; „Chance“ ist die Wahrscheinlichkeit für „Ja“.', {
    flowIn: [FLOW_IN],
    data: [num('chance', 'Chance (0–1)', 0.5, { min: 0, max: 1, step: 0.05 })],
    outputs: [flowOut('true', 'Ja'), flowOut('false', 'Nein')],
  }),

  // ---------------------------------------------------------------- Logik
  value('compare', 'Vergleichen', 'Vergleicht zwei Zahlen.', [num('a', 'A', 0), num('b', 'B', 0)], [out('result', 'Ergebnis', 'boolean')], [
    sel('op', 'Vergleich', 'eq', [
      ['eq', 'gleich'],
      ['ne', 'ungleich'],
      ['lt', 'kleiner'],
      ['le', 'kleiner oder gleich'],
      ['gt', 'größer'],
      ['ge', 'größer oder gleich'],
    ]),
  ], 'Logik'),
  value('and', 'Und', 'Wahr, wenn beide wahr sind.', [bool('a', 'A', true), bool('b', 'B', true)], [out('result', 'Ergebnis', 'boolean')], [], 'Logik'),
  value('or', 'Oder', 'Wahr, wenn mindestens eins wahr ist.', [bool('a', 'A', false), bool('b', 'B', false)], [out('result', 'Ergebnis', 'boolean')], [], 'Logik'),
  value('not', 'Nicht', 'Kehrt wahr und falsch um.', [bool('value', 'Wert', true)], [out('result', 'Ergebnis', 'boolean')], [], 'Logik'),
  value('is_empty', 'Text ist leer', 'Wahr, wenn der Text leer ist.', [txt('text', 'Text')], [out('result', 'Ergebnis', 'boolean')], [], 'Logik'),
  value(
    'text_contains',
    'Text enthält',
    'Wahr, wenn der Text das Stück enthält.',
    [txt('text', 'Text'), txt('part', 'Stück')],
    [out('result', 'Ergebnis', 'boolean')],
    [bool('ignoreCase', 'Groß/Klein ignorieren', true)],
    'Logik',
  ),

  // ---------------------------------------------------------------- Werte
  value('number', 'Zahl', 'Eine feste Zahl.', [], [out('value', 'Wert', 'number')], [num('value', 'Wert', 1)]),
  value('text', 'Text', 'Ein fester Text.', [], [out('value', 'Wert', 'text')], [txt('value', 'Wert')]),
  value('boolean', 'Wahrheitswert', 'Wahr oder falsch.', [], [out('value', 'Wert', 'boolean')], [bool('value', 'Wert', true)]),
  value('color', 'Farbe', 'Eine feste Farbe.', [], [out('value', 'Wert', 'color')], [col('value', 'Wert', '#ff8800')]),
  value(
    'random',
    'Zufallszahl',
    'Eine Zufallszahl zwischen Min und Max.',
    [num('min', 'Min', 0), num('max', 'Max', 1)],
    [out('value', 'Wert', 'number')],
    [bool('whole', 'Ganze Zahl', false)],
  ),
  value('random_color', 'Zufallsfarbe', 'Eine zufällige, kräftige Farbe.', [], [out('value', 'Farbe', 'color')]),
  value(
    'math',
    'Rechnen',
    'Rechnet mit zwei Zahlen.',
    [num('a', 'A', 0), num('b', 'B', 1)],
    [out('value', 'Ergebnis', 'number')],
    [
      sel('op', 'Rechenart', 'add', [
        ['add', '+'],
        ['sub', '−'],
        ['mul', '×'],
        ['div', '÷'],
        ['min', 'Minimum'],
        ['max', 'Maximum'],
        ['mod', 'Rest (mod)'],
      ]),
    ],
  ),
  value('clamp', 'Begrenzen', 'Hält eine Zahl zwischen Min und Max.', [num('value', 'Wert', 0), num('min', 'Min', 0), num('max', 'Max', 1)], [out('result', 'Ergebnis', 'number')]),
  value('lerp', 'Mischen', 'Mischt zwischen A (t = 0) und B (t = 1).', [num('a', 'A', 0), num('b', 'B', 1), num('t', 't (0–1)', 0.5)], [out('result', 'Ergebnis', 'number')]),
  value('time', 'Zeit', 'Sekunden seit dem Start des Skripts.', [], [out('value', 'Sekunden', 'number')]),
  value('text_join', 'Text verbinden', 'Hängt zwei Texte aneinander.', [txt('a', 'A'), txt('b', 'B')], [out('result', 'Text', 'text')]),
  value(
    'number_to_text',
    'Zahl als Text',
    'Wandelt eine Zahl in Text um.',
    [num('value', 'Zahl', 0)],
    [out('result', 'Text', 'text')],
    [num('decimals', 'Nachkommastellen', 0, { min: 0, max: 6, step: 1 })],
  ),

  // ---------------------------------------------------------------- Variablen
  action('set_var', 'Zahl-Variable setzen', 'Setzt eine Zahl-Variable dieses Objekts.', [num('value', 'Wert', 0)], [txt('name', 'Name', 'zahl')], 'Variablen'),
  action('set_var_text', 'Text-Variable setzen', 'Setzt eine Text-Variable dieses Objekts.', [txt('value', 'Wert')], [txt('name', 'Name', 'text')], 'Variablen'),
  action('set_var_boolean', 'Ja/Nein-Variable setzen', 'Setzt eine Ja/Nein-Variable dieses Objekts.', [bool('value', 'Wert', true)], [txt('name', 'Name', 'schalter')], 'Variablen'),
  action('change_var', 'Zahl-Variable ändern', 'Addiert zu einer Zahl-Variable (negativ = abziehen).', [num('amount', 'Änderung', 1)], [txt('name', 'Name', 'zahl')], 'Variablen'),
  value('get_var', 'Zahl-Variable lesen', 'Der Wert einer Zahl-Variable (Start: 0).', [], [out('value', 'Wert', 'number')], [txt('name', 'Name', 'zahl')], 'Variablen'),
  value('get_var_text', 'Text-Variable lesen', 'Der Wert einer Text-Variable (Start: leer).', [], [out('value', 'Wert', 'text')], [txt('name', 'Name', 'text')], 'Variablen'),
  value('get_var_boolean', 'Ja/Nein-Variable lesen', 'Der Wert einer Ja/Nein-Variable (Start: falsch).', [], [out('value', 'Wert', 'boolean')], [txt('name', 'Name', 'schalter')], 'Variablen'),
  action('set_state', 'Zustand speichern (Text)', 'Speichert einen Text im Objektzustand (bleibt erhalten).', [txt('key', 'Schlüssel', 'zustand'), txt('value', 'Wert')], [], 'Variablen'),
  action('set_state_number', 'Zustand speichern (Zahl)', 'Speichert eine Zahl im Objektzustand.', [txt('key', 'Schlüssel', 'zustand'), num('value', 'Wert', 0)], [], 'Variablen'),
  value('get_state', 'Zustand lesen (Text)', 'Liest einen Text aus dem Objektzustand.', [txt('key', 'Schlüssel', 'zustand')], [out('value', 'Wert', 'text')], [], 'Variablen'),
  value('get_state_number', 'Zustand lesen (Zahl)', 'Liest eine Zahl aus dem Objektzustand (0, wenn leer).', [txt('key', 'Schlüssel', 'zustand')], [out('value', 'Wert', 'number')], [], 'Variablen'),
];

const BY_TYPE = new Map<string, NodeDef>(NODE_DEFS.map((d) => [d.type, d]));

export function getNodeDef(type: string): NodeDef | undefined {
  return BY_TYPE.get(type);
}

export function nodesByCategory(): { category: NodeCategory; nodes: NodeDef[] }[] {
  return NODE_CATEGORIES.map((category) => ({ category, nodes: NODE_DEFS.filter((d) => d.category === category) })).filter((g) => g.nodes.length > 0);
}

/** Standardwerte der Parameter eines Knotentyps. */
export function defaultParams(type: string): Record<string, ParamValue> {
  const params: Record<string, ParamValue> = {};
  for (const p of BY_TYPE.get(type)?.params ?? []) params[p.id] = p.default;
  return params;
}
