import type { EntitySpec } from '../../../../shared/types';
import type { GameContext } from '../../../core/context';
import { Field, readFileAsDataUrl, Section, TextField } from '../../fields';

export function ModelSection({ ctx, entity, patch }: { ctx: GameContext; entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
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
