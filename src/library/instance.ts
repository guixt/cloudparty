import type { LibraryApi } from './api';

let library: LibraryApi | null = null;
export function getLibrary(): LibraryApi | null {
  return library;
}
export function setLibrary(api: LibraryApi | null): void {
  library = api;
}
