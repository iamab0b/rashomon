import type { EventGraph, SceneManifest } from "@rashomon/schema";
import type { GateResult, ResolvedGraph, SceneGeometry } from "./types";

export type * from "./types";

export function resolve(
  _graph: EventGraph,
  _manifest: SceneManifest,
): ResolvedGraph {
  throw new Error("not implemented");
}

export function gate(
  _resolved: ResolvedGraph,
  _geom: SceneGeometry,
): GateResult {
  throw new Error("not implemented");
}
