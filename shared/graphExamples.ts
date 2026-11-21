/**
 * Beispiel-Graphen (Vorlagen im Editor, Beispiele für die KI) – Paket 18.
 * Aufgebaut aus der Kompaktform, damit sie lesbar bleiben.
 */
import type { CompactGraph, GraphSpec } from './graph';
import { compactToGraph } from './graphCompact';

export interface GraphExample {
  id: string;
  title: string;
  description: string;
  graph: GraphSpec;
}

const ex = (id: string, title: string, description: string, compact: CompactGraph): GraphExample => ({ id, title, description, graph: compactToGraph(compact) });

export const GRAPH_EXAMPLES: GraphExample[] = [
  ex('tuer', 'Tür', 'Ein Klick öffnet die Tür (dreht sie um 90°), der nächste schließt sie wieder.', {
    nodes: [
      { id: 'klick', type: 'on_click' },
      { id: 'schalter', type: 'toggle' },
      { id: 'auf', type: 'rotate', params: { dy: 90 } },
      { id: 'zu', type: 'rotate', params: { dy: -90 } },
      { id: 'ton', type: 'play_sound', params: { name: 'whoosh' } },
    ],
    connections: ['klick.then -> schalter.in', 'schalter.a -> auf.in', 'schalter.b -> zu.in', 'auf.then -> ton.in', 'zu.then -> ton.in'],
  }),
  ex('lichtschalter', 'Lichtschalter', 'Ein Klick schaltet die Lampe ein oder aus: Der Schalter leuchtet und schickt eine Nachricht an das Objekt „Lampe“.', {
    nodes: [
      { id: 'klick', type: 'on_click' },
      { id: 'schalter', type: 'toggle' },
      { id: 'an', type: 'set_emissive', params: { color: '#66ff66' } },
      { id: 'aus', type: 'set_emissive', params: { color: '#000000' } },
      { id: 'msgAn', type: 'send_message', params: { target: 'Lampe', message: 'an' } },
      { id: 'msgAus', type: 'send_message', params: { target: 'Lampe', message: 'aus' } },
    ],
    connections: ['klick.then -> schalter.in', 'schalter.a -> an.in', 'an.then -> msgAn.in', 'schalter.b -> aus.in', 'aus.then -> msgAus.in'],
  }),
  ex('lampe', 'Lampe', 'Leuchtet bei der Nachricht „an“ und geht bei „aus“ wieder aus. Passend zum Lichtschalter (Objektname „Lampe“).', {
    nodes: [
      { id: 'start', type: 'on_start' },
      { id: 'dunkel', type: 'set_emissive', params: { color: '#000000' } },
      { id: 'msgAn', type: 'on_message', params: { message: 'an' } },
      { id: 'hell', type: 'set_emissive', params: { color: '#ffee88' } },
      { id: 'ding', type: 'play_sound', params: { name: 'click' } },
      { id: 'msgAus', type: 'on_message', params: { message: 'aus' } },
      { id: 'dunkel2', type: 'set_emissive', params: { color: '#000000' } },
    ],
    connections: ['start.then -> dunkel.in', 'msgAn.then -> hell.in', 'hell.then -> ding.in', 'msgAus.then -> dunkel2.in'],
  }),
  ex('farbwechsler', 'Farbwechsler', 'Alle 2 Sekunden bekommt das Objekt eine neue zufällige Farbe.', {
    nodes: [
      { id: 'timer', type: 'on_timer', params: { seconds: 2, repeat: true } },
      { id: 'farbe', type: 'set_color' },
      { id: 'zufall', type: 'random_color' },
    ],
    connections: ['timer.then -> farbe.in', 'zufall.value -> farbe.color'],
  }),
  ex('begruesser', 'Begrüßer', 'Wer den Bereich betritt, wird mit Namen begrüßt; beim Verlassen gibt es einen Abschied. (Physik-Modus „Trigger“ einstellen.)', {
    nodes: [
      { id: 'rein', type: 'on_trigger_enter' },
      { id: 'hallo', type: 'say' },
      { id: 'gruss', type: 'text_join', params: { a: 'Hallo ' } },
      { id: 'raus', type: 'on_trigger_exit' },
      { id: 'tschuess', type: 'say', params: { text: 'Tschüss!' } },
    ],
    connections: ['rein.then -> hallo.in', 'rein.name -> gruss.b', 'gruss.result -> hallo.text', 'raus.then -> tschuess.in'],
  }),
  ex('zaehler', 'Zähler', 'Zählt die Klicks und sagt die Zahl. Beim fünften Klick gibt es Konfetti, danach beginnt er von vorn.', {
    nodes: [
      { id: 'klick', type: 'on_click' },
      { id: 'zaehler', type: 'counter', params: { limit: 5 } },
      { id: 'sagen', type: 'say' },
      { id: 'text', type: 'text_join', params: { a: 'Klicks: ' } },
      { id: 'zahlText', type: 'number_to_text' },
      { id: 'konfetti', type: 'set_particles', params: { preset: 'confetti' } },
      { id: 'warten', type: 'wait', params: { seconds: 3 } },
      { id: 'ende', type: 'set_particles', params: { on: false, preset: 'confetti' } },
    ],
    connections: [
      'klick.then -> zaehler.in',
      'zaehler.then -> sagen.in',
      'zaehler.value -> zahlText.value',
      'zahlText.result -> text.b',
      'text.result -> sagen.text',
      'zaehler.reached -> konfetti.in',
      'konfetti.then -> warten.in',
      'warten.then -> ende.in',
    ],
  }),
  ex('aufzug', 'Aufzug', 'Alle 6 Sekunden fährt der Aufzug 3 m hoch bzw. wieder runter und meldet die Ankunft mit einem Ton.', {
    nodes: [
      { id: 'takt', type: 'on_tick', params: { every: 6 } },
      { id: 'schalter', type: 'toggle' },
      { id: 'hoch', type: 'move', params: { dy: 3 } },
      { id: 'runter', type: 'move', params: { dy: -3 } },
      { id: 'warten', type: 'wait', params: { seconds: 0.5 } },
      { id: 'ton', type: 'play_sound', params: { name: 'ding' } },
    ],
    connections: ['takt.then -> schalter.in', 'schalter.a -> hoch.in', 'schalter.b -> runter.in', 'hoch.then -> warten.in', 'runter.then -> warten.in', 'warten.then -> ton.in'],
  }),
  ex('sprungfeld', 'Sprungfeld', 'Bei Berührung bekommt das (bewegliche) Objekt einen Stoß nach oben. Physik-Modus „Beweglich“ einstellen.', {
    nodes: [
      { id: 'touch', type: 'on_touch' },
      { id: 'stoss', type: 'apply_impulse', params: { x: 0, y: 6, z: 0 } },
      { id: 'pop', type: 'play_sound', params: { name: 'pop' } },
    ],
    connections: ['touch.then -> stoss.in', 'stoss.then -> pop.in'],
  }),
  ex('diashow-fernbedienung', 'Diashow-Fernbedienung', 'Ein Klick schickt „weiter“ an das Objekt „Tafel“.', {
    nodes: [
      { id: 'klick', type: 'on_click' },
      { id: 'senden', type: 'send_message', params: { target: 'Tafel', message: 'weiter' } },
      { id: 'ton', type: 'play_sound', params: { name: 'click' } },
    ],
    connections: ['klick.then -> senden.in', 'senden.then -> ton.in'],
  }),
  ex('diashow-tafel', 'Diashow-Tafel', 'Blättert bei „weiter“ eine Folie vor und bei „zurück“ eine zurück. Passend zur Fernbedienung (Objektname „Tafel“).', {
    nodes: [
      { id: 'weiter', type: 'on_message', params: { message: 'weiter' } },
      { id: 'vor', type: 'next_slide' },
      { id: 'zurueck', type: 'on_message', params: { message: 'zurück' } },
      { id: 'zur', type: 'prev_slide' },
    ],
    connections: ['weiter.then -> vor.in', 'zurueck.then -> zur.in'],
  }),
  ex('teleporter', 'Teleporter', 'Wer den Bereich betritt, wird auf eine Plattform in 5 m Höhe versetzt (wirkt nur auf den eigenen Avatar).', {
    nodes: [
      { id: 'rein', type: 'on_trigger_enter' },
      { id: 'weg', type: 'teleport_avatar', params: { x: 0, y: 5, z: 0 } },
    ],
    connections: ['rein.then -> weg.in'],
  }),
];
