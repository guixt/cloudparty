import { useStore } from 'zustand';
import type { PhysicsMode } from '../../../shared/types';
import type { GameContext } from '../../core/context';
import { Field, Section, TextField } from '../fields';
import { PresetGrid, withPreset } from '../materialSection';
import { alignSelected, deleteSelected, distributeSelected, dropSelectedToGround, duplicateSelected, groupSelected, patchSelected, ungroupSelected } from '../placement';
import { ALIGN, PHYSICS_LABELS } from './labels';

export function MultiInspector({ ctx }: { ctx: GameContext }) {
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
