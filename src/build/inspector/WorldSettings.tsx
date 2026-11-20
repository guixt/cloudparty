import { useStore } from 'zustand';
import type { EnvironmentSpec, SkyPreset } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { labelForRef } from '../catalog';
import { Field, NumField, Section, TextField } from '../fields';

function directionOf(env: EnvironmentSpec): { azimuth: number; elevation: number } {
  const d = env.light.direction;
  return typeof d === 'string' ? { azimuth: 135, elevation: 50 } : d;
}

export function WorldSettings({ ctx }: { ctx: GameContext }) {
  const name = useStore(ctx.store, (s) => s.world.metadata.name);
  const env = useStore(ctx.store, (s) => s.world.environment);
  const entities = useStore(ctx.store, (s) => s.entities);
  const order = useStore(ctx.store, (s) => s.order);
  const setEnv = (next: Partial<EnvironmentSpec>) => ctx.store.getState().setEnvironment({ ...env, ...next }, { source: 'local' });
  const dir = directionOf(env);
  const skies: Record<SkyPreset, string> = { clear: 'Klarer Tag', dusk: 'Abenddämmerung', night: 'Nacht', custom: 'Eigene Farbe' };
  return (
    <>
      <h3 className="cp-heading">Insel</h3>
      <Field label="Name der Insel">
        <TextField testId="world-name" value={name} onChange={(v) => ctx.store.getState().setMetadata({ name: v })} />
      </Field>
      <Section title="Himmel und Licht">
        <Field label="Himmel">
          <select className="cp-select" data-testid="world-sky" value={env.sky.preset} onChange={(e) => setEnv({ sky: { ...env.sky, preset: e.target.value as SkyPreset } })}>
            {(Object.keys(skies) as SkyPreset[]).map((k) => (
              <option key={k} value={k}>
                {skies[k]}
              </option>
            ))}
          </select>
        </Field>
        {env.sky.preset === 'custom' && (
          <Field label="Himmelfarbe">
            <input type="color" className="cpb-color" value={env.sky.color ?? '#3f8fe8'} onChange={(e) => setEnv({ sky: { ...env.sky, color: e.target.value } })} />
          </Field>
        )}
        <div className="cpb-vec-row">
          <Field label="Lichtstärke">
            <NumField value={env.light.intensity} step={0.1} min={0} max={5} onChange={(v) => setEnv({ light: { ...env.light, intensity: v } })} />
          </Field>
          <Field label="Temperatur (K)">
            <NumField value={env.light.temperatureK} step={250} min={1500} max={12000} onChange={(v) => setEnv({ light: { ...env.light, temperatureK: v } })} />
          </Field>
        </div>
        <div className="cpb-vec-row">
          <Field label="Sonne Richtung (°)">
            <NumField value={dir.azimuth} step={15} onChange={(v) => setEnv({ light: { ...env.light, direction: { ...dir, azimuth: v } } })} />
          </Field>
          <Field label="Sonne Höhe (°)">
            <NumField value={dir.elevation} step={5} min={0} max={90} onChange={(v) => setEnv({ light: { ...env.light, direction: { ...dir, elevation: v } } })} />
          </Field>
        </div>
      </Section>
      <Section title={`Objekte (${order.length})`}>
        <div className="cpb-list">
          {order.map((id) => {
            const e = entities[id];
            if (!e) return null;
            return (
              <button key={id} className="cpb-list-item" data-testid={`entity-row-${id}`} onClick={() => ctx.store.getState().select(id)}>
                <span>{e.name || labelForRef(e.ref)}</span>
                <span className="cp-muted">{e.ref.replace('EntitySpec.', '')}</span>
              </button>
            );
          })}
          {order.length === 0 && <span className="cp-muted">Noch keine Objekte.</span>}
        </div>
      </Section>
    </>
  );
}
