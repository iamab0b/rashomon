import type { Flag, SceneManifest, Status } from "@rashomon/schema";
import type { FlagDraft, GateOutput, ResolvedGraph, SceneGeom } from "../types";
import { missingTimeFlags, unanchoredFlags } from "./completeness";
import { contradictionFlags } from "./contradiction";
import { reachabilityFlags } from "./reachability";
import { sightlineFlags } from "./sightline";
import { timeDistanceFlags } from "./timeDistance";

export { segmentBlocked, rayTriangle } from "./raycast";
export type { RayHit } from "./raycast";

export function gate(
  resolved: ResolvedGraph,
  manifest: SceneManifest,
  geom: SceneGeom,
): GateOutput {
  const drafts: FlagDraft[] = [
    ...sightlineFlags(resolved, manifest, geom),
    ...reachabilityFlags(resolved, manifest),
    ...timeDistanceFlags(resolved),
    ...contradictionFlags(resolved, manifest),
    ...unanchoredFlags(resolved, manifest),
    ...missingTimeFlags(resolved),
  ];

  const seen = new Map<string, number>();
  const flags: Flag[] = drafts.map((d) => {
    const base = `${d.check}:${d.eventId}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { id: n === 1 ? base : `${base}:${n}`, ...d };
  });

  const statuses: Record<string, Status> = {};
  for (const e of resolved.events) {
    const mine = flags.filter((f) => f.eventId === e.id);
    if (e.status === "overridden" || e.status === "superseded") statuses[e.id] = e.status;
    else if (mine.some((f) => f.severity === "hard")) statuses[e.id] = "implausible";
    else if (mine.some((f) => f.check === "unanchored" || f.check === "missing_time"))
      statuses[e.id] = "proposed";
    else statuses[e.id] = "plausible";
  }
  return { statuses, flags };
}
