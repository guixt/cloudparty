import { createStore } from 'zustand/vanilla';

export const FPS_STORAGE_KEY = 'cloudparty.fps';

function readFps(): boolean {
  try {
    return localStorage.getItem(FPS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface GraphicsUiState {
  open: boolean;
  showFps: boolean;
}
export const graphicsUi = createStore<GraphicsUiState>(() => ({ open: false, showFps: readFps() }));

export function setGraphicsOpen(open: boolean): void {
  graphicsUi.setState({ open });
}
export function setShowFps(showFps: boolean): void {
  graphicsUi.setState({ showFps });
  try {
    if (showFps) localStorage.setItem(FPS_STORAGE_KEY, '1');
    else localStorage.removeItem(FPS_STORAGE_KEY);
  } catch {
    /* Speicher gesperrt */
  }
}
