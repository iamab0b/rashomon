import { gate, resolve, type ResolvedGraph } from "@rashomon/engine";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";

export function gatedRobbery(): ResolvedGraph {
  const resolved = resolve(robberyGraph, storeScene);
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
