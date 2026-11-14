/**
 * Eingabe-Budget pro Anfrage. Es gibt keine genaue Token-Zählung im Browser; wir schätzen
 * vorsichtig (deutscher Text und JSON: etwa 3 Zeichen pro Token) und kürzen lieber etwas zu viel.
 */
import { AiError, type ApiMessage, type ApiTool, type ContentBlock } from './client';

const CHARS_PER_TOKEN = 3;
/** Große Werkzeugergebnisse werden beim Kürzen auf diese Länge gebracht. */
const SHRUNK_RESULT_CHARS = 1500;
const SHRUNK_NOTE = '\n…[gekürzt wegen des Eingabelimits]';

export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function tooLongError(budget: number, needed: number): AiError {
  return new AiError(
    `Die Eingabe ist zu lang für das eingestellte Limit (etwa ${needed.toLocaleString('de-DE')} von ${budget.toLocaleString('de-DE')} Tokens). Erhöhe die maximale Eingabelänge in den KI-Einstellungen oder starte ein neues Gespräch.`,
  );
}

function shrinkResults(messages: ApiMessage[], total: () => number, budget: number): ApiMessage[] {
  const out = messages.map((m) => ({ ...m }));
  // Älteste Werkzeugergebnisse zuerst; die letzte Nachricht (aktuelle Ergebnisse) bleibt möglichst unberührt.
  for (let i = 0; i < out.length - 1 && total() > budget; i++) {
    const msg = out[i];
    if (!Array.isArray(msg.content)) continue;
    msg.content = msg.content.map((block): ContentBlock => {
      if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > SHRUNK_RESULT_CHARS) {
        return { ...block, content: block.content.slice(0, SHRUNK_RESULT_CHARS) + SHRUNK_NOTE };
      }
      return block;
    });
  }
  return out;
}

/**
 * Bringt eine Anfrage unter das Eingabe-Budget:
 * 1. ältere Gesprächsteile vor `currentFrom` (Index der aktuellen Nutzernachricht) werden zuerst weggelassen,
 * 2. dann werden große Werkzeugergebnisse gekürzt,
 * 3. passt es dann immer noch nicht, wird mit einer verständlichen Meldung abgebrochen.
 * Die übergebene Liste wird nicht verändert.
 */
export function fitToBudget(args: { system: string; tools: ApiTool[]; messages: ApiMessage[]; currentFrom: number; budget: number }): ApiMessage[] {
  const { system, tools, budget } = args;
  const base = estimateTokens(system) + estimateTokens(tools);
  let messages = args.messages;
  let currentFrom = args.currentFrom;
  const total = () => base + estimateTokens(messages);
  if (total() <= budget) return messages;

  // 1. alte Gesprächsrunden (immer als Paar user/assistant) von vorn entfernen
  while (total() > budget && currentFrom >= 2) {
    messages = messages.slice(2);
    currentFrom -= 2;
  }
  if (total() <= budget) return messages;

  // 2. große Werkzeugergebnisse kürzen
  messages = shrinkResults(messages, total, budget);
  if (total() <= budget) return messages;

  throw tooLongError(budget, total());
}
