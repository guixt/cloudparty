import { describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH } from '../../shared/protocol';
import { isValidIslandId, sanitizeName, validateClientMessage, validateEntity } from './validate';

const entity = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  ref: 'EntitySpec.box',
  transform: { pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] },
  ...over,
});
const state = (over: Record<string, unknown> = {}) => ({ position: [1, 2, 3], yaw: 0.5, motion: 'walk', emotes: {}, ...over });

describe('Insel-ID und Name', () => {
  it('prüft Insel-IDs', () => {
    expect(isValidIslandId('willkommen')).toBe(true);
    expect(isValidIslandId('a.b_c-1')).toBe(true);
    expect(isValidIslandId('')).toBe(false);
    expect(isValidIslandId('a b')).toBe(false);
    expect(isValidIslandId('x'.repeat(65))).toBe(false);
    expect(isValidIslandId(5)).toBe(false);
  });
  it('bereinigt Namen', () => {
    expect(sanitizeName('  Max   Mustermann \n')).toBe('Max Mustermann');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(32);
    expect(sanitizeName('   ')).toBe('Gast');
    expect(sanitizeName(undefined)).toBe('Gast');
  });
});

describe('validateEntity', () => {
  it('akzeptiert gültige Entities', () => expect(validateEntity(entity()).ok).toBe(true));
  it('lehnt Formfehler ab', () => {
    expect(validateEntity(entity({ id: '' })).ok).toBe(false);
    expect(validateEntity(entity({ id: 'x'.repeat(81) })).ok).toBe(false);
    expect(validateEntity(entity({ ref: '' })).ok).toBe(false);
    expect(validateEntity(entity({ transform: { pos: [0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1] } })).ok).toBe(false);
    expect(validateEntity(entity({ transform: { pos: [0, 0, null], rot: [0, 0, 0, 1], scale: [1, 1, 1] } })).ok).toBe(false);
    expect(validateEntity(entity({ material: 'rot' })).ok).toBe(false);
    expect(validateEntity(entity({ state: [] })).ok).toBe(false);
    expect(validateEntity(null).ok).toBe(false);
  });
  it('begrenzt die Größe', () => {
    expect(validateEntity(entity({ script: { source: 'x'.repeat(250_000), enabled: true } })).ok).toBe(false);
    expect(validateEntity(entity({ script: { source: 'x'.repeat(100_000), enabled: true } })).ok).toBe(true);
  });
});

describe('validateClientMessage', () => {
  it('join', () => {
    const r = validateClientMessage({ type: 'join', island: 'a', name: '  Eva  ', appearance: { skin: 'bad', hair: '#fff' } });
    expect(r.ok && r.value.type === 'join' && r.value.name).toBe('Eva');
    expect(validateClientMessage({ type: 'join', island: 'a b' }).ok).toBe(false);
  });
  it('avatar', () => {
    expect(validateClientMessage({ type: 'avatar', state: state() }).ok).toBe(true);
    expect(validateClientMessage({ type: 'avatar', state: state({ position: [1, 2, Infinity] }) }).ok).toBe(false);
    expect(validateClientMessage({ type: 'avatar', state: state({ position: [10001, 0, 0] }) }).ok).toBe(false);
    expect(validateClientMessage({ type: 'avatar', state: state({ motion: 'moonwalk' }) }).ok).toBe(false);
    expect(validateClientMessage({ type: 'avatar', state: state({ yaw: 'a' }) }).ok).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`c${i}`, { name: 'wave', startedAt: 1 }]));
    expect(validateClientMessage({ type: 'avatar', state: state({ emotes: many }) }).ok).toBe(false);
    expect(validateClientMessage({ type: 'avatar', state: state({ emotes: { upperBody: { name: 'wave', startedAt: 5, loop: true } } }) }).ok).toBe(true);
    expect(validateClientMessage({ type: 'avatar', state: state({ emotes: { upperBody: { name: 'wave' } } }) }).ok).toBe(false);
  });
  it('chat wird getrimmt und gekürzt', () => {
    const r = validateClientMessage({ type: 'chat', text: `  ${'a'.repeat(MAX_CHAT_LENGTH + 20)}  ` });
    expect(r.ok && r.value.type === 'chat' && r.value.text.length).toBe(MAX_CHAT_LENGTH);
    expect(validateClientMessage({ type: 'chat', text: 5 }).ok).toBe(false);
  });
  it('entity.remove, signal, Unbekanntes', () => {
    expect(validateClientMessage({ type: 'entity.remove', id: 'a' }).ok).toBe(true);
    expect(validateClientMessage({ type: 'entity.remove', id: '' }).ok).toBe(false);
    expect(validateClientMessage({ type: 'signal', channel: 'boom', data: { a: 1 } }).ok).toBe(true);
    expect(validateClientMessage({ type: 'signal', channel: '', data: 1 }).ok).toBe(false);
    expect(validateClientMessage({ type: 'signal', channel: 'x', data: 'y'.repeat(20_000) }).ok).toBe(false);
    expect(validateClientMessage({ type: 'nope' }).ok).toBe(false);
    expect(validateClientMessage('x').ok).toBe(false);
    expect(validateClientMessage(null).ok).toBe(false);
  });
  it('environment', () => {
    const env = { sky: { preset: 'dusk' }, light: { intensity: 1, temperatureK: 5000, direction: { azimuth: 1, elevation: 2 } }, audio: { volume: 0.5 } };
    expect(validateClientMessage({ type: 'environment', environment: env }).ok).toBe(true);
    expect(validateClientMessage({ type: 'environment', environment: { ...env, light: { intensity: 'x' } } }).ok).toBe(false);
  });
});
