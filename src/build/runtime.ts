/** Gemeinsame Laufzeit-Objekte des Build-Moduls (für die React-Komponenten). */
import type { BuildCamera } from './camera';
import type { History } from './history';

export const runtime: { history: History | null; camera: BuildCamera | null } = { history: null, camera: null };
