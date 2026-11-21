/** Einstellungen (Browser) und Verbindungsstatus der MCP-Brücke. */
import { createStore } from 'zustand/vanilla';
import { MCP_DEFAULT_PORT, MCP_STORAGE_KEYS } from '../../../shared/mcpBridge';

export interface BridgeSettings {
  enabled: boolean;
  token: string;
  port: number;
}

export type BridgeState = 'off' | 'connecting' | 'connected' | 'rejected';
export interface BridgeStatus {
  state: BridgeState;
  detail?: string;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function sanitizePort(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : MCP_DEFAULT_PORT;
}

export function loadBridgeSettings(): BridgeSettings {
  const s = storage();
  try {
    return {
      enabled: s?.getItem(MCP_STORAGE_KEYS.enabled) === '1',
      token: (s?.getItem(MCP_STORAGE_KEYS.token) ?? '').trim(),
      port: sanitizePort(s?.getItem(MCP_STORAGE_KEYS.port)),
    };
  } catch {
    return { enabled: false, token: '', port: MCP_DEFAULT_PORT };
  }
}

export const bridgeSettings = createStore<BridgeSettings>(() => loadBridgeSettings());
export const bridgeStatus = createStore<BridgeStatus>(() => ({ state: 'off' }));

export function setBridgeSettings(patch: Partial<BridgeSettings>): void {
  const cur = bridgeSettings.getState();
  const next: BridgeSettings = {
    enabled: patch.enabled ?? cur.enabled,
    token: (patch.token ?? cur.token).trim().replace(/\s+/g, ''),
    port: patch.port === undefined ? cur.port : sanitizePort(patch.port),
  };
  bridgeSettings.setState(next);
  try {
    const s = storage();
    s?.setItem(MCP_STORAGE_KEYS.enabled, next.enabled ? '1' : '0');
    if (next.token) s?.setItem(MCP_STORAGE_KEYS.token, next.token);
    else s?.removeItem(MCP_STORAGE_KEYS.token);
    s?.setItem(MCP_STORAGE_KEYS.port, String(next.port));
  } catch {
    /* Speicher gesperrt */
  }
}
