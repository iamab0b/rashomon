import type { ResolvedEvent, ResolvedGraph, Vec3 } from "@rashomon/engine";
import type { Action } from "@rashomon/schema";
import { robberyGraph, robberyResolved } from "@rashomon/schema/fixtures";
import { describe, expect, test } from "vitest";
import {
  actorPosition,
  actorStatus,
  actorYaw,
  buildActorPlayback,
  ghostAnchor,
  ghostVisible,
  ghostYaw,
  lerpAngle,
  TURN_DURATION_S,
  type ActorPlayback,
  type PositionLookup,
} from "./actorPose";
import { expectedStatuses } from "./graphSource";
import { statusOf } from "./useGraph";

const resolved = robberyResolved as unknown as ResolvedGraph;
const statuses = expectedStatuses(robberyGraph);
const lookup = (event: ResolvedEvent) => statusOf(statuses, event);

const playbacks = new Map(resolved.actors.map((actor) => [actor.id, buildActorPlayback(resolved, actor.id, lookup)]));
const positionOf: PositionLookup = (actorId, t) => {
  const playback = playbacks.get(actorId);
  return playback ? actorPosition(playback, t) : null;
};

function playbackFor(actorId: string): ActorPlayback {
  const playback = playbacks.get(actorId);
  if (!playback) throw new Error(`no playback for ${actorId}`);
  return playback;
}

function closeTo(actual: Vec3 | null, expected: Vec3, digits = 6): void {
  expect(actual).not.toBeNull();
  actual?.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? Number.NaN, digits));
}

function yawOf(direction: Vec3): number {
  return Math.atan2(direction[0], direction[2]);
}

