import type { LiveSegmentRow } from "../playback/statementStatus";
import type { LiveGraphRow } from "./convert";

export type LiveOptions = {
  readonly uri: string;
  readonly databaseName: string;
  readonly sessionId: string;
};

export type LiveHandlers = {
  readonly onRow: (row: LiveGraphRow) => void;
  readonly onError: (message: string) => void;
  readonly onSegment?: (row: LiveSegmentRow) => void;
  readonly onIdentity?: (identity: string) => void;
};

export interface LiveConnection {
  disconnect(): void;
  applyPatches(baseVersion: number, patchesJson: string): Promise<void>;
  submitStatement(text: string, witnessName: string): Promise<void>;
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

export function segmentsQuery(sessionId: string): string {
  return `SELECT * FROM segments WHERE session_id = '${sessionId.replaceAll("'", "''")}'`;
}

export function tokenKey(options: Pick<LiveOptions, "uri" | "databaseName">): string {
  return `rashomon.stdb.token.${options.uri}.${options.databaseName}`;
}

export function loadToken(options: Pick<LiveOptions, "uri" | "databaseName">): string | undefined {
  try {
    return globalThis.localStorage?.getItem(tokenKey(options)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function clearToken(options: Pick<LiveOptions, "uri" | "databaseName">): void {
  try {
    globalThis.localStorage?.removeItem(tokenKey(options));
  } catch {
    return;
  }
}

export function saveToken(options: Pick<LiveOptions, "uri" | "databaseName">, token: string): void {
  try {
    globalThis.localStorage?.setItem(tokenKey(options), token);
  } catch {
    return;
  }
}

export function graphQuery(sessionId: string): string {
  return `SELECT * FROM graph_for_scene('${sessionId.replaceAll("'", "''")}')`;
}
