import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import type { StatusMap } from "../store";
import { actorPosition, buildActorPlayback, type ActorPlayback, type PositionLookup } from "./actorPose";
import { statusOf } from "./useGraph";

export type PlaybackSet = {
  readonly byId: ReadonlyMap<string, ActorPlayback>;
  readonly positionOf: PositionLookup;
};

const cache = new WeakMap<ResolvedGraph, WeakMap<StatusMap, PlaybackSet>>();

function build(resolved: ResolvedGraph, statuses: StatusMap): PlaybackSet {
  const lookup = (event: ResolvedEvent) => statusOf(statuses, event);
  const byId = new Map(
    resolved.actors
      .map((actor) => buildActorPlayback(resolved, actor.id, lookup))
      .filter((playback) => playback.events.length > 0)
      .map((playback) => [playback.actorId, playback] as const),
  );
  const positionOf: PositionLookup = (actorId, t) => {
    const playback = byId.get(actorId);
    return playback ? actorPosition(playback, t) : null;
  };
  return { byId, positionOf };
}

export function playbacksFor(resolved: ResolvedGraph, statuses: StatusMap): PlaybackSet {
  const byStatuses = cache.get(resolved) ?? new WeakMap<StatusMap, PlaybackSet>();
  cache.set(resolved, byStatuses);
  const cached = byStatuses.get(statuses);
  if (cached) return cached;
  const built = build(resolved, statuses);
  byStatuses.set(statuses, built);
  return built;
}
