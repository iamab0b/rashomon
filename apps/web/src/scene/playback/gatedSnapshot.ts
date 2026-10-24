import { gate, resolve, type ResolvedGraph } from "@rashomon/engine";
import type { EventGraph, SceneManifest } from "@rashomon/schema";
import type { GraphSnapshot } from "../store";

export function gatedSnapshot(graph: EventGraph, manifest: SceneManifest): GraphSnapshot {
  const resolved = resolve(graph, manifest);
  const verdict = gate(resolved, manifest, { meshes: [] });
  const gated: ResolvedGraph = {
    ...resolved,
    events: resolved.events.map((event) => ({
      ...event,
      status: verdict.statuses[event.id] ?? event.status,
      flags: verdict.flags.filter((flag) => flag.eventId === event.id),
    })),
  };
  return { resolved: gated, statuses: verdict.statuses, graph };
}
