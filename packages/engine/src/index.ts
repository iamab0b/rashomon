import type { EventGraph, SceneManifest } from "@rashomon/schema";
import { resolve as resolveGraph } from "./resolve/resolve";
import type { GateResult, ResolvedGraph, SceneGeometry } from "./types";

export type * from "./types";

export function resolve(
  graph: EventGraph,
  manifest: SceneManifest,
): ResolvedGraph {
  return resolveGraph(graph, manifest);
}

export function gate(
  _resolved: ResolvedGraph,
  _geom: SceneGeometry,
): GateResult {
  throw new Error("not implemented");
}
