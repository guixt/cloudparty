/** Oberfläche: Gesten-/Flug-Leiste (Slot toolbar) und Aussehen-Dialog (Slot overlay). */
import { useState } from 'react';
import { useStore } from 'zustand';
import { DEFAULT_APPEARANCE, EMOTE_NAMES, type AvatarAppearance } from '../../../shared/avatar';
import type { PanelProps } from '../../core/ui';
import { MAX_NAME_LENGTH } from './appearance';
import { EMOTE_LABELS } from './emotes';
import './ui.css';
import { avatarActions, avatarUi } from './uiState';

export const SKIN_PRESETS = ['#f3d3b8', '#e0b089', '#c68e62', '#8d5a3b', '#5a3a28'];
export const HAIR_PRESETS = ['#1d1612', '#3b2a1e', '#7a4a24', '#c9a24d', '#d9d2c5', '#b5412e', '#3f6fd1'];
export const CLOTH_PRESETS = ['#3f8f4f', '#d9453a', '#3a7bd9', '#f2c230', '#d94fa0', '#f2f2f2', '#2f4468', '#4b3a2a', '#222222'];

export function GesturesPanel({ ctx }: PanelProps) {
  const flying = useStore(avatarUi, (s) => s.flying);
  const canFly = useStore(avatarUi, (s) => s.canFly);
  return (
    <div className="cpa-gestures" data-testid="avatar-gestures">
      {EMOTE_NAMES.map((name, i) => (
        <button key={name} type="button" className="cp-button" data-emote={name} onClick={() => ctx.bus.emit('avatar.requestEmote', { name })} title={`Taste ${i + 1}`}>
          <span className="cpa-key">{i + 1}</span>
          {EMOTE_LABELS[name]}
        </button>
      ))}
      <span className="cpa-sep" />
      <button type="button" className={`cp-button${flying ? ' cp-button-active' : ''}`} data-action="fly" disabled={!canFly && !flying} aria-pressed={flying} onClick={() => avatarActions.toggleFly()} title="Fliegen ein/aus (F)">
        <span className="cpa-key">F</span>
        Fliegen{flying ? ': an' : ''}
      </button>
      <button type="button" className="cp-button" data-action="appearance" onClick={() => avatarUi.setState({ appearanceOpen: true })}>
        Aussehen
      </button>
    </div>
  );
}

export interface AppearanceEditorProps {
  ctx: PanelProps['ctx'];
  onChange(appearance: AvatarAppearance, name: string): void;
}

const FIELDS: { key: keyof AvatarAppearance; label: string; presets: string[] }[] = [
  { key: 'skin', label: 'Hautfarbe', presets: SKIN_PRESETS },
  { key: 'hair', label: 'Haarfarbe', presets: HAIR_PRESETS },
  { key: 'shirt', label: 'T-Shirt', presets: CLOTH_PRESETS },
  { key: 'pants', label: 'Hose', presets: CLOTH_PRESETS },
];

export function AppearanceDialog({ ctx, onChange }: AppearanceEditorProps) {
  const open = useStore(avatarUi, (s) => s.appearanceOpen);
  const [appearance, setAppearance] = useState<AvatarAppearance>({ ...ctx.localAvatar.appearance });
  const [name, setName] = useState(ctx.localAvatar.identity.displayName);
  if (!open) return null;

  const update = (next: AvatarAppearance, nextName = name) => {
    setAppearance(next);
    onChange(next, nextName);
  };
  const close = () => avatarUi.setState({ appearanceOpen: false });

  return (
    <div className="cp-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()} data-testid="avatar-appearance">
      <div className="cp-modal cpa-modal" role="dialog" aria-label="Aussehen">
        <div className="cp-title">Aussehen</div>
        <label className="cp-label" htmlFor="cpa-name">
          Anzeigename
        </label>
        <input
          id="cpa-name"
          className="cp-input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => {
            setName(e.target.value);
            onChange(appearance, e.target.value);
          }}
        />
        {FIELDS.map((f) => (
          <div key={f.key}>
            <div className="cp-label">{f.label}</div>
            <div className="cpa-colors">
              <div className="cpa-swatches">
                {f.presets.map((c) => (
                  <button key={c} type="button" className="cpa-swatch" style={{ background: c }} aria-label={`${f.label} ${c}`} aria-pressed={appearance[f.key] === c} onClick={() => update({ ...appearance, [f.key]: c })} />
                ))}
              </div>
              <input className="cpa-color" type="color" aria-label={`${f.label} frei wählen`} value={appearance[f.key]} onChange={(e) => update({ ...appearance, [f.key]: e.target.value })} />
            </div>
          </div>
        ))}
        <div className="cpa-actions">
          <button type="button" className="cp-button" onClick={() => update({ ...DEFAULT_APPEARANCE })}>
            Zurücksetzen
          </button>
          <button type="button" className="cp-button cp-button-primary" onClick={close}>
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
