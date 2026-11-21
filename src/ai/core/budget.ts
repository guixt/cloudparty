/**
 * Eingabe-Budget pro Anfrage. Es gibt keine genaue Token-Zählung im Browser; wir schätzen
 * vorsichtig (deutscher Text und JSON: etwa 3 Zeichen pro Token) und kürzen lieber etwas zu viel.
 */
import { AiError, type ApiMessage, type ApiTool, type ContentBlock } from './client';

const CHARS_PER_TOKEN = 3;
/** Große Werkzeugergebnisse werden beim Kürzen auf diese Länge gebracht. */
const SHRUNK_RESULT_CHARS = 1500;
const MIN_RESULT_CHARS = 300;
const SHRUNK_NOTE = '\n…[gekürzt wegen des Eingabelimits]';

/** Feste Schätzung für ein Bild (800 × 500 Pixel ≈ 550 Tokens), statt das Base64 als Text zu zählen. */
export const IMAGE_TOKENS = 800;

export function estimateTokens(value: unknown): number {
  if (typeof value === 'string') return Math.ceil(value.length / CHARS_PER_TOKEN);
  let images = 0;
  const text =
    JSON.stringify(value, (_key, v) => {
      if (v && typeof v === 'object' && (v as { type?: unknown }).type === 'image') {
        images += 1;
        return { type: 'image' };
      }
      return v;
    }) ?? '';
  return Math.ceil(text.length / CHARS_PER_TOKEN) + images * IMAGE_TOKENS;
}

const IMAGE_REMOVED = '[Älteres Bild entfernt, um Platz zu sparen]';

/** Ersetzt Bilder in Werkzeugergebnissen durch einen Hinweistext; `keepLast` lässt die letzte Nachricht unberührt. Ändert die Liste nicht. */
export function dropImages(messages: ApiMessage[], keepLast: boolean): ApiMessage[] {
  const stop = keepLast ? messages.length - 1 : messages.length;
  return messages.map((msg, i) => {
    if (i >= stop || !Array.isArray(msg.content)) return msg;
    let changed = false;
    const content = msg.content.map((block): ContentBlock => {
      if (block.type !== 'tool_result' || !Array.isArray(block.content) || !block.content.some((p) => p.type === 'image')) return block;
      changed = true;
      return { ...block, content: block.content.map((p) => (p.type === 'image' ? { type: 'text' as const, text: IMAGE_REMOVED } : p)) };
    });
    return changed ? { ...msg, content } : msg;
  });
}

export function tooLongError(budget: number, needed: number): AiError {
  return new AiError(
    `Die Eingabe ist zu lang für das eingestellte Limit (etwa ${needed.toLocaleString('de-DE')} von ${budget.toLocaleString('de-DE')} Tokens). Erhöhe die maximale Eingabelänge in den KI-Einstellungen oder starte ein neues Gespräch.`,
  );
}

function shrinkResults(messages: ApiMessage[], total: () => number, budget: number, maxChars: number, includeLast: boolean): ApiMessage[] {
  const out = messages.map((m) => ({ ...m }));
  // Älteste Werkzeugergebnisse zuerst; die aktuellen Ergebnisse (letzte Nachricht) nur, wenn includeLast gesetzt ist.
  const stop = includeLast ? out.length : out.length - 1;
  for (let i = 0; i < stop && total() > budget; i++) {
    const msg = out[i];
    if (!Array.isArray(msg.content)) continue;
    msg.content = msg.content.map((block): ContentBlock => {
      if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > maxChars) {
        return { ...block, content: block.content.slice(0, maxChars) + SHRUNK_NOTE };
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

  // 0. ältere Bilder weglassen (die Schätzung pro Bild ist fest, aber sie belegen Platz)
  messages = dropImages(messages, true);
  if (total() <= budget) return messages;

  // 1. alte Gesprächsrunden (immer als Paar user/assistant) von vorn entfernen
  while (total() > budget && currentFrom >= 2) {
    messages = messages.slice(2);
    currentFrom -= 2;
  }
  if (total() <= budget) return messages;

  // 2. große Werkzeugergebnisse kürzen: erst ältere, dann auch die aktuellen, zuletzt sehr stark
  messages = shrinkResults(messages, total, budget, SHRUNK_RESULT_CHARS, false);
  if (total() <= budget) return messages;
  messages = shrinkResults(messages, total, budget, SHRUNK_RESULT_CHARS, true);
  if (total() <= budget) return messages;
  messages = shrinkResults(messages, total, budget, MIN_RESULT_CHARS, true);
  if (total() <= budget) return messages;

  throw tooLongError(budget, total());
}
