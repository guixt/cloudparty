/** IndexedDB-gestützte Weltenspeicherung (Datenbank „cloudparty“, Store „worlds“). */
import type { StoredWorldInfo, WorldPersistence } from '../../core/context';
import type { WorldSpec } from '../../../shared/types';

export const DB_NAME = 'cloudparty';
export const STORE_NAME = 'worlds';

interface Record_ {
  id: string;
  name: string;
  updatedAt: number;
  world: WorldSpec;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB-Fehler'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Fehler'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-Transaktion abgebrochen'));
  });
}

/** Öffnet die Datenbank; wirft, wenn IndexedDB nicht verfügbar ist. */
export function openDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB konnte nicht geöffnet werden'));
    req.onblocked = () => reject(new Error('IndexedDB ist blockiert'));
  });
}

export function createIndexedDbPersistence(db: IDBDatabase): WorldPersistence {
  const store = (mode: IDBTransactionMode) => {
    const tx = db.transaction(STORE_NAME, mode);
    return { tx, store: tx.objectStore(STORE_NAME) };
  };
  return {
    async list() {
      const { store: s } = store('readonly');
      const records = (await request(s.getAll())) as Record_[];
      return records
        .map<StoredWorldInfo>((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async load(id) {
      const { store: s } = store('readonly');
      const record = (await request(s.get(id))) as Record_ | undefined;
      return record?.world;
    },
    async save(id, world) {
      const { tx, store: s } = store('readwrite');
      // JSON-Kopie: entkoppelt vom Store und garantiert Klonbarkeit.
      const record: Record_ = { id, name: world.metadata.name, updatedAt: Date.now(), world: JSON.parse(JSON.stringify(world)) };
      s.put(record);
      await transactionDone(tx);
    },
    async remove(id) {
      const { tx, store: s } = store('readwrite');
      s.delete(id);
      await transactionDone(tx);
    },
  };
}
