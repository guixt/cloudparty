/**
 * Zeichenroutinen für die Canvas-Texturen der Medien-Flächen (Platzhalter,
 * Text, Bild mit Letterbox, Seitenanzeige, Pfeile).
 */
import { contrastTextColor, fitText, letterbox, shortUrl } from './helpers';

export type Ctx2D = CanvasRenderingContext2D;
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

export function font(size: number, weight = 600): string {
  return `${weight} ${size}px ${FONT}`;
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type PlaceholderTone = 'empty' | 'error' | 'loading';

/** Freundlicher Platzhalter („Kein Bild gewählt", Fehler, Lädt …). */
export function drawPlaceholder(ctx: Ctx2D, w: number, h: number, title: string, subtitle: string | undefined, tone: PlaceholderTone): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  if (tone === 'error') {
    g.addColorStop(0, '#5a2a2a');
    g.addColorStop(1, '#2e1717');
  } else {
    g.addColorStop(0, '#2c4468');
    g.addColorStop(1, '#16233a');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // dezentes Raster
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += w / 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += w / 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const u = Math.min(w, h);
  // Symbol: Bilderrahmen bzw. Warndreieck
  const cx = w / 2;
  const cy = h * 0.38;
  const s = u * 0.16;
  ctx.lineWidth = u * 0.015;
  ctx.strokeStyle = tone === 'error' ? '#ff9a8f' : '#8fc4ff';
  ctx.fillStyle = ctx.strokeStyle;
  if (tone === 'error') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s, cy + s * 0.8);
    ctx.lineTo(cx - s, cy + s * 0.8);
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(cx - u * 0.008, cy - s * 0.4, u * 0.016, s * 0.7);
    ctx.fillRect(cx - u * 0.01, cy + s * 0.42, u * 0.02, u * 0.02);
  } else {
    roundRect(ctx, cx - s * 1.2, cy - s * 0.8, s * 2.4, s * 1.6, u * 0.02);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 1.0, cy + s * 0.65);
    ctx.lineTo(cx - s * 0.3, cy - s * 0.1);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.35);
    ctx.lineTo(cx + s * 0.55, cy);
    ctx.lineTo(cx + s * 1.0, cy + s * 0.65);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + s * 0.6, cy - s * 0.4, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(u * 0.075, 700);
  ctx.fillText(title, w / 2, h * 0.68, w * 0.9);
  if (subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = font(u * 0.045, 500);
    ctx.fillText(subtitle, w / 2, h * 0.8, w * 0.9);
  }
}

/** Bild mit Letterbox (dunkler Hintergrund) einzeichnen. */
export function drawImageLetterboxed(ctx: Ctx2D, w: number, h: number, img: CanvasImageSource, iw: number, ih: number): void {
  ctx.fillStyle = '#0d1118';
  ctx.fillRect(0, 0, w, h);
  const box = letterbox(iw / Math.max(1, ih), w / h);
  const dw = w * box.w;
  const dh = h * box.h;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Text-Schild: Hintergrundfarbe, kontrastreiche Schrift, automatischer Umbruch und Schriftgröße. */
export function drawTextBoard(ctx: Ctx2D, w: number, h: number, text: string, background: string): void {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const fg = contrastTextColor(background);
  const pad = Math.round(Math.min(w, h) * 0.07);
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.012);
  ctx.strokeRect(pad / 2, pad / 2, w - pad, h - pad);
  ctx.globalAlpha = 1;
  if (!text.trim()) {
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.45;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(Math.min(w, h) * 0.1, 600);
    ctx.fillText('Kein Text', w / 2, h / 2, w - pad * 2);
    ctx.globalAlpha = 1;
    return;
  }
  const inner = { w: w - pad * 2.4, h: h - pad * 2.4 };
  const measure = (t: string, size: number) => {
    ctx.font = font(size, 600);
    return ctx.measureText(t).width;
  };
  const fit = fitText(measure, text, inner.w, inner.h, Math.min(w, h) * 0.3, 18);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(fit.fontSize, 600);
  const total = fit.lines.length * fit.lineHeight;
  let y = h / 2 - total / 2 + fit.lineHeight / 2;
  for (const line of fit.lines) {
    ctx.fillText(line, w / 2, y);
    y += fit.lineHeight;
  }
}

/** Seitenanzeige „2 / 7" als kleine Kapsel unten mittig. */
export function drawPageIndicator(ctx: Ctx2D, w: number, h: number, label: string): void {
  const size = h * 0.055;
  ctx.font = font(size, 700);
  const tw = ctx.measureText(label).width;
  const pw = tw + size * 1.6;
  const ph = size * 1.7;
  const x = (w - pw) / 2;
  const y = h - ph - h * 0.03;
  ctx.fillStyle = 'rgba(10,14,22,0.72)';
  roundRect(ctx, x, y, pw, ph, ph / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, y + ph / 2 + size * 0.04);
}

/** Platzhalter für die Web-Fläche (sichtbar bei Entfernung, im Bau-Modus und solange nichts geladen ist). */
export function drawWebPlaceholder(ctx: Ctx2D, w: number, h: number, url: string | undefined, hint: string): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f4f7fb');
  g.addColorStop(1, '#dbe4f0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const u = Math.min(w, h);
  // Browserleiste
  ctx.fillStyle = '#c8d3e3';
  ctx.fillRect(0, 0, w, h * 0.12);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, w * 0.12, h * 0.025, w * 0.8, h * 0.07, h * 0.035);
  ctx.fill();
  ['#ff6b5e', '#ffc14d', '#4cd08a'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(w * 0.03 + i * w * 0.03, h * 0.06, h * 0.018, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#44506a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(h * 0.04, 500);
  ctx.fillText(url ? shortUrl(url, 70) : 'about:blank', w * 0.14, h * 0.062, w * 0.76);
  // Globus
  const cx = w / 2;
  const cy = h * 0.42;
  const r = u * 0.16;
  ctx.strokeStyle = '#4da3ff';
  ctx.lineWidth = u * 0.014;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.fillStyle = '#1d2b44';
  ctx.textAlign = 'center';
  ctx.font = font(u * 0.065, 700);
  ctx.fillText(url ? 'Webseite' : 'Keine Webseite gewählt', w / 2, h * 0.7, w * 0.9);
  ctx.fillStyle = '#5a6a86';
  ctx.font = font(u * 0.04, 500);
  ctx.fillText(hint, w / 2, h * 0.8, w * 0.92);
}

/** Pfeil-Knopf (Folien-Navigation). */
export function drawArrowButton(ctx: Ctx2D, size: number, dir: 'prev' | 'next'): void {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(14,20,32,0.82)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.07;
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.11;
  const d = dir === 'next' ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(size / 2 - d * size * 0.1, size * 0.3);
  ctx.lineTo(size / 2 + d * size * 0.12, size / 2);
  ctx.lineTo(size / 2 - d * size * 0.1, size * 0.7);
  ctx.stroke();
}
