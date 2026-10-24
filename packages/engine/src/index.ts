import type { EventGraph, SceneManifest } from "@rashomon/schema";
import { resolve as resolveGraph } from "./resolve/resolve";
import type { ResolvedGraph } from "./types";

export type * from "./types";
export { gate } from "./gate";

export function resolve(
  graph: EventGraph,
  manifest: SceneManifest,
): ResolvedGraph {
  return resolveGraph(graph, manifest);
}
