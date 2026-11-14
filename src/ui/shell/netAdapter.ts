/**
 * Einzige Stelle, an der die Shell das Netzwerkmodul (src/net) anspricht.
 * Das Netzmodul lädt nach dem Beitritt die Welt des Servers in den Store
 * (`welcome`) und setzt das Baurecht; die Shell wählt nur die Insel.
 */
import { getNet, setAutoConnect } from '../../net';

/** Verhindert, dass das Netzmodul von sich aus verbindet; die Shell entscheidet über die Insel. */
export function setNetAutoConnect(enabled: boolean): void {
  setAutoConnect(enabled);
}

/** Verbindet mit der Insel. true = das Netzmodul übernimmt das Laden der Welt. */
export function connectToIsland(islandId: string, token: string | null): boolean {
  const net = getNet();
  if (!net) return false;
  net.connect(islandId, token ? { token } : undefined);
  return true;
}

export function disconnectNet(): void {
  getNet()?.disconnect();
}

export function isNetConnected(): boolean {
  return getNet()?.getStatus().online ?? false;
}
