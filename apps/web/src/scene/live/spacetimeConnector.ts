import { DbConnection } from "./bindings";
import type { LiveGraphRow } from "./convert";
import { graphQuery, loadToken, saveToken, segmentsQuery, type LiveConnector } from "./liveConnection";

type UpdatableTable = { onUpdate?: (callback: (ctx: unknown, oldRow: LiveGraphRow, newRow: LiveGraphRow) => void) => void };

export const spacetimeConnector: LiveConnector = (options, handlers) => {
  let closing = false;
  const where = `${options.uri} database ${options.databaseName}`;
  const report = (message: string) => {
    if (closing) return;
    console.error(message);
    handlers.onError(message);
  };
  const saved = loadToken(options);
  const base = DbConnection.builder().withUri(options.uri).withDatabaseName(options.databaseName);
  const connection = (saved ? base.withToken(saved) : base)
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
    })
    .onConnectError((_ctx, error) => report(`live connection to ${where} failed: ${error.message}`))
    .onDisconnect((_ctx, error) => report(`live connection to ${where} closed${error ? `: ${error.message}` : ""}`))
    .build();
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
