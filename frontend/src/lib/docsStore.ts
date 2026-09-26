/**
 * Document chunks can be megabytes, far past localStorage's quota, so they go to IndexedDB.
 * Metadata (name, size, enabled) stays in localStorage for instant rendering.
 */

const DB_NAME = 'aiolio';
const STORE = 'document-chunks';

interface StoredChunks {
  docId: string;
  chunks: string[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'docId' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export const putChunks = (docId: string, chunks: string[]) =>
  run<void>('readwrite', (store) => store.put({ docId, chunks } satisfies StoredChunks));

export const deleteChunks = (docId: string) => run<void>('readwrite', (store) => store.delete(docId));

export async function getChunks(docId: string): Promise<string[]> {
  const record = await run<StoredChunks | undefined>('readonly', (store) => store.get(docId));
  return record?.chunks ?? [];
}

export const clearChunks = () => run<void>('readwrite', (store) => store.clear());
