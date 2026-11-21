import { describe, expect, it } from 'vitest';
import { entitySummary } from './summary';
import { buildSystemPrompt } from './prompt';
import { createDefaultWorld } from '../../../shared/defaultWorld';

describe('KI und Material', () => {
  it('Zusammenfassung nennt preset, Muster und Spiegel', () => {
    const s = entitySummary({ id: 'a', ref: 'EntitySpec.box', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, material: { preset: 'chrom', pattern: 'karo', mirror: true } });
    expect(s.material_preset).toBe('chrom');
    expect(s.muster).toBe('karo');
    expect(s.spiegel).toBe(true);
    const plain = entitySummary({ id: 'b', ref: 'EntitySpec.box', transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] }, material: { pattern: 'none' } });
    expect(plain.muster).toBeUndefined();
  });
  it('Prompt erklärt Materialien kurz', () => {
    const p = buildSystemPrompt({ world: createDefaultWorld() } as never);
    expect(p).toContain('# Materialien');
    expect(p).toContain('chrom');
    const block = p.split('# Materialien')[1].split('# Skripte')[0];
    expect(block.trim().split('\n').length).toBeLessThanOrEqual(12);
  });
});
