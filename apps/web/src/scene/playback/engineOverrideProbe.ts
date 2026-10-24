import type { EventGraph } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { gatedSnapshot } from "./gatedSnapshot";

export const ENGINE_OVERRIDE_PR = "PR #11 (branch engine-override)";
const PROBE_REASON = "witness later confirmed the view";

export function engineHonorsOverride(): boolean {
  const graph: EventGraph = {
    ...robberyGraph,
    events: robberyGraph.events.map((event) =>
      event.id === "e5"
        ? { ...event, override: { by: "test", reason: PROBE_REASON, at: 0, flagIds: ["sightline:e5"] } }
        : event,
    ),
  };
  const e5 = gatedSnapshot(graph, storeScene).resolved?.events.find((event) => event.id === "e5");
  return e5?.status === "overridden";
}
