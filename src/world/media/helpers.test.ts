import { describe, expect, it } from 'vitest';
import {
  applyHomography,
  applyMatrix3d,
  boardSize,
  classifyUrl,
  computeHomography,
  contrastTextColor,
  currentSlide,
  downscaleSize,
  fitText,
  letterbox,
  neighbourSlides,
  quadToMatrix3d,
  resolveSource,
  wrapSlide,
  wrapText,
  type Quad,
} from './helpers';

const measure = (t: string, size: number) => t.length * size * 0.5;

describe('classifyUrl', () => {
  it('klassifiziert Arten', () => {
    expect(classifyUrl('')).toEqual({ type: 'empty' });
    expect(classifyUrl('https://x.org/a.PNG').type).toBe('image');
    expect(classifyUrl('https://x.org/a.webm?x=1').type).toBe('video');
    expect(classifyUrl('data:image/png;base64,AAA').type).toBe('image');
    expect(classifyUrl('data:video/webm;base64,AAA').type).toBe('video');
    expect(classifyUrl('https://example.com/seite').type).toBe('web');
  });
  it('lehnt gefährliche Schemata ab', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'blob:http://a/b', 'ftp://x', 'nonsense']) {
      expect(classifyUrl(bad).type).toBe('invalid');
    }
  });
  it('erkennt YouTube und Vimeo', () => {
    expect(classifyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ type: 'youtube', embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ' });
    expect(classifyUrl('https://youtu.be/dQw4w9WgXcQ?t=3')).toMatchObject({ embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ' });
    expect(classifyUrl('https://www.youtube.com/shorts/abcDEF12345')).toMatchObject({ type: 'youtube' });
    expect(classifyUrl('https://vimeo.com/76979871')).toMatchObject({ type: 'vimeo', embedUrl: 'https://player.vimeo.com/video/76979871' });
    expect(classifyUrl('https://player.vimeo.com/video/76979871?h=x')).toMatchObject({ embedUrl: 'https://player.vimeo.com/video/76979871' });
    expect(classifyUrl('https://www.youtube.com/watch').type).toBe('web');
  });
  it('löst relative URLs mit Basis auf', () => {
    expect(classifyUrl('/test.html', 'http://localhost:1/')).toMatchObject({ type: 'web', url: 'http://localhost:1/test.html' });
  });
});

describe('resolveSource', () => {
  it('Video-Tafel mit YouTube wird zur Web-Fläche', () => {
    expect(resolveSource('video', 'https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ mode: 'web', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' });
    expect(resolveSource('video', 'https://x.org/a.mp4')).toMatchObject({ mode: 'video' });
  });
  it('Bild ohne Endung wird versucht', () => {
    expect(resolveSource('image', 'https://picsum.photos/200')).toMatchObject({ mode: 'image' });
    expect(resolveSource('image', 'javascript:1').mode).toBe('error');
    expect(resolveSource('web', 'javascript:1').mode).toBe('error');
    expect(resolveSource('web', '').mode).toBe('none');
    expect(resolveSource('web', 'data:image/png;base64,AA').mode).toBe('error');
  });
});

describe('Folien', () => {
  it('Umlauf', () => {
    expect(wrapSlide(0, -1, 5)).toBe(4);
    expect(wrapSlide(4, 1, 5)).toBe(0);
    expect(wrapSlide(2, 1, 5)).toBe(3);
    expect(wrapSlide(0, 1, 0)).toBe(0);
    expect(currentSlide({ kind: 'slides', urls: ['a', 'b'], slide: 7 })).toBe(1);
    expect(currentSlide({ kind: 'slides' })).toBe(0);
    expect(neighbourSlides(0, 3)).toEqual([1, 2]);
    expect(neighbourSlides(0, 2)).toEqual([1]);
    expect(neighbourSlides(0, 1)).toEqual([]);
  });
});

describe('Maße', () => {
  it('letterbox', () => {
    expect(letterbox(2, 1)).toEqual({ w: 1, h: 0.5 });
    expect(letterbox(0.5, 1)).toEqual({ w: 0.5, h: 1 });
    expect(letterbox(1, 1)).toEqual({ w: 1, h: 1 });
  });
  it('downscaleSize', () => {
    expect(downscaleSize(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(downscaleSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(downscaleSize(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });
  it('boardSize', () => {
    const b = boardSize('image');
    expect(b.width).toBeCloseTo(3.2);
    expect(b.height).toBeCloseTo(1.8);
    expect(boardSize('text')).toEqual({ width: 2, height: 1 });
    expect(boardSize('image', 1).width).toBeCloseTo(1.8);
    expect(boardSize('image', 'x').width).toBeCloseTo(3.2);
  });
});

describe('Text', () => {
  it('bricht um und behält Zeilenumbrüche', () => {
    const lines = wrapText(measure, 'aaa bbb ccc\n\nddd', 10, 40);
    expect(lines).toEqual(['aaa bbb', 'ccc', '', 'ddd']);
  });
  it('trennt zu lange Wörter', () => {
    const lines = wrapText(measure, 'abcdefghij', 10, 20);
    expect(lines.every((l) => measure(l, 10) <= 20)).toBe(true);
    expect(lines.join('')).toBe('abcdefghij');
  });
  it('fitText passt in die Box', () => {
    const f = fitText(measure, 'Hallo Welt, das ist ein längerer Text mit mehreren Wörtern.', 400, 200);
    expect(f.lines.length * f.lineHeight).toBeLessThanOrEqual(200);
    expect(f.lines.every((l) => measure(l, f.fontSize) <= 400)).toBe(true);
    const small = fitText(measure, 'Hi', 400, 200);
    expect(small.fontSize).toBeGreaterThan(f.fontSize);
  });
  it('fitText kürzt mit Auslassung', () => {
    const f = fitText(measure, 'wort '.repeat(500), 100, 40, 40, 16);
    expect(f.truncated).toBe(true);
    expect(f.lines[f.lines.length - 1].endsWith('…')).toBe(true);
  });
  it('Kontrastfarbe', () => {
    expect(contrastTextColor('#ffffff')).toBe('#1b1f27');
    expect(contrastTextColor('#101820')).toBe('#ffffff');
    expect(contrastTextColor(undefined)).toBe('#1b1f27');
  });
});

describe('Homografie', () => {
  const dst: Quad = [
    [120, 80],
    [610, 130],
    [580, 420],
    [90, 350],
  ];
  const src: Quad = [
    [0, 0],
    [1024, 0],
    [1024, 576],
    [0, 576],
  ];
  it('bildet Ecken aufeinander ab', () => {
    const h = computeHomography(src, dst)!;
    for (let i = 0; i < 4; i += 1) {
      const p = applyHomography(h, src[i][0], src[i][1]);
      expect(p[0]).toBeCloseTo(dst[i][0], 5);
      expect(p[1]).toBeCloseTo(dst[i][1], 5);
    }
  });
  it('matrix3d bildet Ecken ab', () => {
    const css = quadToMatrix3d(1024, 576, dst)!;
    expect(css.startsWith('matrix3d(')).toBe(true);
    for (let i = 0; i < 4; i += 1) {
      const p = applyMatrix3d(css, src[i][0], src[i][1]);
      expect(p[0]).toBeCloseTo(dst[i][0], 3);
      expect(p[1]).toBeCloseTo(dst[i][1], 3);
    }
  });
  it('entartetes Ziel liefert null', () => {
    expect(quadToMatrix3d(100, 100, [[0, 0], [0, 0], [0, 0], [0, 0]])).toBeNull();
  });
});

describe('referrerPolicyFor', () => {
  it('Video-Player bekommen die Herkunft, alle anderen Seiten nichts', async () => {
    const { referrerPolicyFor } = await import('./helpers');
    for (const u of ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/abc', 'https://youtu.be/abc', 'https://player.vimeo.com/video/123']) {
      expect(referrerPolicyFor(u)).toBe('strict-origin-when-cross-origin');
    }
    for (const u of ['https://example.com/', 'https://evilyoutube.com/x', 'https://youtube.com.evil.org/x', 'kaputt', '']) {
      expect(referrerPolicyFor(u)).toBe('no-referrer');
    }
  });
});
