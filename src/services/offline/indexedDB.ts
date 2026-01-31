const DB_NAME = 'dermatoscopy-app';
const DB_VERSION = 1;

const STORES = {
  PROGRESS: 'progress',
  CACHE: 'cache',
} as const;

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORES.PROGRESS)) {
        database.createObjectStore(STORES.PROGRESS, { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains(STORES.CACHE)) {
        const cacheStore = database.createObjectStore(STORES.CACHE, { keyPath: 'key' });
        cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

export async function saveProgress<T>(id: string, data: T): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PROGRESS], 'readwrite');
    const store = transaction.objectStore(STORES.PROGRESS);
    const request = store.put({ id, data, timestamp: Date.now() });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getProgress<T>(id: string): Promise<T | null> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PROGRESS], 'readonly');
    const store = transaction.objectStore(STORES.PROGRESS);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result?.data || null);
    };
  });
}

export async function deleteProgress(id: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PROGRESS], 'readwrite');
    const store = transaction.objectStore(STORES.PROGRESS);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function cacheData<T>(key: string, data: T): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.CACHE], 'readwrite');
    const store = transaction.objectStore(STORES.CACHE);
    const request = store.put({ key, data, timestamp: Date.now() });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.CACHE], 'readonly');
    const store = transaction.objectStore(STORES.CACHE);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result?.data || null);
    };
  });
}

export async function clearOldCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const database = await initDB();
  const threshold = Date.now() - maxAgeMs;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.CACHE], 'readwrite');
    const store = transaction.objectStore(STORES.CACHE);
    const index = store.index('timestamp');
    const range = IDBKeyRange.upperBound(threshold);
    const request = index.openCursor(range);

    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}
