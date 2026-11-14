import { describe, expect, it } from 'vitest';
import { formatLocationHash, generateLocalIslandId, parseLocationHash, slugify, yawToDegrees } from './location';

describe('parseLocationHash', () => {
  it('liest alle Teile', () => {
    const p = parseLocationHash('#insel,5,0,-3,90');
    expect(p.island).toBe('insel');
    expect(p.position).toEqual([5, 0, -3]);
    expect(p.yaw).toBeCloseTo(Math.PI / 2);
  });
  it('Teile sind optional', () => {
    expect(parseLocationHash('#nur-id')).toEqual({ island: 'nur-id', position: null, yaw: null });
    expect(parseLocationHash('#a,1,2,3').yaw).toBeNull();
    expect(parseLocationHash('a,1.5,2,3,0').position).toEqual([1.5, 2, 3]);
  });
  it('ignoriert Fehlerhaftes', () => {
    expect(parseLocationHash('')).toEqual({ island: null, position: null, yaw: null });
    expect(parseLocationHash('#')).toEqual({ island: null, position: null, yaw: null });
    expect(parseLocationHash('#,1,2,3').island).toBeNull();
    expect(parseLocationHash('#a,x,2,3').position).toBeNull();
    expect(parseLocationHash('#a,1,2').position).toBeNull();
    expect(parseLocationHash('#a,1,2,3,abc')).toMatchObject({ position: [1, 2, 3], yaw: null });
    expect(parseLocationHash('#a,Infinity,2,3').position).toBeNull();
    expect(parseLocationHash('#%E0%A4%A,1,2,3').island).toBeNull();
  });
  it('dekodiert IDs', () => {
    expect(parseLocationHash('#gr%C3%BCn%2Cx').island).toBe('grün,x');
  });
});

describe('formatLocationHash', () => {
  it('rundet', () => {
    expect(formatLocationHash('a', [1.234, 0, -3.96], Math.PI)).toBe('#a,1.2,0,-4,180');
  });
  it('ohne Position nur ID', () => {
    expect(formatLocationHash('a')).toBe('#a');
    expect(formatLocationHash('a', [NaN, 0, 0])).toBe('#a');
  });
  it('negative Blickrichtung wird normalisiert', () => {
    expect(yawToDegrees(-Math.PI / 2)).toBe(270);
    expect(yawToDegrees(Math.PI * 2)).toBe(0);
  });
  it('Rundreise', () => {
    const hash = formatLocationHash('meine insel', [5, 0.5, -3], (45 * Math.PI) / 180);
    const p = parseLocationHash(hash);
    expect(p.island).toBe('meine insel');
    expect(p.position).toEqual([5, 0.5, -3]);
    expect(yawToDegrees(p.yaw!)).toBe(45);
    expect(formatLocationHash(p.island!, p.position, p.yaw)).toBe(hash);
  });
});

describe('slugs', () => {
  it('slugify', () => {
    expect(slugify('Größe Überraschung!')).toBe('groesse-ueberraschung');
    expect(slugify('  ')).toBe('insel');
    expect(slugify('A'.repeat(100)).length).toBe(40);
  });
  it('generateLocalIslandId', () => {
    expect(generateLocalIslandId('Meine Insel', () => 0)).toBe('meine-insel-000000');
    expect(generateLocalIslandId('X')).toMatch(/^x-[0-9a-f]{6}$/);
  });
});
