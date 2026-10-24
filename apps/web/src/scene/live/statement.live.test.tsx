import { afterEach, describe, expect, it, vi } from "vitest";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { pushSource } from "../playback/useGraph";
import { statementSegmentId } from "../playback/statementId";
import { useGraphActions } from "../playback/useGraphActions";
import { useSceneStore } from "../store";
import { DEFAULT_LIVE_OPTIONS, loadToken, saveToken, segmentsQuery, tokenKey, type LiveConnector, type LiveHandlers } from "./liveConnection";
import { liveGraphSource } from "./liveGraphSource";

const initial = useSceneStore.getState();

const bindings = vi.hoisted(() => {
  const state = {
    withTokenCalls: [] as string[],
    onConnect: null as null | ((conn: unknown, identity: { toHexString(): string }, token: string) => void),
    subscribed: [] as unknown[],
    onConnectError: null as null | ((ctx: unknown, error: Error) => void),
    builds: 0,
  };
  return state;
});

vi.mock("./bindings", () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.withUri = chain;
  builder.withDatabaseName = chain;
  builder.withToken = (token: string) => {
    bindings.withTokenCalls.push(token);
    return builder;
  };
  builder.onConnect = (callback: typeof bindings.onConnect) => {
    bindings.onConnect = callback;
    return builder;
  };
  builder.onConnectError = (callback: typeof bindings.onConnectError) => {
    bindings.onConnectError = callback;
    return builder;
  };
  builder.onDisconnect = chain;
  builder.build = () => {
    bindings.builds += 1;
    return {
      disconnect: () => undefined,
      reducers: { applyPatches: () => Promise.resolve(), submitStatement: () => Promise.resolve() },
    };
  };
  return { DbConnection: { builder: () => builder } };
});

const { spacetimeConnector } = await import("./spacetimeConnector");

function memoryStorage(initialItems: Record<string, string> = {}) {
  const items = new Map(Object.entries(initialItems));
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  };
}

const noHandlers: LiveHandlers = { onRow: () => undefined, onError: () => undefined };

function connectedStub() {
  const table = { onInsert: () => undefined, onUpdate: () => undefined };
  return {
    db: { graphForScene: table, segments: table },
    subscriptionBuilder: () => ({
      onError() {
        return this;
      },
      subscribe: (queries: unknown) => bindings.subscribed.push(queries),
    }),
  };
}

afterEach(() => {
  useSceneStore.setState(initial, true);
  vi.unstubAllGlobals();
  bindings.withTokenCalls.length = 0;
  bindings.subscribed.length = 0;
  bindings.onConnect = null;
  bindings.onConnectError = null;
  bindings.builds = 0;
});

function fakeConnector() {
  const handlers: LiveHandlers[] = [];
  const submitStatement = vi.fn((_text: string, _name: string): Promise<void> => Promise.resolve());
  const connect: LiveConnector = vi.fn((_options, given) => {
    handlers.push(given);
    return { disconnect: vi.fn(), applyPatches: vi.fn(() => Promise.resolve()), submitStatement };
  });
  return { connect, submitStatement, current: () => handlers.at(-1)! };
}

function rowFor(version: number) {
  return { sceneId: robberyGraph.sceneId, actors: [], events: [], props: [], version };
}

function mounted() {
  const fake = fakeConnector();
  const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
  source.subscribe(() => undefined);
  useSceneStore.getState().setGraphSource(source);
  return { fake, source };
}

