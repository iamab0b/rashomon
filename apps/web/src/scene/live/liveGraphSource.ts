import { resolve } from "@rashomon/engine";
import type { SceneManifest } from "@rashomon/schema";
import { storeScene } from "@rashomon/schema/fixtures";
import type { GraphSource } from "../playback/graphSource";
import type { GraphSnapshot } from "../store";
import { convertGraphRow, type LiveGraphRow } from "./convert";
import type { LiveConnection, LiveConnector, LiveOptions } from "./liveConnection";

export interface LiveGraphSource extends GraphSource {
  readonly kind: "live";
  readonly error: string | null;
}

const EMPTY_SNAPSHOT: GraphSnapshot = { resolved: null, statuses: {} };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function liveSnapshot(row: LiveGraphRow, manifest: SceneManifest): GraphSnapshot {
  const graph = convertGraphRow(row);
  if (graph.sceneId !== manifest.sceneId) {
    throw new Error(`live row rejected: scene ${graph.sceneId} does not match manifest ${manifest.sceneId}`);
  }
  const resolved = resolve(graph, manifest);
  return { resolved, statuses: Object.fromEntries(resolved.events.map((event) => [event.id, event.status])) };
}

export function liveGraphSource(
  options: LiveOptions,
  connect: LiveConnector,
  manifest: SceneManifest = storeScene,
): LiveGraphSource {
  let snapshot = EMPTY_SNAPSHOT;
  let error: string | null = null;
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
        try {
          snapshot = liveSnapshot(row, manifest);
          error = null;
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
    getSnapshot: () => snapshot,
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
