/**
 * Server-Verträge. VERTRAG: nur der Koordinator ändert diese Datei.
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { IslandDetail, IslandSummary, LoginResponse } from '../shared/protocol';
import type { WorldSpec } from '../shared/types';

export interface User {
  id: string;
  name: string;
}

/**
 * Speicher für Konten und Inseln. Paket 11 liefert die SQLite-Umsetzung
 * (server/api/repository.ts → createRepository), Paket 9 nutzt nur dieses Interface.
 */
export interface IslandRepository {
  login(name: string): LoginResponse;
  resolveToken(token: string | undefined): User | undefined;
  listIslands(): IslandSummary[];
  getIsland(id: string): IslandDetail | undefined;
  /** Legt eine Insel an; id aus world.metadata.id, sonst neu vergeben. */
  createIsland(world: WorldSpec, owner: User): IslandDetail;
  /**
   * Liefert die Insel oder legt sie als offene Sandbox an (Besitzer "system",
   * builders ["*"]) – so funktioniert jeder Insel-Link sofort.
   */
  ensureIsland(id: string): IslandDetail;
  saveWorld(id: string, world: WorldSpec): void;
  setBuilders(id: string, builders: string[]): void;
  deleteIsland(id: string): void;
  /** userId undefined = Gast ohne Konto. */
  canBuild(id: string, userId: string | undefined): boolean;
  close?(): void;
}

/** true zurückgeben, wenn die Anfrage behandelt wurde. */
export type HttpHandler = (req: IncomingMessage, res: ServerResponse, url: URL) => boolean | Promise<boolean>;

export interface ServerContext {
  http: Server;
  repo: IslandRepository;
  addHttpHandler(handler: HttpHandler): void;
  /** Anwesenheit pro Insel; Paket 9 setzt die Funktion, Paket 11 liest sie für IslandSummary.online. */
  presence: { count(islandId: string): number };
  /** Datenverzeichnis für dauerhafte Dateien (Standard ./data, per DATA_DIR änderbar). */
  dataDir: string;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function readJson<T>(req: IncomingMessage, maxBytes = 5_000_000): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new Error('Anfrage zu groß');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
}