describe("submitStatement on the live source", () => {
  it("calls the reducer with the text and the witness name and reports extracting, then done from the segments table", async () => {
    const { fake, source } = mounted();
    fake.current().onRow(rowFor(3) as never);

    const { segmentId, baseVersion } = await useGraphActions().submitStatement("  I saw him at the door.  ", " Maria ");

    expect(fake.submitStatement).toHaveBeenCalledWith("I saw him at the door.", "Maria");
    expect(baseVersion).toBe(3);
    expect(segmentId).toBe(statementSegmentId(DEFAULT_LIVE_OPTIONS.sessionId, "Maria", "I saw him at the door."));
    expect(source.statementStatuses()[segmentId]).toEqual({ state: "extracting" });

    fake.current().onSegment?.({ id: segmentId });
    expect(source.statementStatuses()[segmentId]).toEqual({ state: "extracting" });
    fake.current().onSegment?.({ id: segmentId, extractedAt: {}, extractPatchCount: 4 });
    expect(source.statementStatuses()[segmentId]).toEqual({ state: "done", patchCount: 4 });
  });

  it("is done once the graph version passes the version it was sent at", async () => {
    const { fake, source } = mounted();
    fake.current().onRow(rowFor(3) as never);
    const { segmentId } = await useGraphActions().submitStatement("Something happened.", "Maria");
    fake.current().onRow(rowFor(4) as never);
    expect(source.statementStatuses()[segmentId]).toEqual({ state: "done" });
  });

  it("stays extracting while the segment row is visible and another client bumps the version", async () => {
    const { fake, source } = mounted();
    fake.current().onRow(rowFor(3) as never);
    const { segmentId } = await useGraphActions().submitStatement("Something happened.", "Maria");
    fake.current().onSegment?.({ id: segmentId });
    fake.current().onRow(rowFor(4) as never);
    expect(source.statementStatuses()[segmentId]).toEqual({ state: "extracting" });
    fake.current().onSegment?.({ id: segmentId, extractedAt: {}, extractPatchCount: 1 });
    expect(source.statementStatuses()[segmentId]).toEqual({ state: "done", patchCount: 1 });
  });

  it("a short error code on the segment is a failure carrying that code", async () => {
    const { fake, source } = mounted();
    fake.current().onRow(rowFor(3) as never);
    const { segmentId } = await useGraphActions().submitStatement("Something happened.", "Maria");
    fake.current().onSegment?.({ id: segmentId, extractError: "model_error" });
    expect(source.statementStatuses()[segmentId]).toEqual({ state: "failed", error: "model_error" });
  });

  it("a segment that arrived before the reducer call finished still counts", async () => {
    const { fake, source } = mounted();
    fake.current().onRow(rowFor(3) as never);
    const id = statementSegmentId(DEFAULT_LIVE_OPTIONS.sessionId, "Maria", "Early bird.");
    fake.current().onSegment?.({ id, extractedAt: {}, extractPatchCount: 2 });
    await useGraphActions().submitStatement("Early bird.", "Maria");
    expect(source.statementStatuses()[id]).toEqual({ state: "done", patchCount: 2 });
  });

  it("a reducer rejection rejects with the server's message and sets the action error", async () => {
    const { fake, source } = mounted();
    fake.current().onRow(rowFor(3) as never);
    fake.submitStatement.mockRejectedValueOnce(new Error("only editors can add statements"));

    await expect(useGraphActions().submitStatement("Hello.", "Maria")).rejects.toThrow("only editors can add statements");

    expect(source.actionError).toBe("only editors can add statements");
    pushSource(source);
    expect(useSceneStore.getState().actionError).toBe("only editors can add statements");
    expect(Object.keys(source.statementStatuses())).toEqual([]);
  });

  it("throws synchronously before a row has arrived, and rejects invalid text", async () => {
    const { fake } = mounted();
    expect(() => useGraphActions().submitStatement("Hello.", "Maria")).toThrow(/no live graph row/);
    fake.current().onRow(rowFor(1) as never);
    await expect(useGraphActions().submitStatement("  ", "Maria")).rejects.toThrow(/must not be empty/);
    expect(fake.submitStatement).not.toHaveBeenCalled();
  });

  it("the identity from the connection reaches the store only in live mode", () => {
    const { fake, source } = mounted();
    fake.current().onIdentity?.("ab12cd");
    expect(source.identity).toBe("ab12cd");
    pushSource(source);
    expect(useSceneStore.getState().liveIdentity).toBe("ab12cd");
  });
});

describe("the browser's token", () => {
  it("is saved on connect, reused on the next connect, and the identity is reported", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const onIdentity = vi.fn();

    spacetimeConnector(DEFAULT_LIVE_OPTIONS, { ...noHandlers, onIdentity });
    expect(bindings.withTokenCalls).toEqual([]);
    bindings.onConnect?.(connectedStub(), { toHexString: () => "ab12" }, "tok-1");

    expect(storage.items.get(tokenKey(DEFAULT_LIVE_OPTIONS))).toBe("tok-1");
    expect(tokenKey(DEFAULT_LIVE_OPTIONS)).toBe("rashomon.stdb.token.ws://localhost:3000.rashomon");
    expect(onIdentity).toHaveBeenCalledWith("ab12");
    expect(bindings.subscribed[0]).toEqual([
      "SELECT * FROM graph_for_scene('demo')",
      segmentsQuery("demo"),
    ]);

    spacetimeConnector(DEFAULT_LIVE_OPTIONS, noHandlers);
    expect(bindings.withTokenCalls).toEqual(["tok-1"]);
  });

  it("tokens are per server and database", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    saveToken({ uri: "wss://a", databaseName: "x" }, "ta");
    saveToken({ uri: "wss://a", databaseName: "y" }, "tb");
    expect(loadToken({ uri: "wss://a", databaseName: "x" })).toBe("ta");
    expect(loadToken({ uri: "wss://a", databaseName: "y" })).toBe("tb");
    expect(loadToken({ uri: "wss://b", databaseName: "x" })).toBeUndefined();
  });

  it("a storage that throws neither breaks the connect nor the save", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => spacetimeConnector(DEFAULT_LIVE_OPTIONS, noHandlers)).not.toThrow();
    expect(() => bindings.onConnect?.(connectedStub(), { toHexString: () => "ab" }, "tok")).not.toThrow();
    expect(loadToken(DEFAULT_LIVE_OPTIONS)).toBeUndefined();
  });

  it("with no storage at all it still connects", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => spacetimeConnector(DEFAULT_LIVE_OPTIONS, noHandlers)).not.toThrow();
  });
});

