import type { ResolvedGraph } from "@rashomon/engine";
import type { EventGraph, Status } from "@rashomon/schema";
import { robberyGraph, robberyResolved } from "@rashomon/schema/fixtures";
import type { GraphSnapshot, StatusMap } from "../store";

export interface GraphSource {
  readonly kind: "fixture" | "live";
  getSnapshot(): GraphSnapshot;
  subscribe(listener: () => void): () => void;
}

export type LiveGraphSourceOptions = {
  readonly sceneId: string;
};

export type LiveGraphSourceFactory = (options: LiveGraphSourceOptions) => GraphSource;

const STATUSES: ReadonlySet<string> = new Set<Status>([
  "proposed",
  "plausible",
  "implausible",
  "overridden",
  "superseded",
]);

type GateExpectation = { expectedAfterGate?: { statuses?: Record<string, unknown> } };

export function expectedStatuses(graph: EventGraph): StatusMap {
  const raw = (graph as EventGraph & GateExpectation).expectedAfterGate?.statuses ?? {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, Status] => typeof entry[1] === "string" && STATUSES.has(entry[1])),
  );
}

function staticSource(snapshot: GraphSnapshot): GraphSource {
  return {
    kind: "fixture",
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
  };
}

const ROBBERY_SNAPSHOT: GraphSnapshot = {
  resolved: robberyResolved as unknown as ResolvedGraph,
  statuses: expectedStatuses(robberyGraph),
};

const FIXTURE_GRAPHS: Readonly<Record<string, GraphSnapshot>> = {
  store: ROBBERY_SNAPSHOT,
};

export function fixtureGraphSource(fixture: string): GraphSource | null {
  const snapshot = Object.hasOwn(FIXTURE_GRAPHS, fixture) ? FIXTURE_GRAPHS[fixture] : undefined;
  return snapshot ? staticSource(snapshot) : null;
}
