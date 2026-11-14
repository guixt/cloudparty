import { describe, expect, it } from 'vitest';
import type { AskClaude } from '../../../ai/api';
import { AI_LIMITS } from '../../../../shared/aiTools';
import { SCRIPT_EVENTS, SCRIPT_SELF_API, SCRIPT_WORLD_API } from '../../../../shared/scriptApi';
import { diffLines } from './diff';
import { checkApiUsage, extractScript, ExtractError } from './extract';
import { explainError, generateScript } from './generate';
import { buildGenerateSystemPrompt } from './prompts';

const fake = (text: string, deltas: string[] = []): AskClaude => async (o) => {
  for (const d of deltas) o.onDelta?.(d);
  return { text, inputTokens: 1, outputTokens: 1 };
};

describe('prompts', () => {
  it('nennt alle API-Namen und das Ausgabeformat', () => {
    const p = buildGenerateSystemPrompt();
    for (const e of SCRIPT_EVENTS) expect(p).toContain(e.name);
    for (const d of [...SCRIPT_SELF_API, ...SCRIPT_WORLD_API]) expect(p).toContain(d.name);
    expect(p).toContain('```js');
    expect(p).toContain('höchstens 3 kurze deutsche Sätze');
    expect(p).toContain('Web Worker');
  });
});

describe('extract', () => {
  it('nimmt den ersten js-Block und trennt die Erklärung', () => {
    const r = extractScript('```js\nfunction onClick(){ self.say("a"); }\n```\nKurz erklärt.\n```js\nlet x;\n```');
    expect(r.code).toBe('function onClick(){ self.say("a"); }\n');
    expect(r.explanation).toBe('Kurz erklärt.');
    expect(r.warnings).toEqual([]);
  });
  it('wirft ohne Block, bei leerem und zu großem Code', () => {
    expect(() => extractScript('nur Text')).toThrow(ExtractError);
    expect(() => extractScript('```js\n\n```')).toThrow(ExtractError);
    expect(() => extractScript('```js\n' + 'a'.repeat(AI_LIMITS.maxScriptBytes + 1) + '\n```')).toThrow(/zu lang/);
  });
  it('warnt bei Syntaxfehler', () => {
    expect(extractScript('```js\nfunction (\n```').warnings[0]).toMatch(/Syntaxfehler/);
  });
  it('markiert unbekannte API und verbotene Konstrukte', () => {
    expect(checkApiUsage('self.fly(); self.say("x"); world.send("a","b")')).toEqual([expect.stringContaining('self.fly')]);
    expect(checkApiUsage('fetch("http://x")')[0]).toContain('fetch');
    expect(checkApiUsage('// fetch(x)\nself.id')).toEqual([]);
    expect(checkApiUsage('eval("1"); import("x")').length).toBe(2);
  });
});

describe('diff', () => {
  const kinds = (a: string, b: string) => diffLines(a, b).map((d) => (d.type === 'same' ? '=' : d.type === 'add' ? '+' : '-') + d.text).join('|');
  it('identisch', () => expect(kinds('a\nb', 'a\nb')).toBe('=a|=b'));
  it('Einfügen und Löschen', () => {
    expect(kinds('a\nc', 'a\nb\nc')).toBe('=a|+b|=c');
    expect(kinds('a\nb\nc', 'a\nc')).toBe('=a|-b|=c');
  });
  it('Ersetzen und leere Seite', () => {
    expect(kinds('a\nb\nc', 'a\nX\nc')).toBe('=a|-b|+X|=c');
    expect(kinds('', 'x\ny')).toBe('+x|+y');
    expect(kinds('x', '')).toBe('-x');
  });
});

describe('generate', () => {
  const base = { name: 'Schalter', description: 'Farbe wechseln' };
  it('streamt und liefert Code', async () => {
    const got: string[] = [];
    const r = await generateScript({ ...base, ask: fake('```js\nfunction onClick(){}\n```\nOk.', ['a', 'b']), onDelta: (d) => got.push(d) });
    expect(got).toEqual(['a', 'b']);
    expect(r.code).toContain('onClick');
  });
  it('reicht Abbruch und Fehler durch', async () => {
    const ac = new AbortController();
    const ask: AskClaude = async (o) => {
      expect(o.signal).toBe(ac.signal);
      throw new Error('Abgebrochen.');
    };
    await expect(generateScript({ ...base, ask, signal: ac.signal })).rejects.toThrow('Abgebrochen.');
    await expect(generateScript({ ...base, description: ' ', ask })).rejects.toThrow(/beschreibe/);
  });
  it('nimmt aktuelles Skript und Objektnamen in den Prompt', async () => {
    let prompt = '';
    const ask: AskClaude = async (o) => ((prompt = o.prompt), { text: '```js\nlet a;\n```', inputTokens: 0, outputTokens: 0 });
    await generateScript({ ...base, ask, currentSource: 'let alt;', otherNames: ['Tür'] });
    expect(prompt).toContain('let alt;');
    expect(prompt).toContain('„Tür"');
  });
});

describe('explainError', () => {
  it('kürzt Log auf 30 Zeilen und trennt Korrektur', async () => {
    let prompt = '';
    const ask: AskClaude = async (o) => ((prompt = o.prompt), { text: 'Variable fehlt.\n```js\nlet x = 1;\n```', inputTokens: 0, outputTokens: 0 });
    const lines = Array.from({ length: 40 }, (_, i) => `zeile${i}`);
    const r = await explainError({ ask, source: 'x', logLines: lines, status: 'error' });
    expect(prompt).not.toContain('zeile9\n');
    expect(prompt).toContain('zeile10');
    expect(prompt).toContain('zeile39');
    expect(r.explanation).toBe('Variable fehlt.');
    expect(r.fix?.code).toBe('let x = 1;\n');
  });
  it('ohne Codeblock keine Korrektur; HTML bleibt Text', async () => {
    const r = await explainError({ ask: fake('<img src=x onerror=alert(1)>'), source: '', logLines: [], status: 'ok' });
    expect(r.fix).toBeNull();
    expect(r.explanation).toBe('<img src=x onerror=alert(1)>');
  });
});
