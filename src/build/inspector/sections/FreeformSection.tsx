import { useState } from 'react';
import { FREEFORM_LIMITS, FREEFORM_REF, sanitizeFreeformState, type CutOp, type FreeformState, type Vec3 } from '../../../../shared/freeform';
import type { EntitySpec } from '../../../../shared/types';
import { Field, Section } from '../../fields';
import { formatNumber } from '../../logic';

const KIND_LABEL = { lathe: 'Drehkörper', sweep: 'Sweep', patch: 'Fläche' } as const;

/** Beispiel-State je Art (für „Als Vorlage zurücksetzen“). */
const TEMPLATES: Record<FreeformState['kind'], FreeformState> = {
  lathe: {
    kind: 'lathe',
    profile: [
      [0.4, 0],
      [0.5, 0.4],
      [0.3, 0.9],
      [0.35, 1.2],
    ],
    sweepDeg: 360,
    segments: 32,
  },
  sweep: { kind: 'sweep', path: [{ p: [0, 0], bulge: 1 }, { p: [4, 0] }], height: 2.4, thickness: 0.2 },
  patch: {
    kind: 'patch',
    grid: [
      [[0, 0, 0], [1, 0.4, 0], [2, 0, 0]],
      [[0, 0.2, 1], [1, 0.8, 1], [2, 0.2, 1]],
      [[0, 0, 2], [1, 0.4, 2], [2, 0, 2]],
    ],
    degree: 2,
    thickness: 0.1,
  },
};

/** Textfeld mit Übernahme beim Verlassen/Enter; `onCommit` liefert eine Fehlermeldung oder null. */
function Cell({ value, onCommit, testId }: { value: string; onCommit(text: string): string | null; testId: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const err = onCommit(draft);
    setError(err);
    setDraft(null);
  };
  return (
    <span className="cpb-ff-cell" style={{ flex: "1 1 0", minWidth: 0 }}>
      <input
        className="cp-input cpb-num-input"
        type="text"
        inputMode="decimal"
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
      />
      {error && (
        <span className="cpb-error" role="alert" data-testid={`${testId}-error`} style={{ color: '#d33', display: 'block' }}>
          {error}
        </span>
      )}
    </span>
  );
}

const ROW = { display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" } as const;
const fmt = (n: number | undefined) => (n === undefined ? '' : formatNumber(n));

function parseNum(text: string): number {
  const n = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(n)) throw new Error('Keine gültige Zahl.');
  return n;
}

