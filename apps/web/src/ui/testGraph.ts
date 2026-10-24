import { gate, resolve, type ResolvedGraph } from "@rashomon/engine";
import type { EventGraph } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { applyPatches } from "../scene";

export function gated(graph: EventGraph): ResolvedGraph {
  const resolved = resolve(graph, storeScene);
  const verdict = gate(resolved, storeScene, { meshes: [] });
  return {
    ...resolved,
    events: resolved.events.map((event) => ({
      ...event,
      status: verdict.statuses[event.id] ?? event.status,
      flags: verdict.flags.filter((flag) => flag.eventId === event.id),
    })),
  };
}

export function gatedRobbery(): ResolvedGraph {
  return gated(robberyGraph);
}

export const OVERRIDE_REASON = "Witness confirmed the view in the second interview";
export const OVERRIDE_AT = Date.UTC(2026, 9, 24, 19, 0, 0);

export function overriddenRobbery(): ResolvedGraph {
  const patched = applyPatches(robberyGraph, [{ op: "override", id: "e5", reason: OVERRIDE_REASON, by: "investigator" }], OVERRIDE_AT, storeScene);
  return gated(patched);
}
