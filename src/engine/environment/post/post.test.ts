import { describe, expect, it, vi } from 'vitest';
import { LOOK_IDS } from '../../../../shared/types';
import { QUALITY_PRESETS } from '../../quality';
import { LOOKS, NEUTRAL_LOOK, godRayStrength, lerpLook, postOptionsFor, resolveLook, shadowOptionsFor, smoothstep01 } from './looks';
import { createPhotoMode, isTypingTarget } from './photo';
import { COMIC_FRAGMENT, RETRO_FRAGMENT } from './shaders';

describe('Looks', () => {
  it('deckt alle LOOK_IDS ab, Werte im sinnvollen Bereich', () => {
    for (const id of LOOK_IDS) {
      const l = LOOKS[id];
      expect(l, id).toBeDefined();
      expect(l.exposure).toBeGreaterThan(0.5);
      expect(l.exposure).toBeLessThan(1.6);
      expect(l.contrast).toBeGreaterThan(0.8);
      expect(l.contrast).toBeLessThan(2);
      expect(Math.abs(l.saturation)).toBeLessThanOrEqual(100);
      expect(Math.abs(l.temperature)).toBeLessThanOrEqual(1);
      for (const v of [l.vignette, l.grain, l.shaderAmount]) expect(v >= 0 && v <= 1).toBe(true);
    }
    expect(LOOKS.comic.shader).toBe('comic');
    expect(LOOKS.retro.shader).toBe('retro');
    expect(LOOKS.warm.temperature).toBeGreaterThan(0);
    expect(LOOKS.kuehl.temperature).toBeLessThan(0);
  });
  it('unbekannte Looks fallen auf standard zurück', () => {
    expect(resolveLook(undefined)).toBe(LOOKS.standard);
    expect(resolveLook('nope')).toBe(LOOKS.standard);
    expect(resolveLook('comic')).toBe(LOOKS.comic);
  });
  it('Übergang: Ränder, Mitte, Effekt-Ein- und Ausblenden', () => {
    expect(lerpLook(NEUTRAL_LOOK, LOOKS.filmisch, 0).contrast).toBeCloseTo(NEUTRAL_LOOK.contrast);
    expect(lerpLook(NEUTRAL_LOOK, LOOKS.filmisch, 1).contrast).toBeCloseTo(LOOKS.filmisch.contrast);
    const mid = lerpLook(NEUTRAL_LOOK, LOOKS.filmisch, 0.5);
    expect(mid.contrast).toBeCloseTo((NEUTRAL_LOOK.contrast + LOOKS.filmisch.contrast) / 2);
    expect(lerpLook(NEUTRAL_LOOK, LOOKS.comic, 0.25).shader).toBe('comic');
    expect(lerpLook(NEUTRAL_LOOK, LOOKS.comic, 0).shaderAmount).toBe(0);
    const out = lerpLook(LOOKS.comic, NEUTRAL_LOOK, 0.5);
    expect(out.shader).toBe('comic');
    expect(out.shaderAmount).toBeCloseTo(0.5);
    expect(lerpLook(LOOKS.comic, NEUTRAL_LOOK, 1).shaderAmount).toBe(0);
    expect(smoothstep01(-1)).toBe(0);
    expect(smoothstep01(2)).toBe(1);
  });
});

describe('Qualität', () => {
  it('bildet Stufen auf Optionen ab', () => {
    expect(postOptionsFor(QUALITY_PRESETS.low)).toMatchObject({ bloom: false, glow: false, ssao: false, godRays: false, fxaa: true });
    expect(postOptionsFor(QUALITY_PRESETS.high)).toMatchObject({ ssao: true, godRays: true, depthOfField: false });
    expect(postOptionsFor(QUALITY_PRESETS.ultra).depthOfField).toBe(true);
    expect(shadowOptionsFor(QUALITY_PRESETS.ultra)).toEqual({ size: 4096, soft: true });
    expect(shadowOptionsFor(QUALITY_PRESETS.low)).toEqual({ size: 1024, soft: false });
  });
  it('Sonnenstrahlen: nur bei hoher Sonne und Blick zur Sonne', () => {
    expect(godRayStrength(2, 1)).toBe(0);
    expect(godRayStrength(30, -0.5)).toBe(0);
    expect(godRayStrength(30, 0.9)).toBeGreaterThan(0.9);
    expect(godRayStrength(8, 0.9)).toBeLessThan(godRayStrength(30, 0.9));
  });
});

describe('Fotomodus', () => {
  const make = () => {
    const target = { setPhotoMode: vi.fn() };
    const bus = { emit: vi.fn() };
    return { target, bus, photo: createPhotoMode(target, bus) };
  };
  it('schaltet um und meldet', () => {
    const { target, bus, photo } = make();
    expect(photo.handleKey({ code: 'KeyP', target: {} })).toBe(true);
    expect(target.setPhotoMode).toHaveBeenLastCalledWith(true);
    expect(bus.emit).toHaveBeenLastCalledWith('ui.toast', { text: 'Fotomodus an' });
    photo.handleKey({ code: 'KeyP', target: {} });
    expect(photo.isOn()).toBe(false);
    expect(bus.emit).toHaveBeenLastCalledWith('ui.toast', { text: 'Fotomodus aus' });
  });
  it('ignoriert Tippen in Eingabefeldern und Modifikatoren', () => {
    const { target, photo } = make();
    expect(photo.handleKey({ code: 'KeyP', target: { tagName: 'INPUT' } })).toBe(false);
    expect(photo.handleKey({ code: 'KeyP', target: { tagName: 'DIV', isContentEditable: true } })).toBe(false);
    expect(photo.handleKey({ code: 'KeyP', ctrlKey: true })).toBe(false);
    expect(photo.handleKey({ code: 'KeyW' })).toBe(false);
    expect(target.setPhotoMode).not.toHaveBeenCalled();
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('Shader', () => {
  it('enthalten die nötigen Bausteine', () => {
    for (const src of [COMIC_FRAGMENT, RETRO_FRAGMENT]) {
      expect(src).toContain('void main');
      expect(src).toContain('gl_FragColor');
      expect(src).toContain('textureSampler');
      expect((src.match(/{/g) ?? []).length).toBe((src.match(/}/g) ?? []).length);
    }
    expect(COMIC_FRAGMENT).toContain('depthSampler');
  });
});
