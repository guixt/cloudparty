import { useMemo } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { PanelProps } from '../core/ui';
import { CATALOG, CATEGORIES, type CatalogItem } from './catalog';
import { placeItem } from './placement';
import { buildState } from './state';

function swatch(item: CatalogItem): string {
  return item.defaults.material?.color ?? '#9aa7bd';
}

const COLLAPSED_KEY = 'cloudparty.build.paletteCollapsed';
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
/** Ist die Bausteinliste eingeklappt? Wird pro Browser gemerkt. */
export const paletteUi = createStore<{ collapsed: boolean }>(() => ({ collapsed: loadCollapsed() }));
export function setPaletteCollapsed(collapsed: boolean): void {
  paletteUi.setState({ collapsed });
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignorieren */
  }
}

export function Palette({ ctx }: PanelProps) {
  const mode = useStore(ctx.store, (s) => s.mode);
  const search = useStore(buildState, (s) => s.search);
  const armed = useStore(buildState, (s) => s.armed);
  const collapsed = useStore(paletteUi, (s) => s.collapsed);
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
    // Normaler Klick: Liste einklappen, damit die Sicht frei bleibt (Shift+Klick lässt sie offen).
    if (!shift) setPaletteCollapsed(true);
  };

  return (
    <div className={`cp-panel cpb-panel ${collapsed ? 'cpb-panel-collapsed' : ''}`} data-testid="palette">
      <button type="button" className="cpb-palette-head" data-testid="palette-toggle" aria-expanded={!collapsed} title={collapsed ? 'Bausteine aufklappen' : 'Bausteine einklappen'} onClick={() => setPaletteCollapsed(!collapsed)}>
        <span className="cp-heading">Bausteine</span>
        <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <>
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
            <div className="cpb-palette-grid">
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
        </>
      )}
    </div>
  );
}
