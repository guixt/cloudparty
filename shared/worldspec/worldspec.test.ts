import { describe, expect, it } from 'vitest';
import { createDefaultWorld } from '../defaultWorld';
import type { WorldSpec } from '../types';
import { parseWorldSpec, serializeWorldSpec, validateWorldSpec } from './index';

const SPONTANE_GESPRAECHE = {
  metadata: { name: 'Spontane Gespräche', version: '1.0.0' },
  environment: {
    sky: { preset: 'dusk' },
    light: { intensity: 3.5, temperatureK: 4200, direction: { azimuth: 45, elevation: 25 } },
    audio: { soundscapeRef: 'evening-plaza', volume: 0.4 },
  },
  rules: {
    movement: { mode: 'grounded', speed: 5 },
    gravity: { enabled: true, strength: 9.81 },
    abilities: [
      { id: 'emote.waves', enabled: true },
      { id: 'voip.local', enabled: true, params: { range: 15, duckMusic: true } },
    ],
  },
  personality: { mood: 'social', densityHints: { min: 4, max: 25, peak: 20 } },
  entities: [
    { ref: 'EntitySpec.avatar-spawn', id: 'spawn.main', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } },
    { ref: 'EntitySpec.bench', id: 'bench.n1', transform: { pos: [2, 0, -1], rot: [0, 0, 0.2, 0.98], scale: [1, 1, 1] }, state: { seats: 3 } },
    { ref: 'EntitySpec.lantern', id: 'lantern.e1', transform: { pos: [-3, 0, 4], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, state: { intensity: 0.7 } },
  ],
  interactions: [
    { ref: 'InteractionSpec.seat', bindTo: 'bench.n1', conditions: [{ if: 'entity.freeSeats > 0' }], effects: [{ do: 'sit(player)' }] },
    { ref: 'InteractionSpec.light-toggle', bindTo: 'lantern.e1', effects: [{ do: 'toggleLight()' }] },
  ],
  extensions: { 'acme.analytics': { sessionTag: 'spontaneous-chat' } },
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Wendet eine Änderung auf eine Kopie des Beispiels an und liefert die Fehler. */
function errorsAfter(mutate: (w: any) => void): string[] {
  const w = clone(SPONTANE_GESPRAECHE) as any;
  mutate(w);
  const result = validateWorldSpec(w);
  return result.ok ? [] : result.errors;
}
const expectError = (mutate: (w: any) => void, needle: string) => {
  const errors = errorsAfter(mutate);
  expect(errors.join('\n')).toContain(needle);
};

describe('gültige Welten', () => {
  it('akzeptiert das Beispiel „Spontane Gespräche“ unverändert', () => {
    const result = validateWorldSpec(clone(SPONTANE_GESPRAECHE));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.world.entities).toHaveLength(3);
      expect(result.world.entities[1].state).toEqual({ seats: 3 });
      expect(result.world.extensions).toEqual({ 'acme.analytics': { sessionTag: 'spontaneous-chat' } });
    }
  });

  it('akzeptiert die Startwelt', () => {
    const result = validateWorldSpec(createDefaultWorld());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.world).toEqual(createDefaultWorld());
  });

  it('parseWorldSpec liest JSON-Text (auch mit BOM)', () => {
    expect(parseWorldSpec(JSON.stringify(SPONTANE_GESPRAECHE)).ok).toBe(true);
    expect(parseWorldSpec(`﻿${JSON.stringify(SPONTANE_GESPRAECHE)}`).ok).toBe(true);
  });

  it('ergänzt Standardwerte für fehlende optionale Teile', () => {
    const w = clone(SPONTANE_GESPRAECHE) as any;
    delete w.entities;
    delete w.interactions;
    delete w.extensions;
    const result = validateWorldSpec(w);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.world.entities).toEqual([]);
      expect(result.world.interactions).toEqual([]);
      expect(result.world.island).toEqual({ radius: 40, depth: 18, seed: 7 });
    }
  });

  it('ergänzt Transform-Teile, fehlende IDs und Ability-Standardwerte', () => {
    const w = clone(SPONTANE_GESPRAECHE) as any;
    w.entities = [{ ref: 'EntitySpec.box' }, { ref: 'EntitySpec.box', transform: { pos: [1, 2, 3] } }, { ref: 'EntitySpec.box', id: 'box.1' }];
    w.interactions = [];
    w.rules.abilities = [{ id: 'fly' }];
    const result = validateWorldSpec(w);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.world.entities.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
    expect(result.world.entities[0].transform).toEqual({ pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] });
    expect(result.world.entities[1].transform).toEqual({ pos: [1, 2, 3], rot: [0, 0, 0, 1], scale: [1, 1, 1] });
    expect(result.world.rules.abilities[0].enabled).toBe(true);
  });

  it('erlaubt unbekannte Prefab-Verweise', () => {
    const w = clone(SPONTANE_GESPRAECHE) as any;
    w.entities[0].ref = 'EntitySpec.gibts-nicht';
    expect(validateWorldSpec(w).ok).toBe(true);
  });

  it('akzeptiert Richtung als Text und benutzerdefinierten Himmel', () => {
    const w = clone(SPONTANE_GESPRAECHE) as any;
    w.environment.light.direction = '45, 25';
    w.environment.sky = { preset: 'custom', color: '#aabbcc' };
    expect(validateWorldSpec(w).ok).toBe(true);
  });

  it('akzeptiert Material, Physik, Partikel, Skript und Medien', () => {
    const w = clone(SPONTANE_GESPRAECHE) as any;
    w.entities[0] = {
      ...w.entities[0],
      material: { color: '#112233', emissive: '#ffffff', metallic: 0.5, roughness: 1, alpha: 0.5 },
      physics: { mode: 'dynamic', mass: 2, friction: 0.5, restitution: 0.3 },
      particles: { preset: 'fire', enabled: true, rate: 30 },
      script: { source: 'function onClick() {}', enabled: false },
      media: { kind: 'slides', urls: ['a', 'b'], slide: 1 },
    };
    expect(validateWorldSpec(w).ok).toBe(true);
  });
});

