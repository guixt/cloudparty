/** Speicher der eigenen Bausteine: IndexedDB `cloudparty-library` (Store `items`), Ersatz: localStorage. */
import type { LibraryItem } from '../../shared/library';

export interface ItemStorage {
  readAll(): Promise<LibraryItem[]>;
  put(item: LibraryItem): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'cloudparty-library';
const STORE = 'items';
const LS_KEY = 'cloudparty.library.items';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB-Fehler'));
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Fehler'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-Abbruch'));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB nicht verfügbar'));
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      return reject(error);
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB-Fehler'));
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
}

function idbStorage(db: IDBDatabase): ItemStorage {
  return {
    async readAll() {
      return request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<LibraryItem[]>);
    },
    async put(item) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      await done(tx);
    },
    async remove(id) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      await done(tx);
    },
  };
}

function localStorageStorage(): ItemStorage {
  const read = (): LibraryItem[] => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
      return Array.isArray(parsed) ? (parsed as LibraryItem[]) : [];
    } catch {
      return [];
    }
  };
  const write = (items: LibraryItem[]) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch {
      throw new Error('Der Browser-Speicher ist voll oder gesperrt – der Baustein konnte nicht gespeichert werden.');
    }
  };
  return {
    async readAll() {
      return read();
    },
    async put(item) {
      write([...read().filter((i) => i.id !== item.id), item]);
    },
    async remove(id) {
      write(read().filter((i) => i.id !== id));
    },
  };
}

/** Öffnet den Speicher (IndexedDB, sonst localStorage). */
export async function openStorage(): Promise<ItemStorage> {
  try {
    return idbStorage(await openDb());
  } catch {
    return localStorageStorage();
  }
}

/** Speicher nur im Arbeitsspeicher (Tests). */
export function memoryStorage(): ItemStorage {
  const map = new Map<string, LibraryItem>();
  return {
    async readAll() {
      return [...map.values()].map((i) => structuredClone(i));
    },
    async put(item) {
      map.set(item.id, structuredClone(item));
    },
    async remove(id) {
      map.delete(id);
    },
  };
}
