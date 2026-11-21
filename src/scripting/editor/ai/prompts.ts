/** Systemprompts der Editor-KI (Deutsch), erzeugt aus der dokumentierten Skript-API. */
import { AI_LIMITS } from '../../../../shared/aiTools';
import {
  SCRIPT_EVENTS,
  SCRIPT_EVENT_TIMEOUT_MS,
  SCRIPT_SELF_API,
  SCRIPT_SOUND_NAMES,
  SCRIPT_WORLD_API,
  type ScriptApiDoc,
} from '../../../../shared/scriptApi';

const docLines = (docs: readonly ScriptApiDoc[]) => docs.map((d) => `- ${d.signature}: ${d.description}`).join('\n');

function apiSection(): string {
  return [
    'Ereignisfunktionen (auf oberster Ebene definieren, nur bei Bedarf):',
    SCRIPT_EVENTS.map((e) => `- ${e.signature}: ${e.description}`).join('\n'),
    '',
    'Objekt `self` (das eigene Objekt):',
    docLines(SCRIPT_SELF_API),
    '',
    'Objekt `world` und globale Funktionen:',
    docLines(SCRIPT_WORLD_API),
    '',
    `Erlaubte Tonnamen für world.playSound: ${SCRIPT_SOUND_NAMES.map((s) => `'${s}'`).join(', ')}.`,
  ].join('\n');
}

const RULES = `Regeln:
- Das Skript läuft in einem isolierten Web Worker: kein DOM, kein Netzwerk (kein fetch, XMLHttpRequest, WebSocket, import, eval, new Function, importScripts). Verfügbar sind nur \`self\`, \`world\`, \`log\`/\`console.log\` und Timer (setTimeout, setInterval, clearTimeout, clearInterval).
- Ein einzelner Ereignisaufruf darf höchstens ${SCRIPT_EVENT_TIMEOUT_MS} ms dauern. Keine Endlosschleifen, nutze onTick oder Timer.
- Verwende ausschließlich die oben dokumentierten Namen. Erfinde keine Funktionen.
- Das Skript darf höchstens ${AI_LIMITS.maxScriptBytes} Zeichen lang sein. Kommentare im Code auf Deutsch, kurz.`;

const FORMAT = `Ausgabeformat (strikt):
1. Genau EIN Codeblock mit dem vollständigen JavaScript-Quelltext, in der Form \`\`\`js ... \`\`\`.
2. Danach höchstens 3 kurze deutsche Sätze, die erklären, was das Skript tut.
Kein weiterer Text, keine weiteren Codeblöcke.`;

export function buildGenerateSystemPrompt(): string {
  return [
    'Du bist der Skript-Assistent im Editor von Cloudparty, einer virtuellen Welt mit schwebenden Inseln. Du schreibst JavaScript-Skripte für einzelne Objekte. Antworte auf Deutsch.',
    '',
    'Skript-API:',
    apiSection(),
    '',
    RULES,
    '',
    FORMAT,
  ].join('\n');
}

export function buildExplainSystemPrompt(): string {
  return [
    'Du bist der Skript-Assistent im Editor von Cloudparty. Du erklärst Fehler in Objekt-Skripten, freundlich und verständlich für Einsteiger. Antworte auf Deutsch.',
    '',
    'Skript-API:',
    apiSection(),
    '',
    RULES,
    '',
    'Ausgabeformat (strikt):',
    '1. Eine kurze Erklärung der Ursache in höchstens 5 deutschen Sätzen (Klartext, kein Markdown außer dem Codeblock).',
    '2. Nur wenn du eine Korrektur vorschlagen kannst: danach GENAU EIN Codeblock ```js mit dem vollständigen korrigierten Skript.',
  ].join('\n');
}

export interface GenerateContext {
  name: string;
  ref?: string;
  otherNames?: readonly string[];
}

export function buildGeneratePrompt(description: string, ctx: GenerateContext, currentSource?: string): string {
  const parts = [`Objekt: „${ctx.name}"${ctx.ref ? ` (Baustein ${ctx.ref})` : ''}.`];
  if (ctx.otherNames?.length) {
    parts.push(`Andere Objekte auf der Insel (für world.send): ${ctx.otherNames.slice(0, 40).map((n) => `„${n}"`).join(', ')}.`);
  }
  if (currentSource && currentSource.trim()) {
    parts.push('Aktuelles Skript (als Ausgangspunkt, ändere es passend zum Wunsch und gib das vollständige neue Skript aus):', '```js', currentSource, '```');
  }
  parts.push(`Wunsch des Nutzers:\n${description.trim()}`);
  return parts.join('\n');
}

export function buildExplainPrompt(source: string, logLines: readonly string[], status: string): string {
  return [
    `Status des Skripts: ${status}`,
    'Letzte Zeilen der Skript-Konsole:',
    logLines.length ? logLines.join('\n') : '(keine Ausgaben)',
    '',
    'Aktuelles Skript:',
    '```js',
    source,
    '```',
    'Erkläre, was schiefgeht, und schlage eine Korrektur vor.',
  ].join('\n');
}
