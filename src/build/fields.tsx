/** Kleine Formularbausteine für den Inspector. */
import { useState, type ReactNode } from 'react';
import { formatNumber } from './logic';

export function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="cpb-section" open={open}>
      <summary>{title}</summary>
      <div className="cpb-section-body">{children}</div>
    </details>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="cpb-field">
      <span className="cpb-field-label">{label}</span>
      {children}
    </label>
  );
}

interface NumProps {
  value: number;
  onChange(value: number): void;
  step?: number;
  min?: number;
  max?: number;
  label?: string;
  testId?: string;
}

/** Zahlenfeld mit Stepper-Knöpfen; Tippen übernimmt gültige Werte sofort. */
export function NumField({ value, onChange, step = 0.1, min, max, label, testId }: NumProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const bump = (dir: number) => onChange(clamp(Number((value + dir * step).toFixed(6))));
  return (
    <span className="cpb-num">
      {label && <span className="cpb-num-label">{label}</span>}
      <button type="button" className="cpb-step" tabIndex={-1} aria-label="weniger" onClick={() => bump(-1)}>
        −
      </button>
      <input
        className="cp-input cpb-num-input"
        type="text"
        inputMode="decimal"
        data-testid={testId}
        value={draft ?? formatNumber(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(1);
            setDraft(null);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(-1);
            setDraft(null);
          }
        }}
      />
      <button type="button" className="cpb-step" tabIndex={-1} aria-label="mehr" onClick={() => bump(1)}>
        +
      </button>
    </span>
  );
}

export function Vec3Field({ label, value, onChange, step, testId }: { label: string; value: [number, number, number]; onChange(v: [number, number, number]): void; step?: number; testId?: string }) {
  const axes = ['X', 'Y', 'Z'] as const;
  return (
    <div className="cpb-vec">
      <div className="cpb-field-label">{label}</div>
      <div className="cpb-vec-row">
        {axes.map((axis, i) => (
          <NumField
            key={axis}
            label={axis}
            step={step}
            testId={testId ? `${testId}-${axis.toLowerCase()}` : undefined}
            value={value[i]}
            onChange={(v) => {
              const next: [number, number, number] = [...value];
              next[i] = v;
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function TextField({ value, onChange, placeholder, testId, multiline }: { value: string; onChange(v: string): void; placeholder?: string; testId?: string; multiline?: boolean }) {
  return multiline ? (
    <textarea className="cp-textarea" rows={3} data-testid={testId} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input className="cp-input" type="text" data-testid={testId} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

/** Obergrenze für Datei-Uploads (Modelle, Bilder) im Browser. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function readFileAsDataUrl(file: File, maxBytes = MAX_UPLOAD_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`Datei ist zu groß (max. ${Math.round(maxBytes / 1024 / 1024)} MB).`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}
