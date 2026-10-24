import { DbConnection } from "./bindings";
import { graphQuery, type LiveConnector } from "./liveConnection";

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
      connected.db.graphForScene.onInsert((_ctx, row) => {
        if (!closing) handlers.onRow(row);
      });
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
  };
};
