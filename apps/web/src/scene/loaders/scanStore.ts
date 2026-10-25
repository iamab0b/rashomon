import type { SceneGeom } from "@rashomon/engine";
import type { Alignment } from "./alignment";

export const SCAN_DB = "rashomon";
export const SCAN_STORE = "scans";
const SCAN_DB_VERSION = 1;
const SCAN_KEY_PREFIX = "rashomon.scan.";

export type ScanRecord = {
  readonly hash: string;
  readonly name: string;
  readonly bytes?: ArrayBuffer;
  readonly alignment?: Alignment;
  readonly geom?: SceneGeom;
};

export function scanKey(hash: string): string {
  return `${SCAN_KEY_PREFIX}${hash}`;
}

export function scanStoreErrorMessage(detail: unknown): string {
  const text = detail instanceof Error ? detail.message : String(detail);
  return `The scan store in this browser (IndexedDB) is unavailable: ${text}`;
}

function defaultFactory(): IDBFactory {
  const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!factory) throw new Error("this browser has no IndexedDB");
  return factory;
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("request failed"));
  });
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(SCAN_DB, SCAN_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SCAN_STORE)) request.result.createObjectStore(SCAN_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open failed"));
    request.onblocked = () => reject(new Error("the database is blocked by another tab"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  factory: IDBFactory | undefined,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  try {
    const db = await openDb(factory ?? defaultFactory());
    try {
      const transaction = db.transaction(SCAN_STORE, mode);
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("transaction aborted"));
      });
      const [result] = await Promise.all([run(transaction.objectStore(SCAN_STORE)), done]);
      return result;
    } finally {
      db.close();
    }
  } catch (error) {
    throw new Error(scanStoreErrorMessage(error));
  }
}

export function readScan(hash: string, factory?: IDBFactory): Promise<ScanRecord | null> {
  return withStore("readonly", factory, async (store) => {
    const value = (await settle(store.get(scanKey(hash)))) as ScanRecord | undefined;
    return value ?? null;
  });
}

export function putScanBytes(hash: string, name: string, bytes: ArrayBuffer, factory?: IDBFactory): Promise<void> {
  return withStore("readwrite", factory, async (store) => {
    const key = scanKey(hash);
    const current = (await settle(store.get(key))) as ScanRecord | undefined;
    if (current?.bytes) return;
    await settle(store.put({ ...current, hash, name, bytes }, key));
  });
}

export function patchScan(
  hash: string,
  name: string,
  patch: Pick<ScanRecord, "alignment" | "geom">,
  factory?: IDBFactory,
): Promise<void> {
  return withStore("readwrite", factory, async (store) => {
    const key = scanKey(hash);
    const current = ((await settle(store.get(key))) as ScanRecord | undefined) ?? { hash, name };
    await settle(store.put({ ...current, ...patch }, key));
  });
}
