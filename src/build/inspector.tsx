import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { EntitySpec, EnvironmentSpec, MaterialSpec, MediaKind, ParticlePreset, PhysicsMode, SkyPreset } from '../../shared/types';
import type { GameContext } from '../core/context';
import type { PanelProps } from '../core/ui';
import { labelForRef } from './catalog';
import { MaterialSection, PresetGrid, withPreset } from './materialSection';
import { Field, NumField, readFileAsDataUrl, Section, TextField, Vec3Field } from './fields';
import { eulerDegFromQuat, quatFromEulerDeg } from './logic';
import { alignSelected, deleteSelected, distributeSelected, dropToGround, dropSelectedToGround, duplicateSelected, groupSelected, patchSelected, ungroupSelected } from './placement';
import type { AlignMode } from './multi';

const KNOWN_STATE = ['text', 'seats', 'intensity', 'on'] as const;

function useEntity(ctx: GameContext, id: string) {
  const entity = useStore(ctx.store, (s) => s.entities[id]);
  const patch = (p: Partial<EntitySpec>) => ctx.store.getState().updateEntity(id, p, { source: 'local' });
  return { entity, patch };
}

function TransformSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const t = entity.transform;
  const euler = eulerDegFromQuat(t.rot);
  return (
    <Section title="Transformation">
      <Vec3Field label="Position (m)" value={t.pos} step={0.25} testId="insp-pos" onChange={(pos) => patch({ transform: { ...t, pos } })} />
      <Vec3Field label="Drehung (°)" value={euler} step={15} testId="insp-rot" onChange={(e) => patch({ transform: { ...t, rot: quatFromEulerDeg(e[0], e[1], e[2]) } })} />
      <Vec3Field label="Skalierung" value={t.scale} step={0.25} testId="insp-scale" onChange={(scale) => patch({ transform: { ...t, scale } })} />
    </Section>
  );
}

const PHYSICS_LABELS: Record<PhysicsMode, string> = { none: 'Keine', static: 'Statisch', dynamic: 'Dynamisch', trigger: 'Auslöser (Trigger)' };

function PhysicsSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
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

const PARTICLE_LABELS: Record<ParticlePreset, string> = { fire: 'Feuer', sparks: 'Funken', smoke: 'Rauch', confetti: 'Konfetti' };

function ParticlesSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
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

function StateSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const state = entity.state ?? {};
  const rest = Object.fromEntries(Object.entries(state).filter(([k]) => !(KNOWN_STATE as readonly string[]).includes(k)));
  const restJson = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
  const [draft, setDraft] = useState(restJson);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(restJson);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);
  const setKey = (key: string, value: unknown) => {
    const next = { ...state };
    if (value === undefined) delete next[key];
    else next[key] = value;
    patch({ state: Object.keys(next).length ? next : undefined });
  };
  const missing = KNOWN_STATE.filter((k) => !(k in state));
  const labels = { text: 'Text', seats: 'Sitzplätze', intensity: 'Intensität', on: 'An/Aus' } as const;
  const defaults: Record<string, unknown> = { text: '', seats: 1, intensity: 1, on: true };
  return (
    <Section title="Zustand" open={Object.keys(state).length > 0}>
      {'text' in state && (
        <Field label="Text">
          <TextField multiline testId="insp-state-text" value={String(state.text ?? '')} onChange={(v) => setKey('text', v)} />
        </Field>
      )}
      {'seats' in state && (
        <Field label="Sitzplätze">
          <NumField value={Number(state.seats) || 0} step={1} min={0} max={20} onChange={(v) => setKey('seats', Math.round(v))} />
        </Field>
      )}
      {'intensity' in state && (
        <Field label="Intensität">
          <NumField value={Number(state.intensity) || 0} step={0.1} min={0} onChange={(v) => setKey('intensity', v)} />
        </Field>
      )}
      {'on' in state && (
        <label className="cpb-check">
          <input type="checkbox" checked={state.on !== false} onChange={(e) => setKey('on', e.target.checked)} /> An
        </label>
      )}
      <Field label="Weitere Werte (JSON)">
        <textarea
          className="cp-textarea cpb-mono"
          rows={3}
          data-testid="insp-state-json"
          value={draft}
          placeholder='{ "schluessel": "wert" }'
          onChange={(e) => {
            setDraft(e.target.value);
            try {
              const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : {};
              if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Objekt erwartet');
              setError(null);
              const known = Object.fromEntries(Object.entries(state).filter(([k]) => (KNOWN_STATE as readonly string[]).includes(k)));
              const merged = { ...known, ...parsed };
              patch({ state: Object.keys(merged).length ? merged : undefined });
            } catch {
              setError('Ungültiges JSON');
            }
          }}
        />
      </Field>
      {error && <div className="cpb-error">{error}</div>}
      {missing.length > 0 && (
        <div className="cpb-chips">
          {missing.map((k) => (
            <button key={k} className="cp-button cpb-small" onClick={() => setKey(k, defaults[k])}>
              + {labels[k]}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

const MEDIA_KINDS: Record<MediaKind, string> = { image: 'Bild', web: 'Webseite', video: 'Video', slides: 'Folien', text: 'Text' };

function MediaSection({ ctx, entity, patch }: { ctx: GameContext; entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const media = entity.media;
  if (!media && !entity.ref.startsWith('EntitySpec.media-')) return null;
  const m = media ?? { kind: entity.ref.replace('EntitySpec.media-', '') as MediaKind };
  const set = (next: Partial<typeof m>) => patch({ media: { ...m, ...next } });
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      set({ url: await readFileAsDataUrl(file) });
    } catch (error) {
      ctx.bus.emit('ui.toast', { text: (error as Error).message, kind: 'error' });
    }
  };
  return (
    <Section title="Medien">
      <Field label="Art">
        <select className="cp-select" value={m.kind} onChange={(e) => set({ kind: e.target.value as MediaKind })}>
          {(Object.keys(MEDIA_KINDS) as MediaKind[]).map((k) => (
            <option key={k} value={k}>
              {MEDIA_KINDS[k]}
            </option>
          ))}
        </select>
      </Field>
      {(m.kind === 'image' || m.kind === 'web' || m.kind === 'video') && (
        <>
          <Field label="URL">
            <TextField testId="insp-media-url" value={m.url?.startsWith('data:') ? '(hochgeladene Datei)' : (m.url ?? '')} placeholder="https://…" onChange={(v) => set({ url: v })} />
          </Field>
          {m.kind !== 'web' && (
            <Field label="Oder Datei hochladen">
              <input type="file" accept={m.kind === 'image' ? 'image/*' : 'video/*'} className="cpb-file" onChange={(e) => void upload(e.target.files?.[0])} />
            </Field>
          )}
        </>
      )}
      {m.kind === 'slides' && (
        <Field label="Folien-URLs (eine pro Zeile)">
          <TextField multiline testId="insp-media-slides" value={(m.urls ?? []).join('\n')} onChange={(v) => set({ urls: v.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </Field>
      )}
      {m.kind === 'text' && (
        <Field label="Text">
          <TextField multiline testId="insp-media-text" value={m.text ?? ''} onChange={(v) => set({ text: v })} />
        </Field>
      )}
    </Section>
  );
}

function ModelSection({ ctx, entity, patch }: { ctx: GameContext; entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  if (entity.ref !== 'EntitySpec.model') return null;
  const url = entity.modelUrl ?? '';
  return (
    <Section title="3D-Modell">
      <Field label="glTF/GLB-URL">
        <TextField value={url.startsWith('data:') ? '(hochgeladene Datei)' : url} placeholder="https://…/modell.glb" onChange={(v) => patch({ modelUrl: v })} />
      </Field>
      <Field label="Oder Datei hochladen">
        <input
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          className="cpb-file"
          data-testid="insp-model-file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              patch({ modelUrl: await readFileAsDataUrl(file) });
            } catch (error) {
              ctx.bus.emit('ui.toast', { text: (error as Error).message, kind: 'error' });
            }
          }}
        />
      </Field>
    </Section>
  );
}

function ScriptSection({ ctx, entity, patch }: { ctx: GameContext; entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const script = entity.script;
  const lines = script?.source ? script.source.split('\n').length : 0;
  return (
    <Section title="Skript">
      <div className="cp-muted">{lines > 0 ? `${lines} ${lines === 1 ? 'Zeile' : 'Zeilen'}` : '(kein Skript)'}</div>
      <label className="cpb-check">
        <input type="checkbox" disabled={!script} checked={script?.enabled ?? false} onChange={(e) => script && patch({ script: { ...script, enabled: e.target.checked } })} /> Skript aktiv
      </label>
      <button className="cp-button cpb-wide" data-testid="insp-edit-script" onClick={() => ctx.bus.emit('ui.openScriptEditor', { entityId: entity.id })}>
        Skript bearbeiten
      </button>
      <button className="cp-button cpb-wide" data-testid="insp-edit-graph" onClick={() => ctx.bus.emit('ui.openGraphEditor', { entityId: entity.id })}>
        {entity.graph ? 'Logik-Graph bearbeiten' : 'Logik-Graph erstellen'}
      </button>
    </Section>
  );
}

function EntityInspector({ ctx, id }: { ctx: GameContext; id: string }) {
  const { entity, patch } = useEntity(ctx, id);
  if (!entity) return null;
  return (
    <>
      <h3 className="cp-heading">Objekt</h3>
      <Field label="Name">
        <TextField testId="insp-name" value={entity.name ?? ''} placeholder={labelForRef(entity.ref)} onChange={(v) => patch({ name: v || undefined })} />
      </Field>
      {entity.group && (
        <div className="cpb-group-line" data-testid="insp-group-line">
          <span>
            Gruppe: <strong>{entity.groupName || 'Gruppe'}</strong>
          </span>
          <button className="cp-button cpb-small" data-testid="insp-pick-single" onClick={() => ctx.store.getState().selectMany([id])}>
            Nur dieses Objekt wählen
          </button>
        </div>
      )}
      <div className="cpb-ref">
        Typ: <strong>{labelForRef(entity.ref)}</strong> <span className="cp-muted">({entity.ref})</span>
      </div>
      <div className="cpb-actions">
        <button className="cp-button" data-testid="insp-duplicate" title="Duplizieren (Strg+D)" onClick={() => duplicateSelected(ctx)}>
          Duplizieren
        </button>
        <button className="cp-button" data-testid="insp-ground" onClick={() => dropToGround(ctx, id)}>
          Auf den Boden setzen
        </button>
        <button className="cp-button cp-button-danger" data-testid="insp-delete" title="Löschen (Entf)" onClick={() => deleteSelected(ctx)}>
          Löschen
        </button>
      </div>
      <TransformSection entity={entity} patch={patch} />
      <MaterialSection entity={entity} patch={patch} />
      <PhysicsSection entity={entity} patch={patch} />
      <ParticlesSection entity={entity} patch={patch} />
      <StateSection entity={entity} patch={patch} />
      <MediaSection ctx={ctx} entity={entity} patch={patch} />
      <ModelSection ctx={ctx} entity={entity} patch={patch} />
      <ScriptSection ctx={ctx} entity={entity} patch={patch} />
    </>
  );
}

const ALIGN: { mode: AlignMode; label: string }[] = [
  { mode: 'x-min', label: 'Links' },
  { mode: 'x-mid', label: 'Mitte (X)' },
  { mode: 'x-max', label: 'Rechts' },
  { mode: 'z-min', label: 'Vorn' },
  { mode: 'z-mid', label: 'Mitte (Z)' },
  { mode: 'z-max', label: 'Hinten' },
  { mode: 'ground', label: 'Boden' },
];

function MultiInspector({ ctx }: { ctx: GameContext }) {
  const ids = useStore(ctx.store, (s) => s.selectedIds);
  const entities = useStore(ctx.store, (s) => s.entities);
  const members = ids.map((id) => entities[id]).filter(Boolean);
  const groups = new Set(members.map((e) => e.group ?? ''));
  const oneGroup = groups.size === 1 && members[0]?.group ? members[0].group : null;
  const groupName = oneGroup ? (members[0].groupName ?? '') : '';
  const color = members[0]?.material?.color ?? '#cccccc';
  const setName = (name: string) => patchSelected(ctx, () => ({ groupName: name || undefined }));
  const setColor = (c: string) => patchSelected(ctx, (e) => ({ material: { ...(e.material ?? {}), color: c } }));
  const setPhysics = (mode: PhysicsMode) => patchSelected(ctx, (e) => ({ physics: { ...(e.physics ?? { mode: 'none' }), mode } }));
  const anyGrouped = members.some((e) => e.group);
  return (
    <>
      <h3 className="cp-heading">{oneGroup ? 'Gruppe' : 'Auswahl'}</h3>
      {oneGroup ? (
        <>
          <Field label="Gruppenname">
            <TextField testId="multi-group-name" value={groupName} placeholder="Gruppe" onChange={setName} />
          </Field>
          <div className="cp-muted" data-testid="multi-count">{members.length} Objekte in der Gruppe</div>
        </>
      ) : (
        <div className="cpb-ref" data-testid="multi-count">
          <strong>{members.length} Objekte gewählt</strong>
        </div>
      )}
      <div className="cpb-actions">
        <button className="cp-button" data-testid="multi-group" title="Gruppieren (Strg+G)" disabled={oneGroup !== null} onClick={() => groupSelected(ctx)}>
          Gruppieren
        </button>
        <button className="cp-button" data-testid="multi-ungroup" title="Auflösen (Strg+Umschalt+G)" disabled={!anyGrouped} onClick={() => ungroupSelected(ctx)}>
          Auflösen
        </button>
        <button className="cp-button" data-testid="multi-duplicate" title="Duplizieren (Strg+D)" onClick={() => duplicateSelected(ctx)}>
          Duplizieren
        </button>
        <button className="cp-button cp-button-danger" data-testid="multi-delete" title="Löschen (Entf)" onClick={() => deleteSelected(ctx)}>
          Löschen
        </button>
      </div>
      <Section title="Für alle setzen">
        <Field label="Farbe">
          <input type="color" className="cpb-color" data-testid="multi-color" value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
        <div className="cpb-field-label">Material-Voreinstellung für alle</div>
        <PresetGrid testId="multi-preset" onPick={(p) => patchSelected(ctx, (e) => ({ material: withPreset(e.material, p) }))} />
        <Field label="Physik">
          <select className="cp-select" data-testid="multi-physics" value="" onChange={(e) => e.target.value && setPhysics(e.target.value as PhysicsMode)}>
            <option value="">(unverändert)</option>
            {(Object.keys(PHYSICS_LABELS) as PhysicsMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {PHYSICS_LABELS[mode]}
              </option>
            ))}
          </select>
        </Field>
        <button className="cp-button cpb-wide" data-testid="multi-ground" onClick={() => dropSelectedToGround(ctx)}>
          Auf den Boden setzen
        </button>
      </Section>
      <Section title="Ausrichten und Verteilen">
        <div className="cpb-grid">
          {ALIGN.map((a) => (
            <button key={a.mode} className="cp-button" data-testid={`align-${a.mode}`} onClick={() => alignSelected(ctx, a.mode)}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="cpb-grid">
          <button className="cp-button" data-testid="distribute-x" disabled={members.length < 3} onClick={() => distributeSelected(ctx, 'x')}>
            Verteilen X
          </button>
          <button className="cp-button" data-testid="distribute-z" disabled={members.length < 3} onClick={() => distributeSelected(ctx, 'z')}>
            Verteilen Z
          </button>
        </div>
      </Section>
    </>
  );
}

function directionOf(env: EnvironmentSpec): { azimuth: number; elevation: number } {
  const d = env.light.direction;
  return typeof d === 'string' ? { azimuth: 135, elevation: 50 } : d;
}

function WorldSettings({ ctx }: { ctx: GameContext }) {
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

export function Inspector({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const selection = useStore(ctx.store, (s) => s.selection);
  const count = useStore(ctx.store, (s) => s.selectedIds.length);
  if (mode !== 'build') return null;
  return (
    <div className="cp-panel cpb-panel cpb-inspector cp-panel-scroll" data-testid="inspector">
      {count > 1 ? <MultiInspector ctx={ctx} /> : selection ? <EntityInspector ctx={ctx} id={selection} key={selection} /> : <WorldSettings ctx={ctx} />}
    </div>
  );
}
