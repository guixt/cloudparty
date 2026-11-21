/** Material-Bereich des Inspectors: Voreinstellungen, Reflexion, Glas, Muster, Echtzeit-Spiegel. */
import { MATERIAL_PATTERNS, type EntitySpec, type MaterialPattern, type MaterialPreset, type MaterialSpec, MATERIAL_PRESETS } from '../../shared/types';
import { PATTERN_LABELS, PRESET_LABELS, presetMaterial } from '../world/entities/materialPresets';
import { useRef, useState } from 'react';
import { fileToTextureUrl } from '../world/media/upload';
import { Field, NumField, Section, TextField } from './fields';

/** Kleine Kugel-Vorschau je Voreinstellung (reines CSS). */
export const PRESET_PREVIEW: Record<MaterialPreset, string> = {
  standard: 'radial-gradient(circle at 35% 30%, #f0f0f0, #cccccc 45%, #7d7d7d)',
  metall: 'radial-gradient(circle at 35% 30%, #ffffff, #aeb4bd 35%, #3b4048 80%)',
  chrom: 'radial-gradient(circle at 35% 28%, #ffffff 0 10%, #d9e6f2 25%, #3e5a78 55%, #e8f0f8 75%, #8aa0b8)',
  gold: 'radial-gradient(circle at 35% 30%, #fff3b0, #d4af37 40%, #6b4e0b 85%)',
  glas: 'radial-gradient(circle at 35% 30%, #ffffff 0 8%, rgba(190,225,255,0.55) 30%, rgba(120,170,220,0.35) 70%)',
  spiegel: 'linear-gradient(135deg, #ffffff 0 18%, #b8c8d8 20%, #e9f1f8 55%, #8fa6bd)',
  lack: 'radial-gradient(circle at 35% 28%, #ffffff 0 7%, #ff6b78 20%, #d62839 55%, #6a0f1a)',
  holz: 'repeating-linear-gradient(8deg, #b97c45 0 6px, #8a5528 6px 9px)',
  stein: 'radial-gradient(circle at 35% 30%, #b4b6ba, #8d8f94 50%, #53555a)',
  gummi: 'radial-gradient(circle at 35% 30%, #556379, #2f3a4a 55%, #141a24)',
  neon: 'radial-gradient(circle, #ffffff 0 18%, #39ff88 45%, #0a8a40 85%)',
  hologramm: 'repeating-linear-gradient(0deg, rgba(64,224,255,0.85) 0 3px, rgba(10,74,102,0.45) 3px 6px)',
};

export function PresetGrid({ value, onPick, testId = 'insp-preset' }: { value?: MaterialPreset; onPick(p: MaterialPreset): void; testId?: string }) {
  return (
    <div className="cpb-presets" data-testid={testId}>
      {MATERIAL_PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          className={`cpb-preset${value === p ? ' cpb-preset-on' : ''}`}
          data-testid={`${testId}-${p}`}
          title={PRESET_LABELS[p]}
          onClick={() => onPick(p)}
        >
          <span className="cpb-preset-ball" style={{ background: PRESET_PREVIEW[p] }} />
          <span className="cpb-preset-name">{PRESET_LABELS[p]}</span>
        </button>
      ))}
    </div>
  );
}

/** Material nach Voreinstellung: konkrete Werte schreiben, `mirror` bleibt erhalten. */
export function withPreset(m: MaterialSpec | undefined, preset: MaterialPreset): MaterialSpec {
  return presetMaterial(preset, m);
}

