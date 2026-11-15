/**
 * STUB des Fundaments – Paket 17 (Bibliothek) ersetzt diese Datei
 * (darf zu index.tsx umbenannt werden; `src/modules.ts` importiert `./library`).
 * Exportiert: default GameModule (id `library`) und `getLibrary(): LibraryApi | null`.
 */
import type { GameModule } from '../core/context';
import type { LibraryApi } from './api';

let library: LibraryApi | null = null;
export function getLibrary(): LibraryApi | null {
  return library;
}

const mod: GameModule = {
  id: 'library',
  init() {
    library = null;
  },
};
export default mod;
