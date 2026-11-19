import { describe, expect, it } from 'vitest';
import { FAST_FACTOR, dragModeFor, panSpeed, numpadView, orbitStep, panStep, presetView, zoomStep } from './cameraControls';

const none = { shift: false, ctrl: false, alt: false };

describe('Baukamera (Blender-Steuerung)', () => {
  it('Maustasten und Zusatztasten', () => {
    expect(dragModeFor(1, none)).toBe('orbit');
    expect(dragModeFor(1, { ...none, shift: true })).toBe('pan');
    expect(dragModeFor(1, { ...none, ctrl: true })).toBe('zoom');
    expect(dragModeFor(2, none)).toBe('orbit');
    expect(dragModeFor(0, none)).toBeNull();
    expect(dragModeFor(0, { ...none, alt: true })).toBe('orbit');
    expect(dragModeFor(0, { ...none, alt: true, shift: true })).toBe('pan');
  });
  it('Drehen begrenzt beta', () => {
    const r = orbitStep(0, 1, 100, 1000, 0.05, 2.3);
    expect(r.alpha).toBeCloseTo(-0.8);
    expect(r.beta).toBe(0.05);
    expect(orbitStep(0, 2, 0, -1000, 0.05, 2.3).beta).toBe(2.3);
  });
  it('Verschieben ist proportional zum Abstand, Zoomen begrenzt', () => {
    const near = panStep(5, 0.8, 600, 100, 0);
    const far = panStep(50, 0.8, 600, 100, 0);
    expect(far.right / near.right).toBeCloseTo(10);
    expect(near.right).toBeLessThan(0);
    expect(zoomStep(10, 1000, 1, 160)).toBe(160);
    expect(zoomStep(10, -1000, 1, 160)).toBe(1);
    expect(zoomStep(10, 20, 1, 160)).toBeGreaterThan(10);
  });
  it('Standardansichten', () => {
    expect(numpadView('Numpad1', false)).toBe('front');
    expect(numpadView('Numpad1', true)).toBe('back');
    expect(numpadView('Numpad7', false)).toBe('top');
    expect(numpadView('Numpad9', false)).toBeNull();
    expect(presetView('top', 0.05, 2.3).beta).toBe(0.05);
    expect(presetView('front', 0.05, 2.3).beta).toBeCloseTo(Math.PI / 2);
    expect(presetView('bottom', 0.05, 2.3).beta).toBe(2.3);
  });
});

describe('Schnell bewegen mit Shift', () => {
  it('Shift macht die Tastenbewegung dreimal so schnell, Grundtempo bleibt', () => {
    expect(panSpeed(2, false)).toBe(3);
    expect(panSpeed(2, true)).toBe(3 * FAST_FACTOR);
    expect(panSpeed(20, true)).toBeCloseTo(20 * 0.9 * FAST_FACTOR);
  });
});
