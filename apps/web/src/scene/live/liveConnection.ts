import type { LiveGraphRow } from "./convert";

export type LiveOptions = {
  readonly uri: string;
  readonly databaseName: string;
  readonly sessionId: string;
};

export type LiveHandlers = {
  readonly onRow: (row: LiveGraphRow) => void;
  readonly onError: (message: string) => void;
};

export interface LiveConnection {
  disconnect(): void;
  applyPatches(baseVersion: number, patchesJson: string): Promise<void>;
}

export type LiveConnector = (options: LiveOptions, handlers: LiveHandlers) => LiveConnection;

export const DEFAULT_LIVE_OPTIONS: LiveOptions = {
  uri: "ws://localhost:3000",
  databaseName: "rashomon",
  sessionId: "demo",
};

function param(params: URLSearchParams, key: string, fallback: string): string {
  const value = params.get(key)?.trim();
  return value ? value : fallback;
}

export function liveOptionsFromSearch(search: string): LiveOptions {
  const params = new URLSearchParams(search);
  return {
    uri: param(params, "stdb", DEFAULT_LIVE_OPTIONS.uri),
    databaseName: param(params, "db", DEFAULT_LIVE_OPTIONS.databaseName),
    sessionId: param(params, "session", DEFAULT_LIVE_OPTIONS.sessionId),
  };
}

export function graphQuery(sessionId: string): string {
  return `SELECT * FROM graph_for_scene('${sessionId.replaceAll("'", "''")}')`;
}
