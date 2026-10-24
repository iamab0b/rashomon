import { DbConnection } from "./bindings";
import type { LiveGraphRow } from "./convert";
import { graphQuery, type LiveConnector } from "./liveConnection";

type UpdatableTable = { onUpdate?: (callback: (ctx: unknown, oldRow: LiveGraphRow, newRow: LiveGraphRow) => void) => void };

export const spacetimeConnector: LiveConnector = (options, handlers) => {
  let closing = false;
  const where = `${options.uri} database ${options.databaseName}`;
  const report = (message: string) => {
    if (closing) return;
    console.error(message);
    handlers.onError(message);
  };
  const connection = DbConnection.builder()
    .withUri(options.uri)
    .withDatabaseName(options.databaseName)
    .onConnect((connected) => {
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
        .subscribe(graphQuery(options.sessionId));
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
  };
};
