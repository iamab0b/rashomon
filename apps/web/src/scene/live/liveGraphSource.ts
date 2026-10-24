import { resolve } from "@rashomon/engine";
import type { Event, EventGraph, Patch, SceneManifest } from "@rashomon/schema";
import { storeScene } from "@rashomon/schema/fixtures";
import type { GraphSource } from "../playback/graphSource";
import type { GraphSnapshot } from "../store";
import { convertGraphRow, type LiveGraphRow } from "./convert";
import type { LiveConnection, LiveConnector, LiveOptions } from "./liveConnection";

export interface LiveGraphSource extends GraphSource {
  readonly kind: "live";
  readonly error: string | null;
  readonly actionError: string | null;
  apply(patches: readonly Patch[]): void;
  eventOf(id: string): Event | undefined;
}

const EMPTY_SNAPSHOT: GraphSnapshot = { resolved: null, statuses: {} };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function liveState(row: LiveGraphRow, manifest: SceneManifest): { graph: EventGraph; snapshot: GraphSnapshot } {
  const graph = convertGraphRow(row);
  if (graph.sceneId !== manifest.sceneId) {
    throw new Error(`live row rejected: scene ${graph.sceneId} does not match manifest ${manifest.sceneId}`);
  }
  const resolved = resolve(graph, manifest);
  return { graph, snapshot: { resolved, statuses: Object.fromEntries(resolved.events.map((event) => [event.id, event.status])) } };
}

export function liveSnapshot(row: LiveGraphRow, manifest: SceneManifest): GraphSnapshot {
  return liveState(row, manifest).snapshot;
}

export function liveGraphSource(
  options: LiveOptions,
  connect: LiveConnector,
  manifest: SceneManifest = storeScene,
): LiveGraphSource {
  let snapshot = EMPTY_SNAPSHOT;
  let graph: EventGraph | null = null;
  let baseVersion: number | null = null;
  let error: string | null = null;
  let actionError: string | null = null;
  let connection: LiveConnection | null = null;
  let generation = 0;
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
        baseVersion = row.version;
        try {
          const next = liveState(row, manifest);
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
    });
  };

  const close = () => {
    generation += 1;
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
    getSnapshot: () => snapshot,
    eventOf: (id): Event | undefined => graph?.events.find((event) => event.id === id),
    apply(patches) {
      const sending = connection;
      if (!sending) throw new Error("patches rejected: the live graph source is not connected");
      if (baseVersion === null) {
        throw new Error("patches rejected: no live graph row has arrived yet, so there is no base version to send");
      }
      const mine = generation;
      sending.applyPatches(baseVersion, JSON.stringify(patches)).catch((rejected: unknown) => {
        if (mine !== generation) return;
        actionError = errorMessage(rejected);
        notify();
      });
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
