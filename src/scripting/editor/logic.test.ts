import { describe, expect, it } from 'vitest';
import {
  buildCompletionSets,
  buildReference,
  checkSyntax,
  ConsoleStore,
  filterReference,
  signatureToInsert,
} from './logic';

describe('checkSyntax', () => {
  it('akzeptiert gültigen Code und führt ihn nicht aus', () => {
    (globalThis as { __ran?: boolean }).__ran = false;
    expect(checkSyntax('globalThis.__ran = true;\nfunction onClick(a) {}')).toBeNull();
    expect((globalThis as { __ran?: boolean }).__ran).toBe(false);
    expect(checkSyntax('')).toBeNull();
  });
  it('meldet Fehler mit Zeile und Spalte', () => {
    const issue = checkSyntax('let a = 1;\nlet b = ;\nlet c = 3;');
    expect(issue).not.toBeNull();
    expect(issue!.line).toBe(2);
    expect(issue!.message.length).toBeGreaterThan(0);
  });
  it('findet Fehler in der letzten Zeile (fehlende Klammer)', () => {
    const issue = checkSyntax('function onClick() {\n  self.say("x");\n');
    expect(issue).not.toBeNull();
    expect(issue!.line).toBeGreaterThanOrEqual(2);
    expect(issue!.from).toBeLessThanOrEqual(issue!.to);
  });
});

describe('ConsoleStore', () => {
  it('begrenzt auf 200 Zeilen pro Objekt', () => {
    const s = new ConsoleStore();
    for (let i = 0; i < 250; i++) s.push('a', { ts: i, level: 'log', message: String(i) });
    s.push('b', { ts: 1, level: 'error', message: 'x' });
    expect(s.getLines('a')).toHaveLength(200);
    expect(s.getLines('a')[0].message).toBe('50');
    expect(s.getLines('b')).toHaveLength(1);
  });
  it('leert, merkt Status und benachrichtigt', () => {
    const s = new ConsoleStore(3);
    let n = 0;
    const off = s.subscribe(() => n++);
    s.push('a', { ts: 1, level: 'log', message: 'x' });
    s.setStatus('a', { status: 'error', message: 'kaputt' });
    s.clear('a');
    expect(s.getLines('a')).toHaveLength(0);
    expect(s.getStatus('a')?.status).toBe('error');
    expect(n).toBe(3);
    off();
    s.forget('a');
    expect(n).toBe(3);
    expect(s.getStatus('a')).toBeUndefined();
  });
});

describe('Referenz und Autovervollständigung', () => {
  it('deckt die gesamte API ab', () => {
    const ref = buildReference();
    expect(ref.filter((r) => r.kind === 'event')).toHaveLength(8);
    expect(ref.find((r) => r.name === 'getPosition')!.insert).toBe('self.getPosition()');
    expect(ref.find((r) => r.name === 'setTimeout')!.insert).toBe('setTimeout(fn, ms)');
    expect(ref.find((r) => r.name === 'onClick')!.insert).toContain('function onClick(avatar) {');
  });
  it('filtert nach Suchbegriffen', () => {
    const ref = buildReference();
    expect(filterReference(ref, '').length).toBe(ref.length);
    const hits = filterReference(ref, 'partikel');
    expect(hits.map((h) => h.name)).toContain('setParticles');
    expect(filterReference(ref, 'zzzzgibtesnicht')).toHaveLength(0);
    expect(signatureToInsert('a() → b')).toBe('a()');
  });
  it('erzeugt self-, world- und globale Vorschläge', () => {
    const sets = buildCompletionSets();
    expect(sets.self.map((c) => c.label)).toContain('setColor');
    expect(sets.world.map((c) => c.label)).toEqual(expect.arrayContaining(['send', 'teleportAvatar']));
    expect(sets.world.map((c) => c.label)).not.toContain('log');
    const g = sets.globals.map((c) => c.label);
    expect(g).toEqual(expect.arrayContaining(['onClick', 'onTick', 'log', 'setInterval', 'self', 'world']));
    expect(sets.globals.find((c) => c.label === 'onClick')!.template).toContain('#{}');
  });
});
