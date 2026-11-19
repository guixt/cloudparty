import { useStore } from 'zustand';
import { bridgeSettings, bridgeStatus, setBridgeSettings } from '../bridge/state';

const STATE_LABEL = { off: 'Aus', connecting: 'Verbinde …', connected: 'Verbunden', rejected: 'Abgelehnt' } as const;

/** Abschnitt „Externe Steuerung (MCP)“ im KI-Einstellungsdialog. */
export function BridgeSettings() {
  const s = useStore(bridgeSettings, (v) => v);
  const status = useStore(bridgeStatus, (v) => v);
  return (
    <div data-testid="mcp-settings">
      <div className="cp-label">Externe Steuerung (MCP, z. B. Claude Desktop)</div>
      <label className="ai-radio">
        <input type="checkbox" data-testid="mcp-enabled" checked={s.enabled} onChange={(e) => setBridgeSettings({ enabled: e.target.checked })} />
        <span>Claude Desktop darf in dieser Welt bauen (nur dieser Rechner, nur mit Token; es gelten Baurecht, Limits und Freigaben wie im Chat; Screenshots gehen an Claude Desktop)</span>
      </label>
      {s.enabled && (
        <>
          <label className="cp-label" htmlFor="mcp-token">
            Token (anzeigen mit „npm run mcp:token“)
          </label>
          <input id="mcp-token" className="cp-input" data-testid="mcp-token" type="password" autoComplete="off" spellCheck={false} value={s.token} onChange={(e) => setBridgeSettings({ token: e.target.value })} />
          <label className="cp-label" htmlFor="mcp-port">
            Port
          </label>
          <input id="mcp-port" className="cp-input" data-testid="mcp-port" inputMode="numeric" value={s.port} onChange={(e) => setBridgeSettings({ port: Number(e.target.value) })} />
          <div className="cp-muted" data-testid="mcp-status">
            Status: {STATE_LABEL[status.state]}
            {status.detail ? ` (${status.detail})` : ''}
          </div>
        </>
      )}
    </div>
  );
}
