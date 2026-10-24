import type { SceneManifest, Status } from "@rashomon/schema";
import type { ResolvedGraph } from "../types";
import { contradictionFlags } from "./contradiction";
import { missingTimeFlags, unanchoredFlags } from "./completeness";
import { reachabilityFlags } from "./reachability";
import { sightlineFlags } from "./sightline";
import { timeDistanceFlags } from "./timeDistance";
import type { GateFlag, GateOutput, SceneGeom } from "../types";

export { segmentBlocked, rayTriangle } from "./raycast";
export type { RayHit } from "./raycast";

/**
 * Runs every rule in a fixed order (sightline, reachability, time_distance,
 * contradiction, unanchored, missing_time) and derives a status per event:
 * overridden and superseded are kept; otherwise any hard flag is implausible,
 * an unanchored or missing_time flag leaves it proposed, and everything else
 * (clean or soft-flagged) is plausible. Inputs are never mutated.
 */
export function gate(
  resolved: ResolvedGraph,
  manifest: SceneManifest,
  geom: SceneGeom,
): GateOutput {
  const flags: GateFlag[] = [
    ...sightlineFlags(resolved, geom),
    ...reachabilityFlags(resolved, manifest),
    ...timeDistanceFlags(resolved),
    ...contradictionFlags(resolved, manifest),
    ...unanchoredFlags(resolved),
    ...missingTimeFlags(resolved),
  ];

  const statuses: Record<string, Status> = {};
  for (const e of resolved.events) {
    const mine = flags.filter((f) => f.eventIds.includes(e.id));
    if (e.status === "overridden" || e.status === "superseded") statuses[e.id] = e.status;
    else if (mine.some((f) => f.severity === "hard")) statuses[e.id] = "implausible";
    else if (mine.some((f) => f.kind === "unanchored" || f.kind === "missing_time"))
      statuses[e.id] = "proposed";
    else statuses[e.id] = "plausible";
  }
  return { statuses, flags };
}
