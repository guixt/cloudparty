/** Kleiner Store für die React-Panels (Status, Chatverlauf). */
import { createStore } from 'zustand/vanilla';
import { appendMessage, type ChatLine } from './chatLogic';

export interface NetStatus {
  online: boolean;
  connecting: boolean;
  island: string | null;
  avatars: number;
  canBuild: boolean;
}

export interface NetUiState {
  status: NetStatus;
  messages: ChatLine[];
  setStatus(status: NetStatus): void;
  addMessage(msg: ChatLine): void;
  reset(): void;
}

const initialStatus: NetStatus = { online: false, connecting: false, island: null, avatars: 0, canBuild: true };

export const netStore = createStore<NetUiState>((set) => ({
  status: initialStatus,
  messages: [],
  setStatus: (status) => set({ status }),
  addMessage: (msg) => set((s) => ({ messages: appendMessage(s.messages, msg) })),
  reset: () => set({ status: initialStatus, messages: [] }),
}));
