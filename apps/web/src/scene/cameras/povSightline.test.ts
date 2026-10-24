import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import type { Action } from "@rashomon/schema";
import { beforeEach, describe, expect, test } from "vitest";
import { robberyGatedSnapshot } from "../playback/graphSource";
import { playbacksFor } from "../playback/playbacks";
import { useSceneStore } from "../store";
import {
  CHEST_HEIGHT_M,
  EYE_HEIGHT_M,
  currentPovRay,
  followedActorId,
  getPovSightline,
  povActorId,
  povRay,
  povSightline,
} from "./povSightline";

const snapshot = robberyGatedSnapshot();
const resolved = snapshot.resolved as ResolvedGraph;
const statuses = snapshot.statuses;
const initial = useSceneStore.getState();

beforeEach(() => {
  useSceneStore.setState(initial, true);
});

function event(id: string, actor: string, action: Action, tStart: number, tEnd: number, extra: Partial<ResolvedEvent> = {}): ResolvedEvent {
  return { id, witnessId: "w1", actor, action, tStart, tEnd, status: "plausible", flags: [], path: [], pathLengthM: 0, reachable: true, sources: [`utt_${id}`], tInferred: false, ...extra };
}

function graphOf(events: ResolvedEvent[]): ResolvedGraph {
  return {
    sceneId: "test",
    version: 1,
    durationS: 30,
    actors: [
      { id: "w", label: "w", role: "witness", rig: "mixamo_ybot" },
      { id: "s", label: "s", role: "suspect", rig: "mixamo_ybot" },
    ],
    events,
    props: [],
  };
}

describe("povActorId", () => {
  test("defaults to the first actor whose role is witness", () => {
    expect(povActorId(resolved, null)).toBe("witness");
  });

  test("uses an explicit actor when it exists, and ignores one that does not", () => {
    expect(povActorId(resolved, "clerk")).toBe("clerk");
    expect(povActorId(resolved, "nobody")).toBe("witness");
  });

  test("is null without a graph", () => {
    expect(povActorId(null, null)).toBeNull();
  });
});

describe("povSightline on the robbery fixture", () => {
  test("at t = 11 the eye is the witness's position + 1.6 m and it looks at the suspect's chest", () => {
    const sightline = povSightline(resolved, statuses, "witness", 11);

    expect(sightline).toEqual({
      actorId: "witness",
      eventId: "e5",
      eye: [1.5, EYE_HEIGHT_M, 3.5],
      target: [7.2, CHEST_HEIGHT_M, 2.5],
    });
  });

  test("the claimed look counts even though the gate marks it implausible", () => {
    expect(statuses.e5).toBe("implausible");
    expect(povSightline(resolved, statuses, "witness", 11)?.eventId).toBe("e5");
  });

  test("before the look, the facing point is used, lifted to chest height", () => {
    expect(povSightline(resolved, statuses, "witness", 5)).toMatchObject({ eventId: "e3", target: [1.9, CHEST_HEIGHT_M, 3.3] });
  });

  test("follows the suspect's resolved path when the POV actor is the suspect", () => {
    const sightline = povSightline(resolved, statuses, "suspect", 5);
    expect(sightline?.eye).toEqual([7.2, EYE_HEIGHT_M, 2.5]);
  });

  test("an actor with no drawn events has no sightline", () => {
    expect(povSightline(resolved, statuses, "nobody", 5)).toBeNull();
  });
});

describe("povSightline on synthetic graphs", () => {
  test("follows a moving witness over time", () => {
    const g = graphOf([
      event("walk", "w", "walk", 0, 4, { path: [[0, 0, 0], [4, 0, 0]], from: [0, 0, 0], to: [4, 0, 0] }),
      event("stand", "s", "stand", 0, 10, { at: [4, 0, 4] }),
    ]);
    expect(povSightline(g, {}, "w", 1)?.eye).toEqual([1, EYE_HEIGHT_M, 0]);
    expect(povSightline(g, {}, "w", 3)?.eye).toEqual([3, EYE_HEIGHT_M, 0]);
  });

  test("a superseded look is ignored and the witness looks along its facing instead", () => {
    const g = graphOf([
      event("stand", "w", "stand", 0, 10, { at: [0, 0, 0] }),
      event("look", "w", "look", 2, 6, { at: [0, 0, 0], target: "s", status: "superseded" }),
      event("s", "s", "stand", 0, 10, { at: [0, 0, 5] }),
    ]);
    const sightline = povSightline(g, {}, "w", 3);
    expect(sightline?.eventId).toBeNull();
    expect(sightline?.target[1]).toBe(CHEST_HEIGHT_M);
  });

  test("with no look or facing it looks straight ahead along the actor's yaw", () => {
    const g = graphOf([event("stand", "w", "stand", 0, 10, { at: [0, 0, 0] })]);
    const sightline = povSightline(g, {}, "w", 3);
    expect(sightline?.target[0]).toBeCloseTo(0);
    expect(sightline?.target[2]).toBeGreaterThan(0);
  });
});