export function MaterialSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const m = entity.material ?? {};
  const fileRef = useRef<HTMLInputElement>(null);
  const [texError, setTexError] = useState('');
  const set = (next: Partial<MaterialSpec>) => {
    const merged: MaterialSpec = { ...m, ...next };
    for (const key of Object.keys(merged) as (keyof MaterialSpec)[]) if (merged[key] === undefined || merged[key] === '') delete merged[key];
    patch({ material: merged });
  };
  return (
    <Section title="Material">
      <PresetGrid value={m.preset} onPick={(p) => patch({ material: withPreset(m, p) })} />
      <div className="cpb-colors">
        <Field label="Farbe">
          <input type="color" className="cpb-color" data-testid="insp-color" value={m.color ?? '#cccccc'} onChange={(e) => set({ color: e.target.value })} />
        </Field>
        <Field label="Leuchtfarbe">
          <span className="cp-row">
            <input type="color" className="cpb-color" data-testid="insp-emissive" value={m.emissive ?? '#000000'} onChange={(e) => set({ emissive: e.target.value })} />
            {m.emissive && (
              <button className="cp-button cpb-small" onClick={() => set({ emissive: undefined })}>
                Aus
              </button>
            )}
          </span>
        </Field>
      </div>
      <div className="cpb-vec-row">
        <Field label="Metallisch">
          <NumField value={m.metallic ?? 0} step={0.1} min={0} max={1} onChange={(v) => set({ metallic: v })} />
        </Field>
        <Field label="Rauheit">
          <NumField value={m.roughness ?? 0.8} step={0.1} min={0} max={1} onChange={(v) => set({ roughness: v })} />
        </Field>
      </div>
      <div className="cpb-vec-row">
        <Field label="Reflexion">
          <NumField value={m.reflect ?? 0} step={0.1} min={0} max={1} testId="insp-reflect" onChange={(v) => set({ reflect: v })} />
        </Field>
        <Field label="Klarlack">
          <NumField value={m.clearcoat ?? 0} step={0.1} min={0} max={1} testId="insp-clearcoat" onChange={(v) => set({ clearcoat: v })} />
        </Field>
      </div>
      <div className="cpb-vec-row">
        <Field label="Glas">
          <NumField value={m.glass ?? 0} step={0.1} min={0} max={1} testId="insp-glass" onChange={(v) => set({ glass: v })} />
        </Field>
        <Field label="Brechungsindex">
          <NumField value={m.ior ?? 1.5} step={0.1} min={1} max={2.5} testId="insp-ior" onChange={(v) => set({ ior: v })} />
        </Field>
      </div>
      <div className="cpb-vec-row">
        <Field label="Leuchtstärke">
          <NumField value={m.emissiveIntensity ?? 1} step={0.5} min={0} max={5} testId="insp-emissive-intensity" onChange={(v) => set({ emissiveIntensity: v })} />
        </Field>
        <Field label="Deckkraft">
          <NumField value={m.alpha ?? 1} step={0.1} min={0} max={1} testId="insp-alpha" onChange={(v) => set({ alpha: v })} />
        </Field>
      </div>
      <Field label="Muster">
        <select className="cp-select" data-testid="insp-pattern" value={m.pattern ?? 'none'} onChange={(e) => set({ pattern: e.target.value === 'none' ? undefined : (e.target.value as MaterialPattern) })}>
          {MATERIAL_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {PATTERN_LABELS[p]}
            </option>
          ))}
        </select>
      </Field>
      {m.pattern && m.pattern !== 'none' && (
        <Field label="Musterfarbe">
          <input type="color" className="cpb-color" data-testid="insp-pattern-color" value={m.patternColor ?? '#444444'} onChange={(e) => set({ patternColor: e.target.value })} />
        </Field>
      )}
      <Field label="Textur-Wiederholung">
        <NumField value={m.uvScale ?? 1} step={0.5} min={0.1} max={50} testId="insp-uvscale" onChange={(v) => set({ uvScale: v })} />
      </Field>
      <div className="cpb-texture" data-testid="insp-texture">
        <div className="cpb-field-label">Textur (Bild)</div>
        {m.textureUrl?.startsWith('data:') ? (
          <div className="cpb-texture-row">
            <img className="cpb-texture-preview" alt="" src={m.textureUrl} data-testid="insp-texture-preview" />
            <button type="button" className="cp-button cp-button-danger" data-testid="insp-texture-remove" onClick={() => set({ textureUrl: undefined })}>
              Entfernen
            </button>
          </div>
        ) : (
          <TextField value={m.textureUrl ?? ''} placeholder="https://… (am besten Bild hochladen)" onChange={(v) => set({ textureUrl: v || undefined })} />
        )}
        <button
          type="button"
          className="cp-button"
          data-testid="insp-texture-upload"
          onClick={() => fileRef.current?.click()}
        >
          Bild hochladen
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          data-testid="insp-texture-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            setTexError('');
            if (file) void fileToTextureUrl(file).then((url) => set({ textureUrl: url }), (err) => setTexError(err instanceof Error ? err.message : 'Upload fehlgeschlagen'));
          }}
        />
        {texError && <p className="cp-muted">{texError}</p>}
      </div>
      <label className="cpb-check">
        <input type="checkbox" data-testid="insp-mirror" checked={!!m.mirror} onChange={(e) => set({ mirror: e.target.checked || undefined })} />
        <span>Echtzeit-Spiegel</span>
        <span className="cp-muted"> – kostet Leistung</span>
      </label>
    </Section>
  );
}
