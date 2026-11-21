import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQualityController, type QualityApi } from './quality';
import { bindHardwareScaling, createAutoQuality, frameStats, startTier } from './qualityAuto';

function memoryStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
}
afterEach(() => vi.unstubAllGlobals());

/** Speist Bilder mit fester Dauer ein; `frameMs` darf sich je nach aktueller Stufe ändern. */
function run(q: QualityApi, frameMs: (q: QualityApi) => number, seconds: number, hints = { renderer: 'NVIDIA', userAgent: 'Mozilla Desktop' }, auto = createAutoQuality({ quality: q, hints, now: () => clock }), startT = clock) {
  const end = startT + seconds * 1000;
  while (clock < end) {
    const d = frameMs(q);
    clock += d;
    auto.onFrame(d);
  }
  return auto;
}
let clock = 0;

describe('Automatik', () => {
  it('Messwerte: 95. Perzentil, Ausreißer werden ignoriert', () => {
    const s = frameStats([...Array(95).fill(10), ...Array(5).fill(40), 900]);
    expect(s.count).toBe(100);
    expect(s.avgMs).toBeCloseTo(11.5, 0);
    expect(s.p95Ms).toBe(40);
  });

  it('Startstufe: Software-Renderer → low, Handy → höchstens medium', () => {
    expect(startTier(null, { renderer: 'ANGLE (Google, Vulkan, SwiftShader Device)' })).toBe('low');
    expect(startTier('ultra', { renderer: 'llvmpipe (LLVM 15)' })).toBe('low');
    expect(startTier(null, { renderer: 'Microsoft Basic Render Driver' })).toBe('low');
    expect(startTier(null, { renderer: 'Mali-G78', userAgent: 'Mozilla/5.0 (Linux; Android 13) Mobile' })).toBe('medium');
    expect(startTier('low', { userAgent: 'iPhone' })).toBe('low');
    expect(startTier(null, { renderer: 'NVIDIA GeForce', userAgent: 'Windows' })).toBe('high');
  });

  it('schneller Rechner bleibt auf high', () => {
    memoryStorage();
    clock = 0;
    const q = createQualityController();
    const auto = run(q, () => 8, 20);
    expect(q.get()).toBe('high');
    expect(auto.phase()).toBe('watch');
  });

  it('langsamer Rechner steigt schrittweise ab, höchstens dreimal', () => {
    memoryStorage();
    clock = 0;
    const q = createQualityController();
    const seen: string[] = [];
    q.onChange((l) => seen.push(l));
    run(q, () => 100, 60);
    expect(seen).toEqual(['medium', 'low']);
    expect(q.get()).toBe('low');
  });

  it('mittelschneller Rechner hält an, sobald 40 fps erreicht sind', () => {
    memoryStorage();
    clock = 0;
    const q = createQualityController();
    run(q, (x) => (x.get() === 'high' ? 40 : 15), 30);
    expect(q.get()).toBe('medium');
  });

  it('Software-Renderer startet sofort mit low', () => {
    memoryStorage();
    clock = 0;
    const q = createQualityController();
    createAutoQuality({ quality: q, hints: { renderer: 'ANGLE (SwiftShader)' }, now: () => clock });
    expect(q.get()).toBe('low');
    expect(localStorage.getItem('cloudparty.quality')).toBe('low');
  });

  it('manuelle Wahl wird nie verändert', () => {
    memoryStorage();
    clock = 0;
    const q = createQualityController();
    q.set('ultra', { manual: true });
    const auto = createAutoQuality({ quality: q, hints: { renderer: 'SwiftShader' }, now: () => clock });
    expect(auto.phase()).toBe('off');
    run(q, () => 200, 60, undefined, auto);
    expect(q.get()).toBe('ultra');
  });

  it('Wachhund senkt bei dauerhaft < 25 fps höchstens alle 30 s', () => {
    memoryStorage();
    clock = 0;
    const q = createQualityController('ultra');
    let slow = false;
    const auto = createAutoQuality({ quality: q, hints: {}, now: () => clock });
    run(q, () => (slow ? 60 : 10), 8, undefined, auto); // Messung gut
    expect(q.get()).toBe('ultra');
    slow = true;
    const t0 = clock;
    run(q, () => 60, 12, undefined, auto, t0); // 16 fps
    expect(q.get()).toBe('high');
    run(q, () => 60, 10, undefined, auto, clock);
    expect(q.get()).toBe('high'); // Abkühlzeit
  });

  it('„Automatisch" nach manueller Wahl startet die Messung neu', () => {
    memoryStorage();
    clock = 0;
    const q = createQualityController();
    q.set('high', { manual: true });
    const auto = createAutoQuality({ quality: q, hints: {}, now: () => clock });
    q.setAuto();
    auto.restart();
    expect(auto.phase()).toBe('warmup');
    run(q, () => 100, 20, undefined, auto);
    expect(q.get()).not.toBe('high');
  });
});

describe('Auflösung', () => {
  it('wendet hardwareScaling an (mindestens 1) und bei Änderungen', () => {
    memoryStorage();
    const calls: number[] = [];
    let resizes = 0;
    const engine = { setHardwareScalingLevel: (l: number) => void calls.push(l), resize: () => void resizes++ };
    const q = createQualityController('low');
    const off = bindHardwareScaling(engine, q);
    q.set('high');
    q.setOverrides({ hardwareScaling: 2 });
    q.setOverrides({ hardwareScaling: 2 });
    off();
    q.set('low');
    expect(calls).toEqual([1.5, 1, 2]);
    expect(resizes).toBe(3);
  });
});
