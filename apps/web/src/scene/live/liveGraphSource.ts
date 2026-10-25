import { resolve } from "@rashomon/engine";
import type { Event, EventGraph, Patch, SceneManifest } from "@rashomon/schema";
import { roomScene, storeScene } from "@rashomon/schema/fixtures";
import type { GraphSource } from "../playback/graphSource";
import { checkStatement, statementSegmentId } from "../playback/statementId";
import {
  NO_STATEMENTS,
  liveStatementStatus,
  type LiveSegmentRow,
  type StatementStatuses,
  type SubmittedStatement,
} from "../playback/statementStatus";
import type { GraphSnapshot } from "../store";
import { convertGraphRow, type LiveGraphRow } from "./convert";
import type { LiveConnection, LiveConnector, LiveOptions } from "./liveConnection";

export interface LiveGraphSource extends GraphSource {
  readonly kind: "live";
  readonly error: string | null;
  readonly actionError: string | null;
  readonly identity: string | null;
  statementStatuses(): StatementStatuses;
  apply(patches: readonly Patch[]): void;
  submitStatement(text: string, witnessName: string): Promise<SubmittedStatement>;
  eventOf(id: string): Event | undefined;
}

const NOT_AN_EDITOR_EDIT = "only editors can change the event graph";
const CANNOT_EDIT = "This browser can't edit the event graph";
const CHANGE_IN_FLIGHT = "a change is still being applied; try again in a moment";

const EMPTY_SNAPSHOT: GraphSnapshot = { resolved: null, statuses: {}, graph: null };

const LIVE_MANIFESTS: Readonly<Record<string, SceneManifest>> = { store_v1: storeScene, room_v1: roomScene };

function liveManifest(sceneId: string): SceneManifest {
  const manifest = Object.hasOwn(LIVE_MANIFESTS, sceneId) ? LIVE_MANIFESTS[sceneId] : undefined;
  if (!manifest) {
    throw new Error(`live row rejected: scene ${sceneId} is not a known scene (${Object.keys(LIVE_MANIFESTS).join(", ")})`);
  }
  return manifest;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function liveState(row: LiveGraphRow, pinned?: SceneManifest): { graph: EventGraph; snapshot: GraphSnapshot } {
  const graph = convertGraphRow(row);
  const manifest = pinned ?? liveManifest(graph.sceneId);
  if (graph.sceneId !== manifest.sceneId) {
    throw new Error(`live row rejected: scene ${graph.sceneId} does not match manifest ${manifest.sceneId}`);
  }
  const resolved = resolve(graph, manifest);
  const statuses = Object.fromEntries(resolved.events.map((event) => [event.id, event.status]));
  return { graph, snapshot: { resolved, statuses, graph } };
}

export function liveSnapshot(row: LiveGraphRow, manifest: SceneManifest): GraphSnapshot {
  return liveState(row, manifest).snapshot;
}

export function liveGraphSource(
  options: LiveOptions,
  connect: LiveConnector,
): LiveGraphSource {
  let snapshot = EMPTY_SNAPSHOT;
  let graph: EventGraph | null = null;
  let baseVersion: number | null = null;
  let error: string | null = null;
  let actionError: string | null = null;
  let inFlight = false;
  let connection: LiveConnection | null = null;
  let generation = 0;
  let identity: string | null = null;
  let statements: StatementStatuses = NO_STATEMENTS;
  const submitted = new Map<string, number>();
  const segments = new Map<string, LiveSegmentRow>();
  const recompute = () => {
    const version = baseVersion ?? 0;
    statements = Object.fromEntries(
      [...submitted].map(([segmentId, sentAt]) => [segmentId, liveStatementStatus(segments.get(segmentId), sentAt, version)]),
    );
  };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const open = () => {
    const mine = ++generation;
    const live = () => mine === generation;
    connection = connect(options, {
      onRow(row) {
        if (!live()) return;
        inFlight = false;
        baseVersion = row.version;
        recompute();
        try {
          const next = liveState(row);
          snapshot = next.snapshot;
          graph = next.graph;
          error = null;
          actionError = null;
        } catch (rejected) {
          error = errorMessage(rejected);
        }
        notify();
      },
      onError(message) {
        if (!live()) return;
        error = message;
        notify();
      },
      onSegment(row) {
        if (!live()) return;
        segments.set(row.id, row);
        recompute();
        notify();
      },
      onIdentity(hex) {
        if (!live()) return;
        identity = hex;
        notify();
      },
    });
  };

  const close = () => {
    generation += 1;
    inFlight = false;
    const closing = connection;
    connection = null;
    closing?.disconnect();
  };

  return {
    kind: "live",
    get error() {
      return error;
    },
    get actionError() {
      return actionError;
    },
    get identity() {
      return identity;
    },
    statementStatuses: () => statements,
    getSnapshot: () => snapshot,
    eventOf: (id): Event | undefined => graph?.events.find((event) => event.id === id),
    apply(patches) {
      const sending = connection;
      if (!sending) throw new Error("patches rejected: the live graph source is not connected");
      if (baseVersion === null) {
        throw new Error("patches rejected: no live graph row has arrived yet, so there is no base version to send");
      }
      if (inFlight) throw new Error(CHANGE_IN_FLIGHT);
      const mine = generation;
      inFlight = true;
      sending.applyPatches(baseVersion, JSON.stringify(patches)).then(
        () => {
          if (mine === generation) inFlight = false;
        },
        (rejected: unknown) => {
          if (mine !== generation) return;
          inFlight = false;
          const message = errorMessage(rejected);
          actionError = message.includes(NOT_AN_EDITOR_EDIT) ? CANNOT_EDIT : message;
          notify();
        },
      );
    },
    submitStatement(text, witnessName) {
      const sending = connection;
      if (!sending) throw new Error("statement rejected: the live graph source is not connected");
      if (baseVersion === null) {
        throw new Error("statement rejected: no live graph row has arrived yet, so there is no base version to send");
      }
      const invalid = checkStatement(text, witnessName);
      if (invalid) return Promise.reject(new Error(invalid));
      const sentAt = baseVersion;
      const segmentId = statementSegmentId(options.sessionId, witnessName, text);
      const mine = generation;
      return sending.submitStatement(text.trim(), witnessName.trim()).then(
        () => {
          if (mine === generation) {
            if (!submitted.has(segmentId)) submitted.set(segmentId, sentAt);
            recompute();
            notify();
          }
          return { segmentId, baseVersion: sentAt };
        },
        (rejected: unknown) => {
          const message = errorMessage(rejected);
          if (mine === generation) {
            actionError = message;
            notify();
          }
          throw new Error(message);
        },
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!connection) open();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) close();
      };
    },
  };
}
