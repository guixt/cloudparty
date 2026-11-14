/** Antwort der KI auswerten: Codeblock holen und gegen die dokumentierte API prüfen. */
import { AI_LIMITS } from '../../../../shared/aiTools';
import { SCRIPT_SELF_API, SCRIPT_WORLD_API } from '../../../../shared/scriptApi';
import { checkSyntax, describeIssue, isWorldMember } from '../logic';

export interface ExtractResult {
  code: string;
  explanation: string;
  warnings: string[];
}

export class ExtractError extends Error {}

const SELF_NAMES = new Set(SCRIPT_SELF_API.map((d) => d.name));
const WORLD_NAMES = new Set(SCRIPT_WORLD_API.filter(isWorldMember).map((d) => d.name));

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bimport\s*\(/, 'import('],
  [/\beval\s*\(/, 'eval'],
  [/\bFunction\s*\(/, 'Function('],
  [/\bimportScripts\b/, 'importScripts'],
];

const FENCE = /```[ \t]*([\w+-]*)[^\n]*\n([\s\S]*?)```/g;

/** Findet den ersten js-Block (sonst den ersten Block) und den restlichen Text. */
export function splitAnswer(text: string): { code: string | null; rest: string } {
  const blocks = [...text.matchAll(FENCE)];
  const js = blocks.find((m) => /^(js|javascript|jsx)$/i.test(m[1])) ?? blocks.find((m) => m[1] === '') ?? null;
  if (!js) return { code: null, rest: text.trim() };
  const rest = (text.slice(0, js.index) + text.slice((js.index ?? 0) + js[0].length)).replace(/```[\s\S]*?```/g, '').trim();
  return { code: js[2].replace(/\s+$/, '') + '\n', rest };
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/** Statische Prüfung gegen die dokumentierte API; liefert deutsche Warnungen. */
export function checkApiUsage(code: string): string[] {
  const warnings: string[] = [];
  const src = stripComments(code);
  const seen = new Set<string>();
  for (const m of src.matchAll(/(?<![\w$.])(self|world)\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
    const [, obj, member] = m;
    const known = obj === 'self' ? SELF_NAMES : WORLD_NAMES;
    const key = `${obj}.${member}`;
    if (!known.has(member) && !seen.has(key)) {
      seen.add(key);
      warnings.push(`„${key}" gehört nicht zur dokumentierten Skript-API und funktioniert vermutlich nicht.`);
    }
  }
  for (const [re, label] of FORBIDDEN) {
    if (re.test(src)) warnings.push(`„${label}" ist im Skript-Worker nicht erlaubt (kein Netzwerk, kein dynamischer Code).`);
  }
  return warnings;
}

/** Wirft ExtractError (deutsche Meldung), wenn kein brauchbarer Code enthalten ist. */
export function extractScript(text: string): ExtractResult {
  const { code, rest } = splitAnswer(text);
  if (code === null) throw new ExtractError('Die Antwort enthält keinen Code-Block.');
  if (code.trim() === '') throw new ExtractError('Der Code-Block der Antwort ist leer.');
  if (new TextEncoder().encode(code).length > AI_LIMITS.maxScriptBytes) {
    throw new ExtractError(`Das erzeugte Skript ist zu lang (mehr als ${AI_LIMITS.maxScriptBytes} Zeichen).`);
  }
  const warnings: string[] = [];
  const issue = checkSyntax(code);
  if (issue) warnings.push(`Syntaxfehler im erzeugten Skript – ${describeIssue(issue)}`);
  warnings.push(...checkApiUsage(code));
  return { code, explanation: rest, warnings };
}
