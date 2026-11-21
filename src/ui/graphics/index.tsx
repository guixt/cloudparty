/**
 * Paket 26: Grafik-Menü. Knopf „Grafik" (Werkzeugleiste), Dialog mit Qualitätsstufe, erweiterten Einzel-Einstellungen,
 * FPS-Anzeige und Start der Automatik (src/engine/qualityAuto.ts).
 */
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import type { GameContext, GameModule } from '../../core/context';
import type { PanelProps } from '../../core/ui';
import { OVERRIDE_RULES, QUALITY_LEVELS, QUALITY_PRESETS, isQualityLevel, type QualityFeatures, type QualityLevel } from '../../engine/quality';
import { bindHardwareScaling, createAutoQuality, type AutoQuality } from '../../engine/qualityAuto';
import { graphicsUi, setGraphicsOpen, setShowFps } from './state';
import './graphics.css';

export const TIER_INFO: Record<QualityLevel, { name: string; desc: string }> = {
  low: { name: 'Niedrig', desc: 'Harte Schatten, kein Gras, keine Spiegelungen und Nachbearbeitung, leicht reduzierte Auflösung. Für schwache Rechner.' },
  medium: { name: 'Mittel', desc: 'Weiche Schatten, Bloom und Glow, kleine Spiegel und Wasser-Spiegelung, etwas Gras.' },
  high: { name: 'Hoch', desc: 'Zusätzlich Umgebungs-Verdeckung (SSAO), Sonnenstrahlen, Wasser-Brechung, größere Spiegel, mehr Gras.' },
  ultra: { name: 'Ultra', desc: 'Höchste Schattenauflösung, Tiefenschärfe, größte Spiegel, volles Gras und viele Lichter. Braucht eine starke Grafikkarte.' },
};

type FieldKind = { type: 'bool' } | { type: 'select'; options: number[]; unit?: string } | { type: 'number'; step: number };
const FIELDS: { key: keyof QualityFeatures; label: string; kind: FieldKind }[] = [
  { key: 'softShadows', label: 'Schatten weich', kind: { type: 'bool' } },
  { key: 'shadowMapSize', label: 'Schattenauflösung', kind: { type: 'select', options: [512, 1024, 2048, 4096], unit: 'px' } },
  { key: 'probeSize', label: 'Reflexionssonde Größe', kind: { type: 'select', options: [0, 32, 64, 128, 256, 512], unit: 'px' } },
  { key: 'ssao', label: 'SSAO (Umgebungs-Verdeckung)', kind: { type: 'bool' } },
  { key: 'godRays', label: 'Sonnenstrahlen', kind: { type: 'bool' } },
  { key: 'depthOfField', label: 'Tiefenschärfe', kind: { type: 'bool' } },
  { key: 'bloom', label: 'Bloom', kind: { type: 'bool' } },
  { key: 'glow', label: 'Glow', kind: { type: 'bool' } },
  { key: 'fxaa', label: 'FXAA (Kantenglättung)', kind: { type: 'bool' } },
  { key: 'mirrorSize', label: 'Echtzeit-Spiegel (Größe)', kind: { type: 'select', options: [0, 256, 512, 1024, 2048], unit: 'px' } },
  { key: 'waterReflectionSize', label: 'Wasser-Spiegelung (Größe)', kind: { type: 'select', options: [0, 256, 512, 1024, 2048], unit: 'px' } },
  { key: 'waterRefraction', label: 'Wasser-Brechung', kind: { type: 'bool' } },
  { key: 'grassDensity', label: 'Gras-Dichte (0 bis 1)', kind: { type: 'number', step: 0.05 } },
  { key: 'particleScale', label: 'Partikel-Anteil (0 bis 1)', kind: { type: 'number', step: 0.1 } },
  { key: 'maxPointLights', label: 'Max. Punktlichter', kind: { type: 'number', step: 1 } },
  { key: 'hardwareScaling', label: 'Auflösungs-Skalierung (1 = voll, 2 = halb)', kind: { type: 'number', step: 0.25 } },
];

/** Name der Grafikkarte (WebGL), falls die Engine ihn kennt. */
function glRenderer(ctx: GameContext): string | null {
  return (ctx.engine as unknown as { getGlInfo?: () => { renderer?: string } }).getGlInfo?.().renderer ?? null;
}

