type Handlers = { onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void; onblocked?: () => void };

export type FakeIndexedDb = {
  readonly factory: IDBFactory;
  readonly data: Map<string, unknown>;
};

const later = (run: () => void) => setTimeout(run, 0);

export function fakeIndexedDb(options: { failWrites?: boolean } = {}): FakeIndexedDb {
  const data = new Map<string, unknown>();
  const stores = new Set<string>();
  const transaction = () => {
    let pending = 0;
    const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; error: Error | null; objectStore: () => unknown } = {
      error: null,
      objectStore: () => store,
    };
    const settle = () =>
      later(() => {
        if (pending === 0) tx.oncomplete?.();
      });
    const request = <T,>(run: () => T, fails = false) => {
      pending++;
      const req: Handlers & { result?: T; error: Error | null } = { error: null };
      later(() => {
        if (fails) {
          req.error = new Error("write refused");
          tx.error = req.error;
          req.onerror?.();
          later(() => tx.onerror?.());
          return;
        }
        req.result = run();
        pending--;
        req.onsuccess?.();
        settle();
      });
      return req;
    };
    const store = {
      get: (key: string) => request(() => data.get(key)),
      put: (value: unknown, key: string) => request(() => void data.set(key, value), options.failWrites === true),
    };
    settle();
    return tx;
  };
  const db = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => void stores.add(name),
    transaction,
    close: () => undefined,
  };
  const factory = {
    open: () => {
      const req: Handlers & { result: typeof db; error: null } = { result: db, error: null };
      later(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { factory: factory as unknown as IDBFactory, data };
}

export function brokenIndexedDb(message: string): IDBFactory {
  return {
    open: () => {
      throw new Error(message);
    },
  } as unknown as IDBFactory;
}
