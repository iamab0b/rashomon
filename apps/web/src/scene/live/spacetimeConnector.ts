import { DbConnection } from "./bindings";
import type { LiveGraphRow } from "./convert";
import {
  clearToken,
  generatedMotionsQuery,
  graphQuery,
  loadToken,
  saveToken,
  segmentsQuery,
  type LiveConnector,
} from "./liveConnection";

const isAuthRejection = (error: unknown): boolean => {
  const rejected = error as { name?: unknown; status?: unknown } | null;
  return rejected?.name === "WebSocketTokenError" && (rejected.status === 401 || rejected.status === 403);
};

type UpdatableTable = { onUpdate?: (callback: (ctx: unknown, oldRow: LiveGraphRow, newRow: LiveGraphRow) => void) => void };

export const spacetimeConnector: LiveConnector = (options, handlers) => {
  let closing = false;
  const where = `${options.uri} database ${options.databaseName}`;
  const report = (message: string) => {
    if (closing) return;
    console.error(message);
    handlers.onError(message);
  };
  let retriedWithoutToken = false;
  const open = (saved: string | undefined) => {
    const base = DbConnection.builder().withUri(options.uri).withDatabaseName(options.databaseName);
    return (saved ? base.withToken(saved) : base)
      .onConnect((connected, identity, token) => {
        if (token) saveToken(options, token);
        handlers.onIdentity?.(identity.toHexString());
        const segments = connected.db.segments;
        segments.onInsert((_ctx, row) => handlers.onSegment?.(row));
        segments.onUpdate?.((_ctx, _old, row) => handlers.onSegment?.(row));
        const deliver = (row: LiveGraphRow) => {
          if (!closing) handlers.onRow(row);
        };
        const table = connected.db.graphForScene;
        table.onInsert((_ctx, row) => deliver(row));
        (table as UpdatableTable).onUpdate?.((_ctx, _old, row) => deliver(row));
        connected
          .subscriptionBuilder()
          .onError((ctx) =>
            report(`live subscription to session ${options.sessionId} failed: ${ctx.event?.message ?? "unknown error"}`),
          )
          .subscribe([graphQuery(options.sessionId), segmentsQuery(options.sessionId)]);
        const motions = connected.db.generatedMotions;
        motions.onInsert((_ctx, row) => handlers.onGeneratedMotion?.(row));
        motions.onUpdate?.((_ctx, _old, row) => handlers.onGeneratedMotion?.(row));
        connected
          .subscriptionBuilder()
          .onError((ctx) =>
            console.info(`generated motions unavailable for session ${options.sessionId}: ${ctx.event?.message ?? "unknown error"}`),
          )
          .subscribe([generatedMotionsQuery(options.sessionId)]);
      })
      .onConnectError((_ctx, error) => {
        if (saved && !retriedWithoutToken && !closing && isAuthRejection(error)) {
          retriedWithoutToken = true;
          clearToken(options);
          connection = open(undefined);
          return;
        }
        report(`live connection to ${where} failed: ${error.message}`);
      })
      .onDisconnect((_ctx, error) => report(`live connection to ${where} closed${error ? `: ${error.message}` : ""}`))
      .build();
  };
  let connection = open(loadToken(options));
  return {
    disconnect() {
      closing = true;
      connection.disconnect();
    },
    applyPatches(baseVersion, patchesJson) {
      return connection.reducers.applyPatches({ sessionId: options.sessionId, baseVersion, patchesJson });
    },
    submitStatement(text, witnessName) {
      const reducers = connection.reducers as unknown as {
        submitStatement(args: { sessionId: string; text: string; witnessName: string }): Promise<void>;
      };
      return reducers.submitStatement({ sessionId: options.sessionId, text, witnessName });
    },
  };
};
