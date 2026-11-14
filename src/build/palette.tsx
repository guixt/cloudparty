import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { PanelProps } from '../core/ui';
import { CATALOG, CATEGORIES, type CatalogItem } from './catalog';
import { placeItem } from './placement';
import { buildState } from './state';

function swatch(item: CatalogItem): string {
  return item.defaults.material?.color ?? '#9aa7bd';
}

export function Palette({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const search = useStore(buildState, (s) => s.search);
  const armed = useStore(buildState, (s) => s.armed);
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CATEGORIES.map((category) => ({
      category,
      items: CATALOG.filter((i) => i.category === category && (!q || i.label.toLowerCase().includes(q) || i.ref.toLowerCase().includes(q))),
    })).filter((g) => g.items.length > 0);
  }, [search]);
  if (mode !== 'build') return null;

  const choose = (item: CatalogItem, shift: boolean) => {
    placeItem(ctx, item);
    buildState.setState({ armed: shift ? item.key : null });
  };

  return (
    <div className="cp-panel cpb-panel" data-testid="palette">
      <h3 className="cp-heading">Bausteine</h3>
      <input
        className="cp-input"
        placeholder="Suchen …"
        value={search}
        data-testid="palette-search"
        onChange={(e) => buildState.setState({ search: e.target.value })}
      />
      <p className="cp-muted cpb-hint">
        {armed ? 'Klicke auf den Boden, um weitere zu setzen (Esc beendet).' : 'Klick setzt vor dich. Shift+Klick: danach per Klick auf den Boden mehrfach setzen.'}
      </p>
      <div className="cpb-scroll cp-panel-scroll">
        {groups.map((g) => (
          <section key={g.category}>
            <h4 className="cpb-group">{g.category}</h4>
            <div className="cpb-grid">
              {g.items.map((item) => (
                <button
                  key={item.key}
                  className={`cpb-item ${armed === item.key ? 'cpb-item-armed' : ''}`}
                  data-testid={`palette-${item.key}`}
                  title={item.label}
                  onClick={(e) => choose(item, e.shiftKey)}
                >
                  <span className="cpb-swatch" style={{ background: swatch(item) }} />
                  <span className="cpb-item-label">{item.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 && <p className="cp-muted">Nichts gefunden.</p>}
      </div>
    </div>
  );
}
