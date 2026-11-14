/**
 * Einzige Stelle, an der die Shell das Netzwerkmodul (src/net) anspricht.
 *
 * Erwartet wird (Paket 10): `getNet()` mit
 *   connect(islandId: string, opts: { token?: string }): void | Promise<void>
 *   disconnect(): void
 *   getStatus(): { online: boolean; island: string | null; ... }
 * sowie `setAutoConnect(enabled: boolean)`.
 *
 * TODO (Koordinator nach dem Merge): die Fallback-Implementierung unten durch
 *   import { getNet, setAutoConnect } from '../../net';
 * ersetzen:
 *   export function setNetAutoConnect(on) { setAutoConnect(on); }
 *   export function connectToIsland(id, token) { void getNet().connect(id, { token }); return true; }
 *   export function disconnectNet() { getNet().disconnect(); }
 *   export function isNetConnected() { return getNet().getStatus().online; }
 *
 * FALLBACK (aktuell): kein Netz. connectToIsland liefert false; die Shell lädt
 * die Insel dann selbst per REST (GET /api/islands/:id) bzw. lokal.
 */

/** Verhindert, dass das Netzmodul von sich aus verbindet; die Shell entscheidet über die Insel. */
export function setNetAutoConnect(_enabled: boolean): void {
  /* Fallback: nichts zu tun */
}

/** Verbindet mit der Insel. true = das Netzmodul übernimmt das Laden der Welt. */
export function connectToIsland(_islandId: string, _token: string | null): boolean {
  return false;
}

export function disconnectNet(): void {
  /* Fallback: nichts zu tun */
}

export function isNetConnected(): boolean {
  return false;
}
