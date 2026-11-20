/** Schutz für den Systemprompt: maskierte Backticks, Zahlen aus den Konstanten, Werkzeug-Abdeckung, Schema gegen echte Prüfungen. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_LIMITS, AI_RUN_LIMITS, AI_STORAGE_KEYS, AI_TOOLS } from '../../../shared/aiTools';
import { MAX_BRICK_STUDS } from '../../../shared/bricks';
import { EventBus } from '../../core/events';
import { createWorldStore } from '../../core/store';
import { FILL_BRICKS_MAX_OPENINGS, FILL_BRICKS_MAX_STUDS } from './brickTools';
import { buildSystemPrompt } from './prompt';
import { installLocalStorage } from './testUtils';
import { executeTool, type RunCounters, type ToolContext } from './tools';

const prompt = (limits?: Record<string, number>) => {
  installLocalStorage(limits ? { [AI_STORAGE_KEYS.runLimits]: JSON.stringify(limits) } : {});
  return buildSystemPrompt(createWorldStore(new EventBus()).getState());
};

describe('Backticks im Prompt-Quelltext', () => {
  it('im Haupt-Template-Literal stehen nur maskierte Backticks (außer in ${…}-Ausdrücken)', () => {
    const src = readFileSync(new URL('./prompt.ts', import.meta.url), 'utf8');
    const start = src.indexOf('return `Du bist der Bau-Assistent');
    expect(start).toBeGreaterThan(0);
    const end = src.lastIndexOf('`;');
    // Text ohne öffnenden Backtick und ohne ${…}-Ausdrücke (z. B. ${scriptApiReference()}).
    const text = src.slice(start + 'return `'.length, end).replace(/\$\{[^}]*\}/g, '');
    expect(text.match(/(?<!\\)`/g)).toBeNull();
    expect((text.match(/\\`/g) ?? []).length).toBeGreaterThan(0);
    // Insgesamt gerade Zahl unmaskierter Backticks im Quelltext: jedes Template-Literal ist geschlossen.
    expect((src.match(/(?<!\\)`/g) ?? []).length % 2).toBe(0);
  });
});

describe('Grenzen im Systemprompt', () => {
  it('Standardgrenzen stehen im Text und stimmen mit den Konstanten überein', () => {
    const p = prompt();
    const r = AI_RUN_LIMITS;
    expect(p).toContain(`höchstens ${r.maxRounds.default} Runden und ${r.maxToolCalls.default} Werkzeugaufrufe, höchstens ${r.maxNewEntities.default} neue Objekte pro Auftrag`);
    expect(p).toContain(`Insgesamt höchstens ${AI_LIMITS.maxNewEntities} neue Objekte pro Auftrag`);
    expect(p).toContain(`höchstens ${MAX_BRICK_STUDS} Noppen Breite oder Tiefe`);
    expect(p).toContain(`höchstens ${FILL_BRICKS_MAX_STUDS} × ${FILL_BRICKS_MAX_STUDS} Noppen und ${FILL_BRICKS_MAX_OPENINGS} Öffnungen`);
    expect(p).toContain(`mindestens ${String(AI_LIMITS.minSize).replace('.', ',')} m`);
    expect(p).toContain(`höchstens ${AI_LIMITS.maxImageSearches} Suchen und ${AI_LIMITS.maxImageDownloads} Bilder pro Auftrag`);
    expect(p).toContain(`zwischen ${AI_LIMITS.minSize} und ${AI_LIMITS.maxSize}`);
  });
  it('gesetzte runLimits erscheinen im Text', () => {
    const p = prompt({ maxRounds: 40, maxToolCalls: 300, maxNewEntities: 2500, maxImageSearches: 9, maxImageDownloads: 15 });
    expect(p).toContain('höchstens 40 Runden und 300 Werkzeugaufrufe, höchstens 2500 neue Objekte pro Auftrag');
    expect(p).toContain('Insgesamt höchstens 2500 neue Objekte pro Auftrag');
    expect(p).toContain('höchstens 9 Suchen und 15 Bilder pro Auftrag');
    expect(p).not.toContain('höchstens 200 neue Objekte');
  });
  it('keine Platzhalter-Reste im fertigen Text', () => {
    expect(prompt()).not.toMatch(/undefined|NaN|\[object/);
  });
});

describe('Werkzeuge im Prompt', () => {
  // Werkzeuge, die der Prompt absichtlich nicht namentlich nennt (Begründung je Eintrag).
  const EXCEPTIONS: Record<string, string> = {
    set_environment: 'Umgebung (Himmel, Licht) ist durch Schema und Werkzeugbeschreibung selbsterklärend; der Prompt spricht nur allgemein von „Umgebung gestalten“.',
    set_media: 'Tafel-Inhalte sind durch Schema und Beschreibung erklärt; der Prompt spricht von „Medien-Tafeln einrichten“.',
    move_avatar: 'Selbsterklärend durch die Werkzeugbeschreibung; der Prompt braucht keine Zusatzregeln.',
    plan_remove_node: 'Teil der Plan-Werkzeuge; der Prompt nennt plan_edit/plan_connect/plan_update_node, das Entfernen steht in der Werkzeugbeschreibung.',
  };
  it('jedes Werkzeug ist erwähnt oder steht begründet auf der Ausnahmeliste', () => {
    const p = prompt();
    const missing = AI_TOOLS.map((t) => t.name).filter((n) => !p.includes(n) && !(n in EXCEPTIONS));
    expect(missing).toEqual([]);
    for (const n of Object.keys(EXCEPTIONS)) expect(AI_TOOLS.some((t) => t.name === n)).toBe(true);
  });
});

describe('fill_bricks: Schema gegen echte Prüfungen', () => {
  const run = (input: unknown) => {
    const bus = new EventBus();
    const store = createWorldStore(bus);
    store.getState().setCanBuild(true);
    const ctx: ToolContext = { store, bus, getAvatar: () => ({ position: [0, 0, 6], yaw: 0 }), confirm: async () => true };
    const counters: RunCounters = { toolCalls: 0, newEntities: 0, removals: 0 };
    return executeTool('fill_bricks', input, ctx, counters);
  };
  const doors = (n: number) => Array.from({ length: n }, (_, i) => ({ side: 'north', at: 1 + i * 4, width: 2, layers: 2 }));

  it('Beschreibung nennt dieselben Zahlen wie der Code', () => {
    const tool = AI_TOOLS.find((t) => t.name === 'fill_bricks')!;
    expect(tool.description).toContain(`höchstens ${FILL_BRICKS_MAX_OPENINGS} Öffnungen`);
    expect(tool.description).toContain(`höchstens ${FILL_BRICKS_MAX_STUDS} Noppen`);
  });
  it('128 Zeilen und 16 Öffnungen gehen, 129 Zeilen und 17 Öffnungen nicht', async () => {
    expect(FILL_BRICKS_MAX_STUDS).toBe(128);
    expect(FILL_BRICKS_MAX_OPENINGS).toBe(16);
    expect((await run({ mode: 'floor', x: 0, z: 0, cols: 8, rows: 128, layers: 1 })).ok).toBe(true);
    expect((await run({ mode: 'floor', x: 0, z: 0, cols: 8, rows: 129, layers: 1 })).ok).toBe(false);
    expect((await run({ mode: 'floor', x: 0, z: 0, cols: 129, rows: 8, layers: 1 })).ok).toBe(false);
    expect((await run({ mode: 'wall', x: 0, z: 0, cols: 80, rows: 8, layers: 2, openings: doors(16) })).ok).toBe(true);
    const r17 = await run({ mode: 'wall', x: 0, z: 0, cols: 80, rows: 8, layers: 2, openings: doors(17) });
    expect(r17.ok).toBe(false);
    expect(r17.content).toContain(String(FILL_BRICKS_MAX_OPENINGS));
  });
});
