/** Reine Funktionen der Editor-KI; `ask` wird injiziert (Paket 13 liefert `askClaude`). */
import type { AskClaude } from '../../../ai/api';
import { AI_LIMITS } from '../../../../shared/aiTools';
import { buildExplainPrompt, buildExplainSystemPrompt, buildGeneratePrompt, buildGenerateSystemPrompt, type GenerateContext } from './prompts';
import { extractScript, splitAnswer, type ExtractResult } from './extract';

export const MAX_LOG_LINES = 30;

export interface GenerateArgs extends GenerateContext {
  ask: AskClaude;
  description: string;
  currentSource?: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

/** Erzeugt ein Skript; wirft bei Fehlern von `ask` oder unbrauchbarer Antwort (ExtractError). */
export async function generateScript(args: GenerateArgs): Promise<ExtractResult> {
  const description = args.description.trim();
  if (!description) throw new Error('Bitte beschreibe zuerst, was das Objekt tun soll.');
  const result = await args.ask({
    system: buildGenerateSystemPrompt(),
    prompt: buildGeneratePrompt(description, args, args.currentSource),
    maxTokens: AI_LIMITS.maxOutputTokens,
    signal: args.signal,
    onDelta: args.onDelta,
  });
  return extractScript(result.text);
}

export interface ExplainArgs {
  ask: AskClaude;
  source: string;
  logLines: readonly string[];
  status: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}
export interface ExplainResult {
  /** Reiner Text, nie HTML. */
  explanation: string;
  fix: ExtractResult | null;
}

export async function explainError(args: ExplainArgs): Promise<ExplainResult> {
  const lines = args.logLines.slice(-MAX_LOG_LINES);
  const result = await args.ask({
    system: buildExplainSystemPrompt(),
    prompt: buildExplainPrompt(args.source, lines, args.status),
    maxTokens: AI_LIMITS.maxOutputTokens,
    signal: args.signal,
    onDelta: args.onDelta,
  });
  const { code, rest } = splitAnswer(result.text);
  let fix: ExtractResult | null = null;
  if (code !== null) {
    try {
      fix = extractScript(result.text);
    } catch {
      fix = null;
    }
  }
  return { explanation: rest, fix };
}
