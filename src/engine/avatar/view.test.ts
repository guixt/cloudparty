import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, figureShown, loadView, sanitizeView, saveView, VIEW_KEY } from './view';

describe('Figur- und Kameraeinstellung', () => {
  it('ungültige Werte fallen auf den Standard zurück', () => {
    expect(sanitizeView(null)).toEqual(DEFAULT_VIEW);
    expect(sanitizeView({ figure: 'quatsch', camera: 5 })).toEqual(DEFAULT_VIEW);
    expect(sanitizeView({ figure: 'hidden', camera: 'first' })).toEqual({ figure: 'hidden', camera: 'first' });
  });
  it('Speichern und Laden', () => {
    const mem: Record<string, string> = {};
    const s = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
    expect(loadView(s)).toEqual(DEFAULT_VIEW);
    saveView({ figure: 'neutral', camera: 'first' }, s);
    expect(mem[VIEW_KEY]).toContain('neutral');
    expect(loadView(s)).toEqual({ figure: 'neutral', camera: 'first' });
    mem[VIEW_KEY] = '{kaputt';
    expect(loadView(s)).toEqual(DEFAULT_VIEW);
  });
  it('Sichtbarkeit: Ich-Perspektive blendet die Figur beim Spielen aus, im Baumodus gilt nur die Figur-Einstellung', () => {
    expect(figureShown({ figure: 'normal', camera: 'third' }, 'play')).toBe(true);
    expect(figureShown({ figure: 'normal', camera: 'first' }, 'play')).toBe(false);
    expect(figureShown({ figure: 'normal', camera: 'first' }, 'build')).toBe(true);
    expect(figureShown({ figure: 'hidden', camera: 'third' }, 'build')).toBe(false);
    expect(figureShown({ figure: 'neutral', camera: 'third' }, 'play')).toBe(true);
  });
});
