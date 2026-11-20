import type { EntitySpec, ParticlePreset } from '../../../../shared/types';
import { Field, NumField, Section } from '../../fields';
import { PARTICLE_LABELS } from '../labels';

export function ParticlesSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const p = entity.particles;
  return (
    <Section title="Partikel" open={!!p}>
      <Field label="Effekt">
        <select
          className="cp-select"
          data-testid="insp-particles"
          value={p?.preset ?? ''}
          onChange={(e) => patch({ particles: e.target.value ? { enabled: true, ...p, preset: e.target.value as ParticlePreset } : undefined })}
        >
          <option value="">Keiner</option>
          {(Object.keys(PARTICLE_LABELS) as ParticlePreset[]).map((k) => (
            <option key={k} value={k}>
              {PARTICLE_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      {p && (
        <>
          <label className="cpb-check">
            <input type="checkbox" checked={p.enabled} onChange={(e) => patch({ particles: { ...p, enabled: e.target.checked } })} /> Aktiv
          </label>
          <Field label="Rate (pro Sekunde)">
            <NumField value={p.rate ?? 50} step={10} min={1} max={2000} onChange={(v) => patch({ particles: { ...p, rate: v } })} />
          </Field>
        </>
      )}
    </Section>
  );
}