describe("follow state", () => {
  test("followedActorId is null unless follow is on", () => {
    expect(followedActorId({ povFollow: false, povActor: null, resolved })).toBeNull();
    expect(followedActorId({ povFollow: true, povActor: null, resolved })).toBe("witness");
  });

  test("getPovSightline reads the store at the current t", () => {
    useSceneStore.getState().setGraph({ resolved, statuses });
    useSceneStore.getState().setT(11);
    expect(getPovSightline()).toBeNull();

    useSceneStore.getState().setPovFollow(true);

    expect(getPovSightline()?.eventId).toBe("e5");
  });
});

describe("playbacksFor", () => {
  test("returns the same object for the same graph and statuses", () => {
    expect(playbacksFor(resolved, statuses)).toBe(playbacksFor(resolved, statuses));
  });

  test("rebuilds when the statuses object changes", () => {
    expect(playbacksFor(resolved, { ...statuses })).not.toBe(playbacksFor(resolved, statuses));
  });
});

describe("sightline ray", () => {
  test("at t = 11 the ray is red and ends at shelf_a, short of the suspect, along the eye-to-chest line", () => {
    const ray = povRay(resolved, povSightline(resolved, statuses, "witness", 11));

    expect(ray?.blocked).toBe(true);
    expect(ray?.blocker).toBe("shelf_a");
    expect(ray?.from).toEqual([1.5, 1.6, 3.5]);
    const [x, y, z] = ray?.to ?? [Number.NaN, Number.NaN, Number.NaN];
    expect(x).toBeGreaterThan(2.3);
    expect(x).toBeLessThan(3.5);
    expect(x).toBeLessThan(7.2);
    expect(y).toBeLessThan(1.6);
    expect(y).toBeGreaterThan(1.2);
    expect(z).toBeLessThan(3.5);
    expect(z).toBeGreaterThan(2.5);
  });

  test("the blocked end lies on the straight line from the eye to the target", () => {
    const sightline = povSightline(resolved, statuses, "witness", 11);
    const ray = povRay(resolved, sightline);
    if (!sightline || !ray) throw new Error("no ray");
    const fraction = (ray.to[0] - ray.from[0]) / (sightline.target[0] - ray.from[0]);

    expect(ray.to[1]).toBeCloseTo(ray.from[1] + fraction * (sightline.target[1] - ray.from[1]), 6);
    expect(ray.to[2]).toBeCloseTo(ray.from[2] + fraction * (sightline.target[2] - ray.from[2]), 6);
  });

  test("a look with no sightline flag draws a green ray all the way to the target", () => {
    const clear = {
      ...resolved,
      events: resolved.events.map((event) => (event.id === "e5" ? { ...event, flags: [], status: "plausible" as const } : event)),
    };
    const sightline = povSightline(clear, {}, "witness", 11);

    const ray = povRay(clear, sightline);

    expect(ray).toMatchObject({ blocked: false, blocker: null, from: sightline?.eye, to: sightline?.target });
  });

  test("no ray when the current event is not a look at a target", () => {
    expect(povRay(resolved, povSightline(resolved, statuses, "witness", 5))).toBeNull();
    expect(povRay(resolved, null)).toBeNull();
  });

  test("a flag without usable evidence still draws a blocked ray to the target instead of NaN", () => {
    const broken = {
      ...resolved,
      events: resolved.events.map((event) =>
        event.id === "e5" ? { ...event, flags: event.flags.map((flag) => ({ ...flag, evidence: {} })) } : event,
      ),
    };

    const ray = povRay(broken, povSightline(broken, statuses, "witness", 11));

    expect(ray?.blocked).toBe(true);
    expect(ray?.to.every((value) => Number.isFinite(value))).toBe(true);
  });

  test("currentPovRay reads the store at the current t", () => {
    useSceneStore.getState().setGraph({ resolved, statuses });
    useSceneStore.getState().setT(5);
    expect(currentPovRay()).toBeNull();

    useSceneStore.getState().setT(11);

    expect(currentPovRay()?.blocked).toBe(true);
  });
});