const tokenRejected = (status: number) =>
  Object.assign(new Error(`Failed to verify token: ${status}`), { name: "WebSocketTokenError", status });

describe("a saved token the server rejects", () => {
  it("is removed and the connection is retried once without it", () => {
    const storage = memoryStorage({ [tokenKey(DEFAULT_LIVE_OPTIONS)]: "stale-token" });
    vi.stubGlobal("localStorage", {
      ...storage,
      removeItem: (k: string) => void storage.items.delete(k),
    });
    const onError = vi.fn();

    spacetimeConnector(DEFAULT_LIVE_OPTIONS, { ...noHandlers, onError });
    expect(bindings.withTokenCalls).toEqual(["stale-token"]);
    expect(bindings.builds).toBe(1);

    bindings.onConnectError?.({}, tokenRejected(401));

    expect(storage.items.has(tokenKey(DEFAULT_LIVE_OPTIONS))).toBe(false);
    expect(bindings.builds).toBe(2);
    expect(bindings.withTokenCalls).toEqual(["stale-token"]);
    expect(onError).not.toHaveBeenCalled();

    bindings.onConnect?.(connectedStub(), { toHexString: () => "ab" }, "fresh-token");
    expect(storage.items.get(tokenKey(DEFAULT_LIVE_OPTIONS))).toBe("fresh-token");
  });

  it("reports the error when the retry without a token fails too, and does not loop", () => {
    const storage = memoryStorage({ [tokenKey(DEFAULT_LIVE_OPTIONS)]: "stale-token" });
    vi.stubGlobal("localStorage", { ...storage, removeItem: (k: string) => void storage.items.delete(k) });
    const onError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    spacetimeConnector(DEFAULT_LIVE_OPTIONS, { ...noHandlers, onError });
    bindings.onConnectError?.({}, tokenRejected(401));
    bindings.onConnectError?.({}, new Error("still down"));

    expect(bindings.builds).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatch(/failed: still down/);
  });

  it("without a saved token a connect error is reported at once", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const onError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    spacetimeConnector(DEFAULT_LIVE_OPTIONS, { ...noHandlers, onError });
    bindings.onConnectError?.({}, new Error("down"));

    expect(bindings.builds).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a 403 token rejection is treated the same way", () => {
    const storage = memoryStorage({ [tokenKey(DEFAULT_LIVE_OPTIONS)]: "stale-token" });
    vi.stubGlobal("localStorage", { ...storage, removeItem: (k: string) => void storage.items.delete(k) });

    spacetimeConnector(DEFAULT_LIVE_OPTIONS, noHandlers);
    bindings.onConnectError?.({}, tokenRejected(403));

    expect(storage.items.has(tokenKey(DEFAULT_LIVE_OPTIONS))).toBe(false);
    expect(bindings.builds).toBe(2);
  });

  it("a network error keeps the saved token and is reported without a retry", () => {
    const storage = memoryStorage({ [tokenKey(DEFAULT_LIVE_OPTIONS)]: "editor-token" });
    const removeItem = vi.fn((k: string) => void storage.items.delete(k));
    vi.stubGlobal("localStorage", { ...storage, removeItem });
    const onError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    spacetimeConnector(DEFAULT_LIVE_OPTIONS, { ...noHandlers, onError });
    bindings.onConnectError?.({}, new TypeError("Failed to fetch"));

    expect(storage.items.get(tokenKey(DEFAULT_LIVE_OPTIONS))).toBe("editor-token");
    expect(removeItem).not.toHaveBeenCalled();
    expect(bindings.builds).toBe(1);
    expect(bindings.withTokenCalls).toEqual(["editor-token"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatch(/failed: Failed to fetch/);
  });

  it("a token error that is not 401 or 403 keeps the saved token", () => {
    const storage = memoryStorage({ [tokenKey(DEFAULT_LIVE_OPTIONS)]: "editor-token" });
    vi.stubGlobal("localStorage", { ...storage, removeItem: (k: string) => void storage.items.delete(k) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    spacetimeConnector(DEFAULT_LIVE_OPTIONS, noHandlers);
    bindings.onConnectError?.({}, tokenRejected(503));

    expect(storage.items.get(tokenKey(DEFAULT_LIVE_OPTIONS))).toBe("editor-token");
    expect(bindings.builds).toBe(1);
  });

  it("a throwing removeItem does not stop the retry", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "stale-token",
      setItem: () => undefined,
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    spacetimeConnector(DEFAULT_LIVE_OPTIONS, noHandlers);
    expect(() => bindings.onConnectError?.({}, tokenRejected(401))).not.toThrow();
    expect(bindings.builds).toBe(2);
  });
});
