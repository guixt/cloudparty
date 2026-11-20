import type { EntitySpec, MediaKind } from '../../../../shared/types';
import type { GameContext } from '../../../core/context';
import { Field, readFileAsDataUrl, Section, TextField } from '../../fields';
import { MEDIA_KINDS } from '../labels';

export function MediaSection({ ctx, entity, patch }: { ctx: GameContext; entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
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
