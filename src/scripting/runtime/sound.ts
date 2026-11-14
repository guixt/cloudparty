/**
 * Kleine WebAudio-Klangsynthese für world.playSound / world.playTone.
 * Der AudioContext entsteht lazy; Fehler und fehlendes Audio werden still ignoriert.
 */
let audio: AudioContext | null | undefined;

function getAudio(): AudioContext | null {
  if (audio !== undefined) return audio;
  try {
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audio = Ctor ? new Ctor() : null;
  } catch {
    audio = null;
  }
  return audio;
}

function resume(): void {
  try {
    const ctx = audio;
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
  } catch {
    /* ignorieren */
  }
}

/** Entsperrt Audio bei der ersten Nutzergeste. Liefert eine Abmeldefunktion. */
export function installAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};
  const events = ['pointerdown', 'keydown', 'touchstart'];
  const handler = () => {
    getAudio();
    resume();
    if (audio && audio.state === 'running') off();
  };
  const off = () => events.forEach((name) => window.removeEventListener(name, handler, true));
  events.forEach((name) => window.addEventListener(name, handler, true));
  return off;
}

interface ToneSpec {
  type?: OscillatorType;
  from: number;
  to?: number;
  start?: number;
  duration: number;
  gain?: number;
}

function tone(ctx: AudioContext, spec: ToneSpec): void {
  const t0 = ctx.currentTime + (spec.start ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = spec.type ?? 'sine';
  osc.frequency.setValueAtTime(spec.from, t0);
  if (spec.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.to), t0 + spec.duration);
  const peak = spec.gain ?? 0.2;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.01, spec.duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + spec.duration + 0.02);
}

function whoosh(ctx: AudioContext): void {
  const length = Math.floor(ctx.sampleRate * 0.45);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  const t0 = ctx.currentTime;
  filter.frequency.setValueAtTime(300, t0);
  filter.frequency.exponentialRampToValueAtTime(2500, t0 + 0.4);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(t0);
}

export function playNamedSound(name: string): void {
  try {
    const ctx = getAudio();
    if (!ctx) return;
    resume();
    switch (name) {
      case 'click':
        tone(ctx, { type: 'square', from: 1400, to: 900, duration: 0.05, gain: 0.08 });
        break;
      case 'ding':
        tone(ctx, { from: 880, duration: 0.7, gain: 0.2 });
        tone(ctx, { from: 1320, duration: 0.5, gain: 0.08 });
        break;
      case 'pop':
        tone(ctx, { from: 700, to: 150, duration: 0.12, gain: 0.25 });
        break;
      case 'whoosh':
        whoosh(ctx);
        break;
      case 'error':
        tone(ctx, { type: 'sawtooth', from: 180, duration: 0.14, gain: 0.12 });
        tone(ctx, { type: 'sawtooth', from: 140, start: 0.17, duration: 0.2, gain: 0.12 });
        break;
      default:
        break;
    }
  } catch {
    /* Audio nicht verfügbar */
  }
}

export function playTone(frequency: number, duration: number): void {
  try {
    const ctx = getAudio();
    if (!ctx) return;
    resume();
    tone(ctx, { from: frequency, duration, gain: 0.2 });
  } catch {
    /* Audio nicht verfügbar */
  }
}