describe('Pflichtteile und Metadaten', () => {
  it.each([null, 42, 'text', []])('lehnt %j als Welt ab', (value) => {
    const result = validateWorldSpec(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toBe('Die Welt muss ein JSON-Objekt sein.');
  });

  it.each(['metadata', 'environment', 'rules', 'personality'])('verlangt „%s“', (key) => {
    expectError((w) => delete w[key], `${key}: fehlt (Pflichtfeld)`);
  });

  it('prüft den Namen', () => {
    expectError((w) => (w.metadata.name = ''), 'metadata.name: darf nicht leer sein');
    expectError((w) => (w.metadata.name = '   '), 'metadata.name: darf nicht leer sein');
    expectError((w) => (w.metadata.name = 'x'.repeat(101)), 'metadata.name: darf höchstens 100 Zeichen lang sein');
    expect(errorsAfter((w) => (w.metadata.name = 'x'.repeat(100)))).toEqual([]);
  });

  it('prüft die Version (Semver)', () => {
    for (const bad of ['1.0', 'v1.0.0', '1.0.0.0', 'abc', '01.0.0']) {
      expectError((w) => (w.metadata.version = bad), 'metadata.version: muss eine Version im Format MAJOR.MINOR.PATCH');
    }
    expect(errorsAfter((w) => (w.metadata.version = '2.10.3-beta.1+build5'))).toEqual([]);
  });
});

describe('Umgebung', () => {
  it('prüft Himmel-Preset und Farbregel', () => {
    expectError((w) => (w.environment.sky.preset = 'regen'), 'environment.sky.preset: muss einer der Werte');
    expectError((w) => (w.environment.sky.color = '#ffffff'), 'environment.sky.color: ist nur beim Himmel-Preset „custom“ erlaubt');
    expectError((w) => (w.environment.sky = { preset: 'custom' }), 'environment.sky.color: fehlt');
    expectError((w) => (w.environment.sky = { preset: 'custom', color: 'rot' }), 'environment.sky.color: muss eine Farbe im Format #RRGGBB sein');
  });

  it('prüft Lichtwerte mit lesbarer Meldung', () => {
    expectError((w) => (w.environment.light.intensity = 11), 'environment.light.intensity: muss zwischen 0 und 10 liegen');
    expectError((w) => (w.environment.light.intensity = -1), 'environment.light.intensity: muss zwischen 0 und 10 liegen');
    expectError((w) => (w.environment.light.temperatureK = 500), 'environment.light.temperatureK: muss zwischen 1000 und 12000 liegen');
    expectError((w) => (w.environment.light.temperatureK = 13000), 'environment.light.temperatureK: muss zwischen 1000 und 12000 liegen');
    expectError((w) => (w.environment.light.intensity = 'hell'), 'environment.light.intensity: muss eine Zahl sein');
  });

  it('prüft die Lichtrichtung', () => {
    expectError((w) => delete w.environment.light.direction, 'environment.light.direction: fehlt');
    expectError((w) => (w.environment.light.direction = 'nord'), 'environment.light.direction: muss als');
    expectError((w) => (w.environment.light.direction = '1,2,3'), 'environment.light.direction: muss als');
    expectError((w) => (w.environment.light.direction = { azimuth: 1 }), 'azimuth');
    expectError((w) => (w.environment.light.direction = { azimuth: 1, elevation: 120 }), 'Elevation muss zwischen -90 und 90');
    expectError((w) => (w.environment.light.direction = '10,95'), 'Elevation muss zwischen -90 und 90');
  });

  it('prüft Lautstärke und Klangkulisse', () => {
    expectError((w) => (w.environment.audio.volume = 1.5), 'environment.audio.volume: muss zwischen 0 und 1 liegen');
    expectError((w) => (w.environment.audio.volume = -0.1), 'environment.audio.volume: muss zwischen 0 und 1 liegen');
    expectError((w) => (w.environment.audio.soundscapeRef = ''), 'environment.audio.soundscapeRef: darf nicht leer sein');
    expect(errorsAfter((w) => delete w.environment.audio.soundscapeRef)).toEqual([]);
  });
});

describe('Regeln und Persönlichkeit', () => {
  it('prüft Bewegung', () => {
    expectError((w) => (w.rules.movement.mode = 'schwimmen'), 'rules.movement.mode: muss einer der Werte');
    expectError((w) => (w.rules.movement.speed = 0), 'rules.movement.speed: muss größer als 0 sein');
    expectError((w) => (w.rules.movement.speed = -3), 'rules.movement.speed: muss größer als 0 sein');
  });

  it('prüft Schwerkraft', () => {
    expectError((w) => (w.rules.gravity = { enabled: true }), 'rules.gravity.strength: fehlt');
    expectError((w) => (w.rules.gravity = { enabled: true, strength: 0 }), 'rules.gravity.strength: muss bei aktivierter Schwerkraft größer als 0 sein');
    expectError((w) => (w.rules.gravity = { enabled: 'ja' }), 'rules.gravity.enabled: muss ein Wahrheitswert');
    expect(errorsAfter((w) => (w.rules.gravity = { enabled: false }))).toEqual([]);
  });

  it('prüft Fähigkeiten', () => {
    expectError((w) => (w.rules.abilities = [{ enabled: true }]), 'rules.abilities[0].id: fehlt');
    expectError((w) => (w.rules.abilities = [{ id: 'x', params: 5 }]), 'rules.abilities[0].params: muss ein Objekt sein');
    expectError((w) => (w.rules.abilities = [{ id: 'x', params: { f: () => 1 } }]), 'rules.abilities[0].params: enthält bei „f“');
    expectError((w) => (w.rules.abilities = [{ id: 'x', params: { n: NaN } }]), 'rules.abilities[0].params: enthält bei „n“');
  });

  it('prüft Dichte-Hinweise', () => {
    expectError((w) => (w.personality.densityHints.min = -1), 'personality.densityHints.min: darf nicht negativ sein');
    expectError((w) => (w.personality.densityHints = { min: 10, max: 5, peak: 3 }), 'personality.densityHints.max: darf nicht kleiner als „min“ sein');
    expectError((w) => (w.personality.densityHints.peak = 24), 'personality.densityHints.peak: muss eine Stunde zwischen 0 und 23 sein');
    expectError((w) => (w.personality.densityHints.peak = 1.5), 'personality.densityHints.peak: muss eine ganze Zahl sein');
    expectError((w) => (w.personality.mood = ''), 'personality.mood: darf nicht leer sein');
    expect(errorsAfter((w) => (w.personality.mood = 'verträumt'))).toEqual([]);
  });
});

describe('Objekte und Interaktionen', () => {
  it('verlangt ref und prüft Transform-Längen', () => {
    expectError((w) => delete w.entities[0].ref, 'entities[0].ref: fehlt');
    expectError((w) => (w.entities[0].ref = ''), 'entities[0].ref: darf nicht leer sein');
    expectError((w) => (w.entities[1].transform.pos = [1, 2]), 'entities[1].transform.pos: muss genau 3 Zahlen enthalten');
    expectError((w) => (w.entities[1].transform.rot = [0, 0, 1]), 'entities[1].transform.rot: muss genau 4 Zahlen enthalten');
    expectError((w) => (w.entities[1].transform.scale = [1, 1, 1, 1]), 'entities[1].transform.scale: muss genau 3 Zahlen enthalten');
    expectError((w) => (w.entities[1].transform.pos = [1, 'a', 3]), 'entities[1].transform.pos[1]: muss eine Zahl sein');
  });

  it('verlangt eindeutige IDs', () => {
    expectError((w) => (w.entities[2].id = 'bench.n1'), 'entities[2].id: „bench.n1“ ist doppelt vergeben');
  });

  it('prüft state auf JSON-Tauglichkeit', () => {
    expectError((w) => (w.entities[1].state = { a: { b: [1, () => 2] } }), 'entities[1].state: enthält bei „a.b[1]“');
    const cyclic: any = {};
    cyclic.self = cyclic;
    expectError((w) => (w.entities[1].state = cyclic), 'entities[1].state: enthält bei „self.self“');
  });

  it('prüft Material, Physik, Partikel und Medien', () => {
    expectError((w) => (w.entities[0].material = { color: 'rot' }), 'entities[0].material.color: muss eine Farbe im Format #RRGGBB sein');
    expectError((w) => (w.entities[0].material = { alpha: 2 }), 'entities[0].material.alpha: muss zwischen 0 und 1 liegen');
    expectError((w) => (w.entities[0].physics = { mode: 'fliegend' }), 'entities[0].physics.mode: muss einer der Werte');
    expectError((w) => (w.entities[0].physics = { mode: 'dynamic', mass: 0 }), 'entities[0].physics.mass: muss größer als 0 sein');
    expectError((w) => (w.entities[0].particles = { preset: 'regenbogen', enabled: true }), 'entities[0].particles.preset: muss einer der Werte');
    expectError((w) => (w.entities[0].media = { kind: 'radio' }), 'entities[0].media.kind: muss einer der Werte');
    expectError((w) => (w.entities[0].script = { enabled: true }), 'entities[0].script.source: fehlt');
  });

  it('prüft bindTo und ref von Interaktionen', () => {
    expectError((w) => (w.interactions[0].bindTo = 'gibt-es-nicht'), 'interactions[0].bindTo: verweist auf „gibt-es-nicht“');
    expectError((w) => delete w.interactions[1].ref, 'interactions[1].ref: fehlt');
    expectError((w) => (w.interactions[0].conditions = [{ if: 5 }]), 'interactions[0].conditions[0].if: muss ein Text sein');
    expect(errorsAfter((w) => delete w.interactions[0].bindTo)).toEqual([]);
  });

  it('sammelt mehrere Fehler auf einmal', () => {
    const errors = errorsAfter((w) => {
      w.metadata.name = '';
      w.environment.light.intensity = 99;
      w.interactions[0].bindTo = 'weg';
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Extensions und Insel', () => {
  it('verlangt Namensräume ohne Kollision mit Top-Level-Feldern', () => {
    expectError((w) => (w.extensions = { rules: {} }), 'extensions.rules: kollidiert mit einem Feld der obersten Ebene');
    expectError((w) => (w.extensions = { nurName: {} }), 'extensions.nurName: Namen müssen die Form „anbieter.funktion“');
    expectError((w) => (w.extensions = { 'a.b': { f: () => 1 } }), 'extensions.a.b: enthält bei');
    expect(errorsAfter((w) => (w.extensions = {}))).toEqual([]);
  });

  it('prüft die Insel', () => {
    expectError((w) => (w.island = { radius: -1 }), 'island.radius: muss größer als 0 sein');
    expectError((w) => (w.island = { depth: 0 }), 'island.depth: muss größer als 0 sein');
    const w = clone(SPONTANE_GESPRAECHE) as any;
    w.island = { radius: 12 };
    const result = validateWorldSpec(w);
    expect(result.ok && result.world.island).toEqual({ radius: 12, depth: 18, seed: 7 });
  });
});

describe('JSON-Text', () => {
  it('meldet ungültiges JSON auf Deutsch', () => {
    const result = parseWorldSpec('{ kaputt');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^Kein gültiges JSON: /);
  });
});

describe('serializeWorldSpec', () => {
  it('ist stabil (unabhängig von der Schlüsselreihenfolge), lesbar und rundreisefähig', () => {
    const world = createDefaultWorld();
    const reverseKeys = (v: any): any =>
      Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v;
    const shuffled: WorldSpec = reverseKeys(world);
    const text = serializeWorldSpec(world);
    expect(serializeWorldSpec(shuffled)).toBe(text);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.indexOf('"metadata"')).toBeLessThan(text.indexOf('"environment"'));
    expect(text).toContain('\n  "metadata": {');
    const back = parseWorldSpec(text);
    expect(back.ok && back.world).toEqual(world);
  });

  it('Beispiel „Spontane Gespräche“ übersteht Serialisierung und erneutes Prüfen', () => {
    const first = validateWorldSpec(clone(SPONTANE_GESPRAECHE));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = parseWorldSpec(serializeWorldSpec(first.world));
    expect(second).toEqual(first);
  });
});

describe('Gras ein/aus', () => {
  it('environment.grass wird angenommen, Nicht-Boolean abgewiesen', () => {
    const w = createDefaultWorld();
    w.environment.grass = false;
    const ok = validateWorldSpec(w);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.world.environment.grass).toBe(false);
    (w.environment as unknown as { grass: unknown }).grass = 'nein';
    expect(validateWorldSpec(w).ok).toBe(false);
  });
});