function angleBetween(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function event(id: string, actor: string, action: Action, tStart: number, tEnd: number, extra: Partial<ResolvedEvent> = {}): ResolvedEvent {
  return {
    id,
    actor,
    action,
    tStart,
    tEnd,
    status: "plausible",
    flags: [],
    path: [],
    pathLengthM: 0,
    reachable: true,
    sources: [`utt_${id}`],
    tInferred: false,
    ...extra,
  };
}

function graphOf(events: ResolvedEvent[]): ResolvedGraph {
  return {
    sceneId: "test",
    version: 1,
    durationS: 30,
    actors: [
      { id: "a", label: "a", role: "other", rig: "mixamo_ybot" },
      { id: "b", label: "b", role: "other", rig: "mixamo_ybot", position: [5, 0, 5] },
    ],
    events,
    props: [],
  };
}

describe("fixture statuses", () => {
  test("come from robberyGraph.expectedAfterGate, e5 implausible and the rest plausible", () => {
    expect(statuses.e5).toBe("implausible");
    expect(Object.entries(statuses).filter(([, status]) => status !== "plausible")).toEqual([["e5", "implausible"]]);
  });

  test("the resolved file's own status is only the fallback", () => {
    const e1 = resolved.events.find((candidate) => candidate.id === "e1");
    if (!e1) throw new Error("no e1");
    expect(e1.status).toBe("proposed");
    expect(statusOf(statuses, e1)).toBe("plausible");
    expect(statusOf({}, e1)).toBe("proposed");
  });
});

describe("suspect position on the robbery fixture", () => {
  const suspect = playbackFor("suspect");

  test("starts at the front door and reaches the counter at t = 5", () => {
    closeTo(actorPosition(suspect, 0), [1.5, 0, 0.4]);
    closeTo(actorPosition(suspect, 5), [7.2, 0, 2.5]);
  });

  test("is on the e1 path mid-walk, in front of shelf_b's corner", () => {
    const [x, , z] = actorPosition(suspect, 3) ?? [Number.NaN, 0, Number.NaN];
    expect(x).toBeGreaterThan(4.5);
    expect(x).toBeLessThan(6.4);
    expect(z).toBeLessThan(2.0);
  });

  test("holds at the counter between the walk and the run", () => {
    for (const t of [6, 9.5, 12.5, 15, 19.9]) closeTo(actorPosition(suspect, t), [7.2, 0, 2.5]);
  });

  test("runs back toward the door and holds there after", () => {
    const [x] = actorPosition(suspect, 21) ?? [Number.NaN];
    expect(x).toBeLessThan(7.2);
    expect(x).toBeGreaterThan(1.5);
    closeTo(actorPosition(suspect, 23), [1.5, 0, 0.4]);
    closeTo(actorPosition(suspect, 24), [1.5, 0, 0.4]);
  });
});

describe("witness on the robbery fixture", () => {
  const witness = playbackFor("witness");

  test("the implausible e5 is not part of the real witness's playback", () => {
    expect(witness.events.map((candidate) => candidate.id)).toEqual(["e3", "e9"]);
  });

  test("stays at the chips aisle the whole time", () => {
    for (const t of [0, 10.5, 12, 20]) closeTo(actorPosition(witness, t), [1.5, 0, 3.5]);
  });

  test("is drawn at full opacity because its drawn events are plausible", () => {
    expect(actorStatus(witness, 5)).toBe("plausible");
  });
});

describe("ghost for the implausible e5", () => {
  const e5 = resolved.events.find((candidate) => candidate.id === "e5");
  if (!e5) throw new Error("no e5");

  test("sits at the claimed anchor and is visible only during its window, end inclusive", () => {
    expect(ghostAnchor(e5)).toEqual([1.5, 0, 3.5]);
    expect(ghostVisible(e5, 9.9)).toBe(false);
    expect(ghostVisible(e5, 10)).toBe(true);
    expect(ghostVisible(e5, 12)).toBe(true);
    expect(ghostVisible(e5, 12.1)).toBe(false);
  });

  test("faces the suspect it claims to see", () => {
    const yaw = ghostYaw(e5, 11, positionOf);
    expect(angleBetween(yaw, yawOf([7.2 - 1.5, 0, 2.5 - 3.5]))).toBeLessThan(1e-9);
  });
});

describe("facing", () => {
  test("snaps to the path tangent at t = 0 instead of turning from +Z", () => {
    const suspect = playbackFor("suspect");
    expect(angleBetween(actorYaw(suspect, 0, positionOf), yawOf([4.9, 0, 1.2]))).toBeLessThan(1e-6);
  });

  test("turns at a path corner over 0.3 s, halfway at 0.15 s", () => {
    const g = graphOf([
      event("w", "a", "walk", 1, 5, { path: [[0, 0, 0], [2, 0, 0], [2, 0, 2]], from: [0, 0, 0], to: [2, 0, 2] }),
    ]);
    const a = buildActorPlayback(g, "a", (e) => e.status);
    const lookupNone: PositionLookup = () => null;
    const before = yawOf([1, 0, 0]);
    const after = yawOf([0, 0, 1]);

    expect(angleBetween(actorYaw(a, 2.9, lookupNone), before)).toBeLessThan(1e-6);
    expect(angleBetween(actorYaw(a, 3 + TURN_DURATION_S / 2, lookupNone), lerpAngle(before, after, 0.5))).toBeLessThan(1e-6);
    expect(angleBetween(actorYaw(a, 3 + TURN_DURATION_S, lookupNone), after)).toBeLessThan(1e-6);
  });

  test("turns toward the event's facing point, then holds it", () => {
    const g = graphOf([
      event("s", "a", "stand", 0, 2, { at: [0, 0, 0] }),
      event("t", "a", "stand", 2, 6, { at: [0, 0, 0], facing: [-1, 0, 0] }),
    ]);
    const a = buildActorPlayback(g, "a", (e) => e.status);

    expect(actorYaw(a, 1, () => null)).toBe(0);
    expect(angleBetween(actorYaw(a, 2.15, () => null), lerpAngle(0, yawOf([-1, 0, 0]), 0.5))).toBeLessThan(1e-6);
    expect(angleBetween(actorYaw(a, 5, () => null), yawOf([-1, 0, 0]))).toBeLessThan(1e-6);
  });

  test("turns toward a target actor", () => {
    const g = graphOf([event("t", "a", "speak", 1, 4, { at: [0, 0, 0], target: "b" })]);
    const a = buildActorPlayback(g, "a", (e) => e.status);
    const bAt: PositionLookup = (id) => (id === "b" ? [5, 0, 5] : null);

    expect(angleBetween(actorYaw(a, 3, bAt), Math.PI / 4)).toBeLessThan(1e-6);
  });

  test("scrubbing backward gives exactly the yaw of playing forward", () => {
    const actors = [...playbacks.values()];
    const times = Array.from({ length: 241 }, (_, i) => i * 0.1);
    const forward = times.map((t) => actors.map((p) => actorYaw(p, t, positionOf)));
    const backward = [...times].reverse().map((t) => actors.map((p) => actorYaw(p, t, positionOf))).reverse();

    expect(backward).toEqual(forward);
  });

  test("never jumps more than a 0.3 s turn allows between frames", () => {
    const maxTurnPerFrame = Math.PI / (TURN_DURATION_S / (1 / 60)) + 1e-6;
    for (const playback of playbacks.values()) {
      let previous = actorYaw(playback, 0, positionOf);
      for (let t = 1 / 60; t <= 24; t += 1 / 60) {
        const yaw = actorYaw(playback, t, positionOf);
        expect(angleBetween(yaw, previous), `${playback.actorId} at ${t.toFixed(3)}`).toBeLessThanOrEqual(maxTurnPerFrame);
        previous = yaw;
      }
    }
  });
});

describe("status for opacity", () => {
  test("a proposed current event reads as proposed", () => {
    const g = graphOf([event("p", "a", "stand", 0, 5, { at: [0, 0, 0], status: "proposed" })]);
    expect(actorStatus(buildActorPlayback(g, "a", (e) => e.status), 2)).toBe("proposed");
  });

  test("superseded events are not drawn, so an actor with only those has no playback events", () => {
    const g = graphOf([event("x", "a", "stand", 0, 5, { at: [0, 0, 0], status: "superseded" })]);
    const a = buildActorPlayback(g, "a", (e) => e.status);
    expect(a.events).toEqual([]);
    expect(actorStatus(a, 2)).toBeNull();
  });

  test("the status map overrides the event's own status", () => {
    const g = graphOf([event("p", "a", "stand", 0, 5, { at: [0, 0, 0], status: "proposed" })]);
    const a = buildActorPlayback(g, "a", (e) => statusOf({ p: "overridden" }, e));
    expect(actorStatus(a, 2)).toBe("overridden");
  });
});

describe("actors with no event yet", () => {
  test("stand at the graph's actor position before their first event", () => {
    const g = graphOf([event("late", "b", "stand", 10, 12, { at: [1, 0, 1] })]);
    closeTo(actorPosition(buildActorPlayback(g, "b", (e) => e.status), 2), [5, 0, 5]);
  });
});

describe("holding between events (review fix 1)", () => {
  const nested = graphOf([
    event("walk", "a", "walk", 0, 20, { path: [[0, 0, 0], [10, 0, 0]], from: [0, 0, 0], to: [10, 0, 0] }),
    event("look", "a", "look", 5, 8, { at: [5, 0, 0] }),
  ]);
  const a = buildActorPlayback(nested, "a", (e) => e.status);

  test("after a parent walk with a nested look, the actor holds at the walk's end, not the look's anchor", () => {
    for (const t of [20, 21, 25, 99]) closeTo(actorPosition(a, t), [10, 0, 0]);
  });

  test("while the walk is active the actor keeps walking through the nested look", () => {
    closeTo(actorPosition(a, 6), [3, 0, 0]);
    closeTo(actorPosition(a, 10), [5, 0, 0]);
  });

  test("an in-progress non-moving event wins over an earlier finished one", () => {
    const g = graphOf([
      event("s1", "a", "stand", 0, 4, { at: [0, 0, 0] }),
      event("s2", "a", "speak", 4, 9, { at: [3, 0, 0] }),
    ]);
    closeTo(actorPosition(buildActorPlayback(g, "a", (e) => e.status), 6), [3, 0, 0]);
  });

  test("ties on end time go to the later tStart", () => {
    const g = graphOf([
      event("outer", "a", "stand", 0, 10, { at: [1, 0, 0] }),
      event("inner", "a", "look", 4, 10, { at: [2, 0, 0] }),
    ]);
    closeTo(actorPosition(buildActorPlayback(g, "a", (e) => e.status), 12), [2, 0, 0]);
  });

  test("a parent stand with a nested look holds the parent after both end", () => {
    const g = graphOf([
      event("outer", "a", "stand", 0, 20, { at: [1, 0, 0] }),
      event("inner", "a", "look", 5, 8, { at: [2, 0, 0] }),
    ]);
    closeTo(actorPosition(buildActorPlayback(g, "a", (e) => e.status), 21), [1, 0, 0]);
  });
});

describe("hold uses from ?? at (review fix 4)", () => {
  test("an unreachable movement holds at from, not at", () => {
    const g = graphOf([
      event("m", "a", "walk", 0, 5, {
        reachable: false,
        path: [[0, 0, 0], [4, 0, 0]],
        from: [1, 0, 0],
        at: [9, 0, 0],
        to: [4, 0, 0],
      }),
    ]);
    const a = buildActorPlayback(g, "a", (e) => e.status);

    closeTo(actorPosition(a, 2), [1, 0, 0]);
    closeTo(actorPosition(a, 8), [1, 0, 0]);
  });

  test("an event with from and at holds at from", () => {
    const g = graphOf([event("m", "a", "stand", 0, 5, { from: [1, 0, 0], at: [9, 0, 0] })]);

    closeTo(actorPosition(buildActorPlayback(g, "a", (e) => e.status), 8), [1, 0, 0]);
  });

  test("an event with only at holds at at", () => {
    const g = graphOf([event("m", "a", "stand", 0, 5, { at: [9, 0, 0] })]);

    closeTo(actorPosition(buildActorPlayback(g, "a", (e) => e.status), 8), [9, 0, 0]);
  });
});
