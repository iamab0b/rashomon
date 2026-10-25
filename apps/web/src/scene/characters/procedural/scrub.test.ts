import type { ResolvedGraph } from "@rashomon/engine";
import type { EventGraph, Status } from "@rashomon/schema";
import { storeScene } from "@rashomon/schema/fixtures";
import { AnimationMixer, type AnimationAction, type AnimationClip } from "three";
import { describe, expect, test } from "vitest";
import { robberyGatedSnapshot } from "../../playback/graphSource";
import type { StatusMap } from "../../store";
import { buildClipWindows, createClipSampler } from "../blend";
import { poseActorFrame, type FramePoser } from "./applyProcedural";
import { locomotionTimer } from "./locomotion";
import { buildProceduralRig } from "./proceduralRig";
import { proceduralSceneFor } from "./proceduralScene";
import { swingClip, syntheticSkeleton } from "./testRig";

const DURATIONS: Readonly<Record<string, number>> = {
  clip_idle: 8.33,
  clip_walk: 1.03,
  clip_run: 0.7,
  clip_crouch_idle: 2.5,
  clip_fall_back: 2.6,
  clip_push: 8.0,
  clip_shoved: 2.73,
  clip_pick_up: 9.57,
  clip_look_around: 6.33,
  clip_talk: 5.17,
};
const CLIPS = new Map<string, AnimationClip>(
  Object.entries(DURATIONS).map(([name, duration], index) => [name, swingClip(name, duration, 0.2 + index * 0.03)]),
);
const STRIDES: Readonly<Record<string, number>> = { clip_walk: 1.846, clip_run: 3.325 };
const ACTORS = ["suspect", "clerk", "witness"] as const;
const SCRUB_TIMES = [0, 20, 5, 7, 10.2, 12.5] as const;

const snapshot = robberyGatedSnapshot();
const resolved = snapshot.resolved as ResolvedGraph;
const fixtureGraph = snapshot.graph ?? null;

type Posed = { readonly pose: (t: number) => number[] };

function posedActor(actorId: string, statuses: StatusMap, graph: EventGraph | null, layers = true): Posed {
  const { root, bones } = syntheticSkeleton();
  const rig = buildProceduralRig(root, bones);
  const lookup = (event: { id: string; status: Status }) => statuses[event.id] ?? event.status;
  const poser: FramePoser = {
    mixer: new AnimationMixer(root),
    sampler: createClipSampler(),
    windowSet: buildClipWindows(actorId, resolved.events, (clip) => CLIPS.has(clip), lookup),
    durationOf: (clip) => DURATIONS[clip],
    clipOf: (clip) => CLIPS.get(clip),
    actions: new Map<string, AnimationAction>(),
    timeOf: locomotionTimer(resolved.events, (clip) => STRIDES[clip]),
    rig: layers ? rig : null,
    scene: layers ? proceduralSceneFor(resolved, statuses, graph, storeScene, actorId) : null,
  };
  return {
    pose: (t) => {
      poseActorFrame(poser, t);
      return bones.flatMap((bone) => bone.quaternion.toArray());
    },
  };
}

function expectSamePose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index] as number, 9));
}

describe("procedural layers keep scrubbing exact", () => {
  test.each(ACTORS)("%s: the pose at 5 after scrubbing 0 → 20 → 5 matches a direct jump to 5", (actorId) => {
    const scrubbed = posedActor(actorId, snapshot.statuses, fixtureGraph);
    scrubbed.pose(0);
    scrubbed.pose(20);
    const afterScrub = scrubbed.pose(5);
    const direct = posedActor(actorId, snapshot.statuses, fixtureGraph).pose(5);
    expectSamePose(afterScrub, direct);
  });

  test.each(ACTORS)("%s: every scrub stop matches a fresh rig jumping straight to it", (actorId) => {
    const scrubbed = posedActor(actorId, snapshot.statuses, fixtureGraph);
    for (const t of [...SCRUB_TIMES, ...[...SCRUB_TIMES].reverse()]) {
      expectSamePose(scrubbed.pose(t), posedActor(actorId, snapshot.statuses, fixtureGraph).pose(t));
    }
  });

  test.each(ACTORS)("%s: holding t still for several frames keeps the same pose", (actorId) => {
    const held = posedActor(actorId, snapshot.statuses, fixtureGraph);
    for (const t of [7, 10.2, 12.5]) {
      const first = held.pose(t);
      expectSamePose(held.pose(t), first);
      expectSamePose(held.pose(t), posedActor(actorId, snapshot.statuses, fixtureGraph).pose(t));
    }
  });

  test("the layers do change the suspect's pose during e4 and at the pick_up attach point", () => {
    for (const t of [7, 10.2]) {
      const withLayers = posedActor("suspect", snapshot.statuses, fixtureGraph).pose(t);
      const clipOnly = posedActor("suspect", snapshot.statuses, fixtureGraph, false).pose(t);
      expect(withLayers).not.toEqual(clipOnly);
    }
  });

  test("a superseded e4 and an implausible e6 run no layer, leaving the clip pose", () => {
    const statuses: StatusMap = { ...snapshot.statuses, e4: "superseded", e6: "implausible" };
    for (const t of [7, 10.2]) {
      const withLayers = posedActor("suspect", statuses, fixtureGraph).pose(t);
      const clipOnly = posedActor("suspect", statuses, fixtureGraph, false).pose(t);
      expectSamePose(withLayers, clipOnly);
    }
  });

  test("the implausible e5 gives the witness no look-at toward the suspect", () => {
    expect(snapshot.statuses.e5).toBe("implausible");
    const scene = proceduralSceneFor(resolved, snapshot.statuses, fixtureGraph, storeScene, "witness");
    expect(scene?.events.map((event) => event.id)).not.toContain("e5");
  });
});
