import { useEffect, useState } from 'react';
import type { EntitySpec } from '../../../../shared/types';
import { Field, NumField, Section, TextField } from '../../fields';
import { KNOWN_STATE } from '../labels';

export function StateSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
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
