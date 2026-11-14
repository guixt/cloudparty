/** Reine Chat- und Hilfslogik. */
export interface ChatLine {
  from: string;
  name: string;
  text: string;
  ts: number;
  kind: 'avatar' | 'object' | 'system';
}
export const MAX_HISTORY = 200;

export function appendMessage(list: readonly ChatLine[], msg: ChatLine, max = MAX_HISTORY): ChatLine[] {
  const next = [...list, msg];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Erster kommagetrennter Teil von location.hash ohne '#', oder null. */
export function parseHashIsland(hash: string): string | null {
  const first = hash.replace(/^#/, '').split(',')[0]?.trim() ?? '';
  if (!first) return null;
  try {
    return decodeURIComponent(first);
  } catch {
    return first;
  }
}

export function avatarCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'Avatar' : 'Avatare'}`;
}
