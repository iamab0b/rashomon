import type { ResolvedGraph } from "@rashomon/engine";
import { isDrawn, type StatusLookup } from "../playback/actorPose";

export function holderDrawn(graph: Pick<ResolvedGraph, "events">, statusOf: StatusLookup, actorId: string, t: number): boolean {
  const mine = graph.events
    .filter((e) => e.actor === actorId)
    .sort((a, b) => a.tStart - b.tStart || a.id.localeCompare(b.id));
  const started = mine.filter((e) => e.tStart <= t);
  const current = started[started.length - 1] ?? mine[0];
  return current ? isDrawn(statusOf(current)) : true;
}
