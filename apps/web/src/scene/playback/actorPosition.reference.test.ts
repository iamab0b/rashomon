import type { ResolvedEvent, ResolvedGraph, Vec3 } from "@rashomon/engine";
import { describe, expect, test } from "vitest";
import { actorPosition, buildActorPlayback, type ActorPlayback } from "./actorPose";
import { robberyGatedSnapshot } from "./graphSource";
import { getPose } from "./paths";
import { statusOf } from "./useGraph";

const SAMPLE_COUNT = 200;

function pointAt(playback: ActorPlayback, event: ResolvedEvent, t: number): Vec3 | null {
  return getPose(event, t, playback.paths.get(event.id) ?? null)?.position ?? null;
}

function referenceActiveMovement(playback: ActorPlayback, t: number): ResolvedEvent | undefined {
  let active: ResolvedEvent | undefined;
  for (const event of playback.events) {
    if (event.tStart > t) break;
    if (t <= event.tEnd && playback.paths.has(event.id)) active = event;
  }
  return active;
}

function referenceHeldCandidates(playback: ActorPlayback, t: number): ResolvedEvent[] {
  return playback.events
    .filter((event) => event.tStart <= t)
    .map((event) => ({ event, reached: Math.min(event.tEnd, t) }))
    .sort((a, b) => b.reached - a.reached || b.event.tStart - a.event.tStart)
    .map(({ event }) => event);
}

function referencePosition(playback: ActorPlayback, t: number): Vec3 | null {
  const moving = referenceActiveMovement(playback, t);
  const movingPoint = moving ? pointAt(playback, moving, t) : null;
  if (movingPoint) return movingPoint;
  for (const event of referenceHeldCandidates(playback, t)) {
    const point = pointAt(playback, event, t);
    if (point) return point;
  }
  const first = playback.events[0];
  return playback.restPosition ?? (first ? pointAt(playback, first, first.tStart) : null);
}

describe("actorPosition against the pre-memoization implementation", () => {
  const snapshot = robberyGatedSnapshot();
  const resolved = snapshot.resolved as ResolvedGraph;
  const lookup = (event: ResolvedEvent) => statusOf(snapshot.statuses, event);

  test("returns identical positions for every actor at 200 sample times", () => {
    const times = Array.from(
      { length: SAMPLE_COUNT },
      (_, index) => (index / (SAMPLE_COUNT - 1)) * (resolved.durationS + 2) - 1,
    );
    let compared = 0;

    for (const actor of resolved.actors) {
      const playback = buildActorPlayback(resolved, actor.id, lookup);
      for (const t of times) {
        expect(actorPosition(playback, t)).toEqual(referencePosition(playback, t));
        compared += 1;
      }
    }

    expect(compared).toBe(resolved.actors.length * SAMPLE_COUNT);
  });

  test("repeated calls on one playback keep returning the same positions", () => {
    const playback = buildActorPlayback(resolved, resolved.actors[0]?.id ?? "", lookup);
    const first = [3, 9, 15].map((t) => actorPosition(playback, t));
    const second = [3, 9, 15].map((t) => actorPosition(playback, t));

    expect(second).toEqual(first);
  });
});
