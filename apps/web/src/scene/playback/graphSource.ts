import { gate, resolve, type ResolvedGraph } from "@rashomon/engine";
import type { EventGraph, SceneManifest } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import type { GraphSnapshot } from "../store";

export interface GraphSource {
  readonly kind: "fixture" | "live";
  getSnapshot(): GraphSnapshot;
  subscribe(listener: () => void): () => void;
}

export type LiveGraphSourceOptions = {
  readonly sceneId: string;
};

export type LiveGraphSourceFactory = (options: LiveGraphSourceOptions) => GraphSource;

export function gatedSnapshot(graph: EventGraph, manifest: SceneManifest): GraphSnapshot {
  const resolved = resolve(graph, manifest);
  const verdict = gate(resolved, manifest, { meshes: [] });
  const gated: ResolvedGraph = {
    ...resolved,
    events: resolved.events.map((event) => ({
      ...event,
      status: verdict.statuses[event.id] ?? event.status,
      flags: verdict.flags.filter((flag) => flag.eventId === event.id),
    })),
  };
  return { resolved: gated, statuses: verdict.statuses };
}

function staticSource(snapshot: () => GraphSnapshot): GraphSource {
  return {
    kind: "fixture",
    getSnapshot: snapshot,
    subscribe: () => () => undefined,
  };
}

const memo = new Map<string, GraphSnapshot>();

function memoized(key: string, build: () => GraphSnapshot): () => GraphSnapshot {
  return () => {
    const cached = memo.get(key);
    if (cached) return cached;
    const built = build();
    memo.set(key, built);
    return built;
  };
}

const FIXTURE_GRAPHS: Readonly<Record<string, () => GraphSnapshot>> = {
  store: memoized("store", () => gatedSnapshot(robberyGraph, storeScene)),
};

export function fixtureGraphSource(fixture: string): GraphSource | null {
  const build = Object.hasOwn(FIXTURE_GRAPHS, fixture) ? FIXTURE_GRAPHS[fixture] : undefined;
  return build ? staticSource(build) : null;
}

export function robberyGatedSnapshot(): GraphSnapshot {
  const source = fixtureGraphSource("store");
  if (!source) throw new Error("store fixture graph is not registered");
  return source.getSnapshot();
}
