import { beforeEach, describe, expect, it } from 'vitest';
import { clearLog, clip, exportLog, getLogEntries, logEvent, setLogLevel } from './log';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
}

describe('KI-Protokoll', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    clearLog();
  });

  it('normal: ohne Detailfelder; detail: mit; off: nichts', () => {
    logEvent('tool', { name: 'a' }, { input: 'x' });
    setLogLevel('detail');
    logEvent('tool', { name: 'b' }, { input: 'y' });
    setLogLevel('off');
    logEvent('tool', { name: 'c' });
    const e = getLogEntries();
    expect(e.map((x) => x.name)).toEqual(['a', 'b']);
    expect(e[0].input).toBeUndefined();
    expect(e[1].input).toBe('y');
  });

  it('Export ist JSON pro Zeile, Text wird gekürzt', () => {
    logEvent('x', { n: 1 });
    logEvent('y', { n: 2 });
    const lines = exportLog().trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).kind).toBe('y');
    expect(clip('a'.repeat(5000), 100)).toContain('gekürzt');
  });

  it('begrenzt die Anzahl der Einträge', () => {
    for (let i = 0; i < 1100; i++) logEvent('k', { i });
    expect(getLogEntries()).toHaveLength(1000);
    expect(getLogEntries()[0].i).toBe(100);
  });
});
