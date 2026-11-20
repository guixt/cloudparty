import type { GameContext } from '../../core/context';
import { labelForRef } from '../catalog';
import { Field, TextField } from '../fields';
import { MaterialSection } from '../materialSection';
import { deleteSelected, dropToGround, duplicateSelected } from '../placement';
import { useEntity } from './useEntity';
import { TransformSection } from './sections/TransformSection';
import { PhysicsSection } from './sections/PhysicsSection';
import { ParticlesSection } from './sections/ParticlesSection';
import { StateSection } from './sections/StateSection';
import { MediaSection } from './sections/MediaSection';
import { ModelSection } from './sections/ModelSection';
import { ScriptSection } from './sections/ScriptSection';

export function EntityInspector({ ctx, id }: { ctx: GameContext; id: string }) {
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
