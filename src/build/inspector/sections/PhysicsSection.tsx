import type { EntitySpec, PhysicsMode } from '../../../../shared/types';
import { Field, NumField, Section } from '../../fields';
import { PHYSICS_LABELS } from '../labels';

export function PhysicsSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const p = entity.physics ?? { mode: 'none' as PhysicsMode };
  const set = (next: Partial<typeof p>) => patch({ physics: { ...p, ...next } });
  return (
    <Section title="Physik">
      <Field label="Art">
        <select className="cp-select" data-testid="insp-physics" value={p.mode} onChange={(e) => set({ mode: e.target.value as PhysicsMode })}>
          {(Object.keys(PHYSICS_LABELS) as PhysicsMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {PHYSICS_LABELS[mode]}
            </option>
          ))}
        </select>
      </Field>
      {(p.mode === 'dynamic' || p.mode === 'static') && (
        <>
          {p.mode === 'dynamic' && (
            <Field label="Masse (kg)">
              <NumField value={p.mass ?? 1} step={0.5} min={0.01} onChange={(v) => set({ mass: v })} />
            </Field>
          )}
          <div className="cpb-vec-row">
            <Field label="Reibung">
              <NumField value={p.friction ?? 0.5} step={0.1} min={0} onChange={(v) => set({ friction: v })} />
            </Field>
            <Field label="Rückprall">
              <NumField value={p.restitution ?? 0.1} step={0.1} min={0} max={1} onChange={(v) => set({ restitution: v })} />
            </Field>
          </div>
        </>
      )}
    </Section>
  );
}
