/** Inline-Editor für einen Parameter (Zahl, Text, Ja/Nein, Farbe, Auswahl). */
import { memo } from 'react';
import type { ParamDef, ParamValue } from '../../../shared/graph';

interface Props {
  def: ParamDef;
  value: ParamValue | undefined;
  onChange(value: ParamValue): void;
}

function ParamFieldImpl({ def, value, onChange }: Props) {
  const v = value ?? def.default;
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  switch (def.kind) {
    case 'boolean':
      return <input className="ge-param ge-param-check" type="checkbox" data-testid={`param-${def.id}`} checked={v === true || v === 'true'} onPointerDown={stop} onChange={(e) => onChange(e.target.checked)} />;
    case 'color':
      return <input className="ge-param ge-param-color" type="color" data-testid={`param-${def.id}`} value={typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'} onPointerDown={stop} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <select className="ge-param" data-testid={`param-${def.id}`} value={String(v)} onPointerDown={stop} onChange={(e) => onChange(e.target.value)}>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    case 'number':
      return (
        <input
          className="ge-param"
          type="number"
          data-testid={`param-${def.id}`}
          value={typeof v === 'number' ? v : Number(v) || 0}
          min={def.min}
          max={def.max}
          step={def.step ?? 'any'}
          onPointerDown={stop}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
        />
      );
    default:
      return <input className="ge-param" type="text" data-testid={`param-${def.id}`} value={String(v)} onPointerDown={stop} onChange={(e) => onChange(e.target.value)} />;
  }
}
export const ParamField = memo(ParamFieldImpl);
