import { describe, expect, it } from 'vitest';
import { SCRIPT_EVENTS, SCRIPT_SELF_API, SCRIPT_WORLD_API } from '../../../shared/scriptApi';
import { SCRIPT_EXAMPLES } from './examples';
import { checkSyntax } from './logic';

const selfNames = new Set(SCRIPT_SELF_API.map((a) => a.name));
const worldNames = new Set(SCRIPT_WORLD_API.filter((a) => a.signature.startsWith('world.')).map((a) => a.name));
const eventNames = new Set<string>(SCRIPT_EVENTS.map((e) => e.name));

describe('Beispielskripte', () => {
  it('enthalten die geforderten Beispiele', () => {
    const titles = SCRIPT_EXAMPLES.map((e) => e.title).join('|');
    for (const t of ['Tür', 'Lichtschalter', 'Lampe', 'Aufzug', 'Sprungfeld', 'Farbwechsler', 'Konfetti', 'Begrüßer', 'Chat-Bot', 'Diashow']) {
      expect(titles).toContain(t);
    }
    expect(new Set(SCRIPT_EXAMPLES.map((e) => e.id)).size).toBe(SCRIPT_EXAMPLES.length);
  });

  for (const example of SCRIPT_EXAMPLES) {
    describe(example.title, () => {
      it('hat Beschreibung und Kommentare', () => {
        expect(example.description.length).toBeGreaterThan(10);
        expect(example.source).toMatch(/^\/\//);
      });
      it('ist gültiges JavaScript', () => {
        expect(checkSyntax(example.source)).toBeNull();
      });
      it('nutzt nur dokumentierte API', () => {
        for (const m of example.source.matchAll(/\bself\.(\w+)/g)) expect(selfNames.has(m[1]), `self.${m[1]}`).toBe(true);
        for (const m of example.source.matchAll(/\bworld\.(\w+)/g)) expect(worldNames.has(m[1]), `world.${m[1]}`).toBe(true);
        for (const m of example.source.matchAll(/^function\s+(on\w+)/gm)) expect(eventNames.has(m[1]), m[1]).toBe(true);
      });
    });
  }
});
