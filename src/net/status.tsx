import { useStore } from 'zustand';
import { avatarCountLabel } from './chatLogic';
import { netStore } from './netStore';
import './net.css';

/** Kompakte Anzeige oben rechts: Offline / Verbinde … / Online · n Avatare. */
export function StatusBadge() {
  const s = useStore(netStore, (st) => st.status);
  let label = 'Offline';
  let cls = 'cpn-status-off';
  if (s.online) {
    label = `Online · ${avatarCountLabel(s.avatars)}${s.canBuild ? '' : ' · nur ansehen'}`;
    cls = 'cpn-status-on';
  } else if (s.connecting) {
    label = 'Verbinde …';
    cls = 'cpn-status-connecting';
  }
  return (
    <div className={`cp-panel cpn-status ${cls}`} data-testid="net-status">
      <span className="cpn-dot" />
      {label}
    </div>
  );
}
