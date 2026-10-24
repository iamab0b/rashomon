import type { Flag, SceneManifest, Status } from "@rashomon/schema";
import type { FlagDraft, GateOutput, ResolvedEvent, ResolvedGraph, SceneGeom } from "../types";
import { missingTimeFlags, unanchoredFlags } from "./completeness";
import { contradictionFlags } from "./contradiction";
import { reachabilityFlags } from "./reachability";
import { sightlineFlags } from "./sightline";
import { timeDistanceFlags } from "./timeDistance";

export { segmentBlocked, rayTriangle } from "./raycast";
export type { RayHit } from "./raycast";

const MIN_OVERRIDE_REASON_CHARS = 10;

const hasWrittenReason = (e: ResolvedEvent): boolean =>
  typeof e.override?.reason === "string" && e.override.reason.trim().length >= MIN_OVERRIDE_REASON_CHARS;

function withSupersededApplied(resolved: ResolvedGraph): ResolvedGraph {
  return {
    ...resolved,
    events: resolved.events.map((e) =>
      e.supersededBy && e.status !== "superseded" ? { ...e, status: "superseded" as const } : e,
    ),
  };
}

export function gate(
  input: ResolvedGraph,
  manifest: SceneManifest,
  geom: SceneGeom,
): GateOutput {
  const resolved = withSupersededApplied(input);
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
    const hard = mine.some((f) => f.severity === "hard");
    if (e.status === "superseded") statuses[e.id] = "superseded";
    else if (hard && hasWrittenReason(e)) statuses[e.id] = "overridden";
    else if (e.status === "overridden") statuses[e.id] = "overridden";
    else if (hard) statuses[e.id] = "implausible";
    else if (mine.some((f) => f.check === "unanchored" || f.check === "missing_time"))
      statuses[e.id] = "proposed";
    else statuses[e.id] = "plausible";
  }
  return { statuses, flags };
}