type Draft = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function FreeformSection({ entity, patch }: { entity: EntitySpec; patch(p: Partial<EntitySpec>): void }) {
  const [listError, setListError] = useState<string | null>(null);
  if (entity.ref !== FREEFORM_REF) return null;
  const raw = entity.state as FreeformState | undefined;
  const kind = raw?.kind;
  if (kind !== 'lathe' && kind !== 'sweep' && kind !== 'patch') return null;
  const s = raw as unknown as Draft;

  /** Wendet `fn` auf eine Kopie an, prüft und schreibt den State; liefert eine Fehlermeldung oder null. */
  const edit = (fn: (d: Draft) => void): string | null => {
    try {
      const d = structuredClone(raw) as unknown as Draft;
      fn(d);
      patch({ state: sanitizeFreeformState(d) as unknown as Record<string, unknown> });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Ungültige Eingabe.';
    }
  };
  const run = (fn: (d: Draft) => void) => setListError(edit(fn));

  const num = (key: string, testId: string, opts: { optional?: boolean; int?: boolean } = {}) => (
    <Cell
      testId={testId}
      value={fmt(s[key])}
      onCommit={(t) =>
        edit((d) => {
          if (opts.optional && t.trim() === '') delete d[key];
          else d[key] = opts.int ? Math.round(parseNum(t)) : parseNum(t);
        })
      }
    />
  );
  /** Zelle in verschachtelter Struktur: `set` wirkt auf die Kopie. */
  const cell = (testId: string, current: number | undefined, set: (d: Draft, v: number | undefined) => void, optional = false) => (
    <Cell testId={testId} value={fmt(current)} onCommit={(t) => edit((d) => set(d, optional && t.trim() === '' ? undefined : parseNum(t)))} />
  );
  const btn = (testId: string, text: string, onClick: () => void, disabled = false, title?: string) => (
    <button type="button" className="cp-button cpb-small" data-testid={testId} disabled={disabled} title={title ?? text} onClick={onClick}>
      {text}
    </button>
  );
  const move = <T,>(arr: T[], i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  };

  const cuts: CutOp[] = (s.cuts as CutOp[] | undefined) ?? [];

  return (
    <Section title="Freiform" open>
      <div className="cpb-ref" data-testid="freeform-kind">
        Art: <strong>{KIND_LABEL[kind]}</strong>
      </div>

      {kind === 'sweep' && (
        <>
          <div className="cpb-ff-table" data-testid="freeform-path">
            <strong>Pfadpunkte</strong>
            {(s.path as { p: [number, number]; bulge?: number }[]).map((pt, i, arr) => (
              <div key={i} className="cpb-ff-row" style={ROW}>
                <span>{i + 1}</span>
                {cell(`freeform-path-${i}-x`, pt.p[0], (d, v) => (d.path[i].p[0] = v))}
                {cell(`freeform-path-${i}-z`, pt.p[1], (d, v) => (d.path[i].p[1] = v))}
                {cell(
                  `freeform-path-${i}-bulge`,
                  pt.bulge,
                  (d, v) => {
                    if (v === undefined) delete d.path[i].bulge;
                    else d.path[i].bulge = v;
                  },
                  true,
                )}
                {btn(`freeform-path-${i}-up`, '↑', () => run((d) => move(d.path, i, -1)), i === 0, 'Nach oben')}
                {btn(`freeform-path-${i}-down`, '↓', () => run((d) => move(d.path, i, 1)), i === arr.length - 1, 'Nach unten')}
                {btn(`freeform-path-${i}-del`, '✕', () => run((d) => d.path.splice(i, 1)), arr.length <= 2, 'Punkt löschen')}
              </div>
            ))}
            <div className="cp-muted">Spalten: x, z, Bogen (Pfeilhöhe zum nächsten Punkt)</div>
            {btn(
              'freeform-path-add',
              '+ Punkt',
              () =>
                run((d) => {
                  const last = d.path[d.path.length - 1].p;
                  d.path.push({ p: [last[0] + 1, last[1]] });
                }),
              s.path.length >= FREEFORM_LIMITS.maxPoints,
            )}
          </div>
          <label className="cpb-check">
            <input
              type="checkbox"
              data-testid="freeform-closed"
              checked={s.closedPath === true}
              onChange={(e) =>
                run((d) => {
                  if (e.target.checked) d.closedPath = true;
                  else delete d.closedPath;
                })
              }
            />{' '}
            Pfad geschlossen
          </label>
          <Field label="Höhe">{num('height', 'freeform-height')}</Field>
          <Field label="Höhe Ende">{num('heightEnd', 'freeform-height-end', { optional: true })}</Field>
          <Field label="Dicke">{num('thickness', 'freeform-thickness')}</Field>
          <Field label="Unterkante">{num('y0', 'freeform-y0', { optional: true })}</Field>
          <Field label="Segmente je Bogen">{num('segments', 'freeform-segments', { optional: true, int: true })}</Field>
          <Field label="Welle Amplitude">
            {cell(
              'freeform-wave-amplitude',
              s.wave?.amplitude,
              (d, v) => {
                if (v === undefined) delete d.wave;
                else d.wave = { amplitude: v, length: d.wave?.length ?? 1 };
              },
              true,
            )}
          </Field>
          <Field label="Welle Länge">
            {cell(
              'freeform-wave-length',
              s.wave?.length,
              (d, v) => {
                if (v === undefined) delete d.wave;
                else d.wave = { amplitude: d.wave?.amplitude ?? 0.1, length: v };
              },
              true,
            )}
          </Field>
        </>
      )}

      {kind === 'lathe' && (
        <>
          <div className="cpb-ff-table" data-testid="freeform-profile">
            <strong>Profilpunkte</strong>
            {(s.profile as [number, number][]).map((pt, i, arr) => (
              <div key={i} className="cpb-ff-row" style={ROW}>
                <span>{i + 1}</span>
                {cell(`freeform-profile-${i}-r`, pt[0], (d, v) => (d.profile[i][0] = v))}
                {cell(`freeform-profile-${i}-y`, pt[1], (d, v) => (d.profile[i][1] = v))}
                {btn(`freeform-profile-${i}-del`, '✕', () => run((d) => d.profile.splice(i, 1)), arr.length <= 2, 'Punkt löschen')}
              </div>
            ))}
            <div className="cp-muted">Spalten: Radius, y</div>
            {btn(
              'freeform-profile-add',
              '+ Punkt',
              () =>
                run((d) => {
                  const last = d.profile[d.profile.length - 1];
                  d.profile.push([last[0], last[1] + 0.5]);
                }),
              s.profile.length >= FREEFORM_LIMITS.maxPoints,
            )}
          </div>
          <Field label="Winkel (°)">{num('sweepDeg', 'freeform-sweep-deg', { optional: true })}</Field>
          <Field label="Startwinkel (°)">{num('startDeg', 'freeform-start-deg', { optional: true })}</Field>
          <Field label="Segmente">{num('segments', 'freeform-segments', { optional: true, int: true })}</Field>
          <Field label="Ellipse (z/x)">{num('ellipse', 'freeform-ellipse', { optional: true })}</Field>
        </>
      )}

      {kind === 'patch' && (
        <>
          <div className="cpb-ff-table" data-testid="freeform-grid">
            <strong>Gitter (Zeile × Spalte)</strong>
            {(s.grid as Vec3[][]).map((row, r) => (
              <div key={r} className="cpb-ff-gridrow">
                {row.map((pt, c) => (
                  <div key={c} className="cpb-ff-row" style={ROW}>
                    <span>
                      {r + 1}/{c + 1}
                    </span>
                    {cell(`freeform-grid-${r}-${c}-x`, pt[0], (d, v) => (d.grid[r][c][0] = v))}
                    {cell(`freeform-grid-${r}-${c}-y`, pt[1], (d, v) => (d.grid[r][c][1] = v))}
                    {cell(`freeform-grid-${r}-${c}-z`, pt[2], (d, v) => (d.grid[r][c][2] = v))}
                  </div>
                ))}
              </div>
            ))}
            <div className="cp-muted">Spalten: x, y, z</div>
            <div className="cpb-actions">
              {btn(
                'freeform-grid-add-row',
                '+ Zeile',
                () =>
                  run((d) => {
                    const last = d.grid[d.grid.length - 1] as Vec3[];
                    d.grid.push(last.map((p) => [p[0], p[1], p[2] + 1]));
                  }),
                s.grid.length >= FREEFORM_LIMITS.maxGrid,
              )}
              {btn('freeform-grid-del-row', '− Zeile', () => run((d) => d.grid.pop()), s.grid.length <= 2)}
              {btn(
                'freeform-grid-add-col',
                '+ Spalte',
                () =>
                  run((d) => {
                    for (const row of d.grid as Vec3[][]) {
                      const l = row[row.length - 1];
                      row.push([l[0] + 1, l[1], l[2]]);
                    }
                  }),
                s.grid[0].length >= FREEFORM_LIMITS.maxGrid,
              )}
              {btn('freeform-grid-del-col', '− Spalte', () => run((d) => (d.grid as Vec3[][]).forEach((row) => row.pop())), s.grid[0].length <= 2)}
            </div>
          </div>
          <Field label="Grad (1–3)">
            <Cell
              testId="freeform-degree"
              value={fmt(s.degree)}
              onCommit={(t) =>
                edit((d) => {
                  if (t.trim() === '') delete d.degree;
                  else d.degree = Math.round(parseNum(t));
                })
              }
            />
          </Field>
          <Field label="Dicke">{num('thickness', 'freeform-thickness', { optional: true })}</Field>
          <Field label="Unterteilung u">
            {cell(
              'freeform-subdiv-u',
              s.subdivisions?.[0],
              (d, v) => {
                if (v === undefined) delete d.subdivisions;
                else d.subdivisions = [Math.round(v), d.subdivisions?.[1] ?? 24];
              },
              true,
            )}
          </Field>
          <Field label="Unterteilung v">
            {cell(
              'freeform-subdiv-v',
              s.subdivisions?.[1],
              (d, v) => {
                if (v === undefined) delete d.subdivisions;
                else d.subdivisions = [d.subdivisions?.[0] ?? 24, Math.round(v)];
              },
              true,
            )}
          </Field>
        </>
      )}

      <div className="cpb-ff-table" data-testid="freeform-cuts">
        <strong>
          Schnitte ({cuts.length}/{FREEFORM_LIMITS.maxCuts})
        </strong>
        {cuts.map((cut, i) => (
          <div key={i} className="cpb-ff-cut" style={ROW}>
            <select className="cp-input" data-testid={`freeform-cut-${i}-shape`} value={cut.shape} onChange={(e) => run((d) => (d.cuts[i].shape = e.target.value))}>
              <option value="box">Quader</option>
              <option value="cylinder">Zylinder</option>
              <option value="sphere">Kugel</option>
            </select>
            {(['x', 'y', 'z'] as const).map((ax, k) => (
              <span key={`p${ax}`}>{cell(`freeform-cut-${i}-pos-${ax}`, cut.pos[k], (d, v) => (d.cuts[i].pos[k] = v))}</span>
            ))}
            {(['x', 'y', 'z'] as const).map((ax, k) => (
              <span key={`s${ax}`}>{cell(`freeform-cut-${i}-size-${ax}`, cut.size[k], (d, v) => (d.cuts[i].size[k] = v))}</span>
            ))}
            {cell(
              `freeform-cut-${i}-rot`,
              cut.rotY,
              (d, v) => {
                if (v === undefined) delete d.cuts[i].rotY;
                else d.cuts[i].rotY = v;
              },
              true,
            )}
            {btn(
              `freeform-cut-${i}-del`,
              '✕',
              () =>
                run((d) => {
                  d.cuts.splice(i, 1);
                  if (d.cuts.length === 0) delete d.cuts;
                }),
              false,
              'Schnitt löschen',
            )}
          </div>
        ))}
        {cuts.length > 0 && <div className="cp-muted">Form, Position x/y/z, Größe x/y/z, Drehung Y (°)</div>}
        {btn(
          'freeform-cut-add',
          '+ Schnitt',
          () => run((d) => (d.cuts = [...(d.cuts ?? []), { shape: 'box', pos: [0, 1, 0], size: [0.8, 1.2, 0.8] }])),
          cuts.length >= FREEFORM_LIMITS.maxCuts,
        )}
      </div>

      {listError && (
        <div className="cpb-error" role="alert" data-testid="freeform-error" style={{ color: '#d33' }}>
          {listError}
        </div>
      )}
      <button
        type="button"
        className="cp-button cpb-small"
        data-testid="freeform-reset"
        onClick={() =>
          run((d) => {
            for (const k of Object.keys(d)) delete d[k];
            Object.assign(d, structuredClone(TEMPLATES[kind]));
          })
        }
      >
        Als Vorlage zurücksetzen
      </button>
    </Section>
  );
}
