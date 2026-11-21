/**
 * Nachrichten zwischen Client und Server (WebSocket, JSON) sowie REST-Formate.
 * VERTRAG: Diese Datei wird nur vom Koordinator geändert.
 */
import type { AvatarAppearance, AvatarNetState } from './avatar';
import type { EntitySpec, EnvironmentSpec, WorldSpec } from './types';

export const DEFAULT_SERVER_PORT = 8787;
export const WS_PATH = '/ws';
export const MAX_AVATARS_PER_ISLAND = 25;
/** Maximale Sendefrequenz für Avatar-Updates (Hz). */
export const AVATAR_SEND_RATE = 12;
export const MAX_CHAT_LENGTH = 500;

export interface RemoteAvatarInfo {
  id: string;
  name: string;
  appearance: AvatarAppearance;
  state: AvatarNetState;
}

// ---- Client → Server ----
export type ClientMessage =
  | { type: 'join'; island: string; name: string; token?: string; appearance: AvatarAppearance }
  | { type: 'avatar'; state: AvatarNetState }
  | { type: 'chat'; text: string }
  | { type: 'entity.upsert'; entity: EntitySpec }
  | { type: 'entity.remove'; id: string }
  | { type: 'environment'; environment: EnvironmentSpec }
  /** Freies Signal an alle anderen im Raum (z. B. Skript-Effekte, Physik-Impulse). */
  | { type: 'signal'; channel: string; data: unknown };

// ---- Server → Client ----
export type ServerMessage =
  | { type: 'welcome'; selfId: string; canBuild: boolean; world: WorldSpec; avatars: RemoteAvatarInfo[] }
  | { type: 'avatar.joined'; avatar: RemoteAvatarInfo }
  | { type: 'avatar.left'; id: string }
  | { type: 'avatar.update'; id: string; state: AvatarNetState }
  | { type: 'chat'; from: string; name: string; text: string; ts: number }
  | { type: 'entity.upsert'; entity: EntitySpec; by: string }
  | { type: 'entity.remove'; id: string; by: string }
  | { type: 'environment'; environment: EnvironmentSpec; by: string }
  | { type: 'signal'; channel: string; data: unknown; from: string }
  | { type: 'error'; code: 'full' | 'forbidden' | 'not-found' | 'bad-request' | 'rate-limit'; message: string };

// ---- REST (Paket 11) ----
/** POST /api/login  { name } → LoginResponse. Token im Header "Authorization: Bearer <token>". */
export interface LoginResponse {
  token: string;
  userId: string;
  name: string;
}
export interface IslandSummary {
  id: string;
  name: string;
  owner: string;
  ownerName: string;
  updatedAt: number;
  /** Anzahl aktuell anwesender Avatare (0, wenn unbekannt). */
  online: number;
}
/**
 * GET  /api/islands            → IslandSummary[]
 * GET  /api/islands/:id        → IslandDetail
 * POST /api/islands  { world } → IslandDetail   (Auth nötig; Aufrufer wird Besitzer)
 * PUT  /api/islands/:id { world?, builders? } → IslandDetail (nur Besitzer; world auch Mitbauer)
 * DELETE /api/islands/:id      → { ok: true }   (nur Besitzer)
 */
export interface IslandDetail extends IslandSummary {
  world: WorldSpec;
  /** userIds mit Baurecht zusätzlich zum Besitzer; "*" = alle. */
  builders: string[];
}

export function encodeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}
export function decodeMessage<T extends ClientMessage | ServerMessage>(raw: string): T | null {
  try {
    const value = JSON.parse(raw) as T;
    return value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string' ? value : null;
  } catch {
    return null;
  }
}
