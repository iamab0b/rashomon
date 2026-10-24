import type { ResolvedGraph } from "../types";
import { endPoint, startPoint } from "./positions";
import type { GateFlag } from "../types";

/**
 * A resolved event is unanchored when it has no resolved position, or a
 * movement lacks its from or to. The gate only sees resolver output, so an
 * anchor the resolver filled in from the actor's last position counts as present.
 */
export function unanchoredFlags(resolved: ResolvedGraph): GateFlag[] {
  const flags: GateFlag[] = [];
  for (const e of resolved.events) {
    if (e.status === "superseded") continue;
    const movement = e.action === "walk" || e.action === "run";
    const missing = movement
      ? (e.from ? 0 : 1) + (e.to ? 0 : 1)
      : startPoint(e) || endPoint(e) ? 0 : 1;
    if (!missing) continue;
    flags.push({
      kind: "unanchored",
      severity: "soft",
      eventIds: [e.id],
      message: movement
        ? `${e.id} (${e.action}) is missing ${missing} of its 2 anchors, so no route can be checked.`
        : `${e.id} (${e.action} by ${e.actor}) resolved to no position in the room, 0 of 1 anchors.`,
    });
  }
  return flags;
}

/** Events whose interval was inferred by the resolver rather than stated. */
export function missingTimeFlags(resolved: ResolvedGraph): GateFlag[] {
  return resolved.events
    .filter((e) => e.tInferred && e.status !== "superseded")
    .map((e) => ({
      kind: "missing_time" as const,
      severity: "soft" as const,
      eventIds: [e.id],
      message: `${e.id} has no stated time; ${e.tStart.toFixed(1)}-${e.tEnd.toFixed(1)} s (${(e.tEnd - e.tStart).toFixed(1)} s) was inferred from the action.`,
    }));
}
