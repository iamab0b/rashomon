export type MotionCache = {
  get(key: string): Promise<ArrayBuffer | undefined>;
  put(key: string, bytes: ArrayBuffer): Promise<void>;
};

const DB_NAME = "rashomon.gen";
const STORE = "glb";
const DB_VERSION = 1;

export function cacheKey(characterId: string, motionId: string): string {
  return `rashomon.gen.${characterId}.${motionId}`;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  const req = factory.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
  };
  return request(req);
}

export function memoryCache(seed: ReadonlyMap<string, ArrayBuffer> = new Map()): MotionCache & { readonly entries: Map<string, ArrayBuffer> } {
  const entries = new Map(seed);
  return {
    entries,
    get: async (key) => entries.get(key),
    put: async (key, bytes) => {
      entries.set(key, bytes);
    },
  };
}

export function indexedDbCache(factory: () => IDBFactory | undefined = () => globalThis.indexedDB): MotionCache {
  let opening: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    const idb = factory();
    if (!idb) return Promise.reject(new Error("IndexedDB is not available"));
    opening ??= openDb(idb).catch((error: unknown) => {
      opening = null;
      throw error;
    });
    return opening;
  };
  return {
    async get(key) {
      try {
        const store = (await db()).transaction(STORE, "readonly").objectStore(STORE);
        const value: unknown = await request(store.get(key));
        return value instanceof ArrayBuffer ? value : undefined;
      } catch (error) {
        console.info(`generated motion cache read for ${key} failed`, error);
        return undefined;
      }
    },
    async put(key, bytes) {
      try {
        const store = (await db()).transaction(STORE, "readwrite").objectStore(STORE);
        await request(store.put(bytes, key));
      } catch (error) {
        console.info(`generated motion cache write for ${key} failed`, error);
      }
    },
  };
}