function NumberField({ testId, value, step, min, max, onCommit }: { testId: string; value: number; step: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.'));
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      className="cp-input"
      data-testid={testId}
      step={step}
      min={min}
      max={max}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Tasten bleiben im Dialog (dort wird auch Esc behandelt).
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}

export function GraphicsDialog({ ctx, restartAuto, onClose }: { ctx: GameContext; restartAuto: () => void; onClose: () => void }) {
  const quality = ctx.quality;
  const [, setTick] = useState(0);
  const force = () => setTick((n) => n + 1);
  useEffect(() => quality.onChange(force), [quality]);
  const showFps = useStore(graphicsUi, (s) => s.showFps);
  const [advanced, setAdvanced] = useState(false);
  const auto = quality.isAuto();
  const level = quality.get();
  const features = quality.features();
  const overrides = quality.getOverrides();
  const preset = QUALITY_PRESETS[level];
  let renderer = '';
  try {
    renderer = glRenderer(ctx) || '';
  } catch {
    /* Engine ohne Info */
  }

  const pick = (value: string) => {
    if (value === 'auto') {
      quality.setAuto();
      restartAuto();
    } else if (isQualityLevel(value)) quality.set(value, { manual: true });
    force();
  };
  const setField = (key: keyof QualityFeatures, value: boolean | number) => {
    quality.setOverrides({ [key]: value === preset[key] ? undefined : value } as Partial<QualityFeatures>);
    force();
  };
  const stop = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
  };
  const tiers: { id: string; name: string; desc: string; on: boolean }[] = [
    { id: 'auto', name: 'Automatisch (empfohlen)', desc: `Cloudparty misst die Bildrate und wählt die Stufe selbst${auto ? ` (gerade: ${TIER_INFO[level].name})` : ''}.`, on: auto },
    ...QUALITY_LEVELS.map((l) => ({ id: l, name: TIER_INFO[l].name, desc: TIER_INFO[l].desc, on: !auto && level === l })),
  ];

  return (
    <div className="cp-modal-backdrop" data-testid="graphics-dialog" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={stop} onKeyUp={(e) => e.stopPropagation()}>
      <div className="cp-modal gfx-modal" role="dialog" aria-label="Grafik">
        <div className="gfx-head">
          <h2>Grafik</h2>
          <button type="button" className="cp-button" data-testid="graphics-close" onClick={onClose}>
            Schließen
          </button>
        </div>
        <div className="cp-heading">Qualität</div>
        {tiers.map((t) => (
          <label key={t.id} className={`gfx-tier${t.on ? ' gfx-tier-on' : ''}`}>
            <input type="radio" name="gfx-tier" value={t.id} checked={t.on} data-testid={`graphics-tier-${t.id}`} onChange={() => pick(t.id)} />
            <span>
              <span className="gfx-tier-name">{t.name}</span>
              <div className="gfx-tier-desc">{t.desc}</div>
            </span>
          </label>
        ))}
        <p className="gfx-note cp-muted">Auf schwächeren Rechnern wählt Cloudparty beim ersten Start automatisch eine passende Stufe.</p>

        <details className="gfx-adv" open={advanced} onToggle={(e) => setAdvanced((e.currentTarget as HTMLDetailsElement).open)}>
          <summary data-testid="graphics-advanced-toggle">Erweitert</summary>
          {advanced && (
            <>
              <div className="gfx-grid">
                {FIELDS.map((f) => {
                  const rule = OVERRIDE_RULES[f.key];
                  const value = features[f.key];
                  const changed = f.key in overrides;
                  const id = `graphics-f-${f.key}`;
                  return [
                    <label key={`${f.key}-l`} htmlFor={id} className={`gfx-field-label${changed ? ' gfx-changed' : ''}`}>
                      {f.label}
                    </label>,
                    f.kind.type === 'bool' ? (
                      <input key={f.key} id={id} type="checkbox" className="gfx-check" data-testid={id} checked={value as boolean} onChange={(e) => setField(f.key, e.target.checked)} />
                    ) : f.kind.type === 'select' ? (
                      <select key={f.key} id={id} className="cp-select" data-testid={id} value={String(value)} onChange={(e) => setField(f.key, Number(e.target.value))}>
                        {[...new Set([...f.kind.options, value as number])].sort((a, b) => a - b).map((o) => (
                          <option key={o} value={o}>
                            {o === 0 ? 'Aus' : `${o} ${f.kind.type === 'select' ? f.kind.unit : ''}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <NumberField key={f.key} testId={id} value={value as number} step={f.kind.step} min={(rule as { min: number }).min} max={(rule as { max: number }).max} onCommit={(n) => setField(f.key, n)} />
                    ),
                  ];
                })}
              </div>
              <div className="gfx-actions">
                <button type="button" className="cp-button" data-testid="graphics-reset" disabled={!Object.keys(overrides).length} onClick={() => { quality.setOverrides(null); force(); }}>
                  Zurücksetzen
                </button>
              </div>
            </>
          )}
        </details>

        <label className="gfx-fps-row">
          <input type="checkbox" data-testid="graphics-fps" checked={showFps} onChange={(e) => setShowFps(e.target.checked)} />
          <span>FPS anzeigen</span>
        </label>
        <div className="gfx-foot cp-muted" data-testid="graphics-renderer">
          Grafikkarte: {renderer || 'unbekannt'}
        </div>
      </div>
    </div>
  );
}

function ToggleButton() {
  const open = useStore(graphicsUi, (s) => s.open);
  return (
    <button type="button" className={`cp-button${open ? ' cp-button-active' : ''}`} data-testid="graphics-toggle" title="Grafik-Einstellungen" onClick={() => setGraphicsOpen(!open)}>
      Grafik
    </button>
  );
}

let autoHandle: AutoQuality | null = null;
const restartAuto = () => autoHandle?.restart();

function Overlay({ ctx }: PanelProps) {
  const open = useStore(graphicsUi, (s) => s.open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setGraphicsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return <GraphicsDialog ctx={ctx} restartAuto={restartAuto} onClose={() => setGraphicsOpen(false)} />;
}

export function FpsOverlay({ ctx }: PanelProps) {
  const show = useStore(graphicsUi, (s) => s.showFps);
  const [fps, setFps] = useState(0);
  const [, force] = useState(0);
  useEffect(() => {
    if (!show) return;
    const timer = setInterval(() => setFps(ctx.engine.getFps()), 500);
    const off = ctx.quality.onChange(() => force((n) => n + 1));
    return () => {
      clearInterval(timer);
      off();
    };
  }, [show, ctx]);
  if (!show) return null;
  const ms = fps > 0 ? 1000 / fps : 0;
  return (
    <div className="gfx-fps" data-testid="graphics-fps-overlay">
      {Math.round(fps)} FPS · {ms.toFixed(1)} ms · {TIER_INFO[ctx.quality.get()].name}
      {ctx.quality.isAuto() ? ' (auto)' : ''}
    </div>
  );
}

let cleanups: Array<() => void> = [];

const mod: GameModule = {
  id: 'graphics-ui',
  init(ctx) {
    cleanups.push(
      ctx.ui.register({ id: 'graphics-toggle', slot: 'toolbar', order: 85, component: ToggleButton }),
      ctx.ui.register({ id: 'graphics-dialog', slot: 'overlay', order: 70, component: Overlay }),
      ctx.ui.register({ id: 'graphics-fps', slot: 'top-right', order: 90, component: FpsOverlay }),
      bindHardwareScaling(ctx.engine, ctx.quality),
    );
    let renderer: string | null = null;
    try {
      renderer = glRenderer(ctx);
    } catch {
      /* ohne Info */
    }
    autoHandle = createAutoQuality({ quality: ctx.quality, hints: { renderer, userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent } });
    const observer = ctx.scene.onBeforeRenderObservable.add(() => autoHandle?.onFrame(ctx.engine.getDeltaTime()));
    cleanups.push(() => ctx.scene.onBeforeRenderObservable.remove(observer));
  },
  dispose() {
    for (const c of cleanups) c();
    cleanups = [];
    autoHandle = null;
    setGraphicsOpen(false);
  },
};
export default mod;
