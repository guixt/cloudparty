/** Knoten-Palette: Suche, Kategorien, Tastaturbedienung. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeDef } from '../../../shared/graph';
import { CATEGORY_COLOR, filterPalette, type PaletteGroup } from './meta';

interface Props {
  x: number;
  y: number;
  groups: PaletteGroup[];
  /** Nur diese Typen anbieten (beim Ziehen eines Kabels ins Leere). */
  allowed?: Set<string> | null;
  title?: string;
  onPick(def: NodeDef): void;
  onClose(): void;
}

export function Palette({ x, y, groups, allowed, title, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => filterPalette(groups, query, allowed), [groups, query, allowed]);
  const flat = useMemo(() => filtered.flatMap((g) => g.nodes), [filtered]);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 24;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  }, [index, flat]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[index]) onPick(flat[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  let n = -1;
  return (
    <div className="ge-palette-backdrop" onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div className="ge-palette" data-testid="graph-palette" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown} onContextMenu={(e) => e.stopPropagation()}>
        <div className="ge-palette-title">{title ?? 'Knoten hinzufügen'}</div>
        <input autoFocus className="cp-input" data-testid="palette-search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="ge-palette-list" ref={listRef} style={{ position: 'relative' }}>
          {filtered.map((g) => (
            <div key={g.category}>
              <div className="ge-palette-cat"><span style={{ background: CATEGORY_COLOR[g.category] }} />{g.category}</div>
              {g.nodes.map((d) => {
                n++;
                const active = n === index;
                const my = n;
                return (
                  <button key={d.type} type="button" className={`ge-palette-item${active ? ' ge-active' : ''}`} data-active={active} data-testid="palette-item" data-type={d.type} title={d.description} onMouseMove={() => setIndex(my)} onClick={() => onPick(d)}>
                    <span className="ge-palette-name">{d.title}</span>
                    <span className="ge-palette-desc">{d.description}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && <div className="cp-muted ge-palette-empty">Nichts gefunden.</div>}
        </div>
      </div>
    </div>
  );
}
