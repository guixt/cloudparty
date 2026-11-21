/** KI-Werkzeuge (Schemas): Skript-Tests und Skript-Protokoll. Die Handler stehen in src/ai/core. */
import type { AiToolDefinition } from './types';

export const scriptTestToolDefs: AiToolDefinition[] = [
  {
    name: 'script_log',
    description:
      'Liest das Skript-Protokoll und den Status eines Objekts (laufend, Fehler …): letzte Ausgaben von log()/console.log und Fehlermeldungen mit Zeilennummer. Ohne `id`: alle Objekte, deren Skript einen Fehler meldet. Skripte laufen nur im Spielmodus; für gezieltes Ausprobieren nutze script_test.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Objekt-id oder Name (optional)' } } },
    mutates: false,
  },
  {
    name: 'script_test',
    description:
      'Probiert das Skript eines Objekts aus: schaltet kurz in den Spielmodus, löst ein Ereignis aus (onClick, onTouch, onTriggerEnter, onTriggerExit, onChat mit `text`, onMessage mit `message`/`data`, oder `none` = nur warten, z. B. für onTick/onStart), wartet `wait_ms` (200–3000, Standard 1000) und meldet: Skript-Status, Protokollzeilen, Fehler, was Objekte im Chat gesagt haben, gesendete Nachrichten, Töne, erzeugte Objekte und alle geänderten Objekte mit Vorher/Nachher (Position, Farbe, Zustand …). Danach wird alles zurückgesetzt (`restore`, Standard true). Nutze das nach jedem set_script/set_graph und korrigiere Fehler, bis der Test sauber läuft. Höchstens 6 Tests pro Auftrag.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Objekt mit dem Skript (id oder Name)' },
        event: { enum: ['onClick', 'onTouch', 'onTriggerEnter', 'onTriggerExit', 'onChat', 'onMessage', 'none'] },
        text: { type: 'string', maxLength: 200, description: 'Chattext bei onChat' },
        message: { type: 'string', maxLength: 100, description: 'Nachricht bei onMessage' },
        data: { description: 'Daten bei onMessage (JSON)' },
        avatar_name: { type: 'string', maxLength: 40 },
        wait_ms: { type: 'number', minimum: 200, maximum: 3000 },
        restore: { type: 'boolean' },
      },
      required: ['id'],
    },
    mutates: true,
  },
];
