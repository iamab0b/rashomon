import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import { VectorKeyframeTrack } from "three";
import { describe, expect, test } from "vitest";
import { robberyGatedSnapshot } from "../../playback/graphSource";
import { statusOf } from "../../playback/useGraph";
import { buildClipWindows, createClipSampler } from "../blend";
import { MIXAMO_UNIT_SCALE } from "../rigs";
import { distanceAlongPath, locomotionClipTime, locomotionTimer, measureCycleDistance } from "./locomotion";

const WALK_CYCLE_M = 1.846;
const WALK_LENGTH_S = 1.033;
const RUN_CYCLE_M = 3.325;
const cycles: Readonly<Record<string, number>> = { clip_walk: WALK_CYCLE_M, clip_run: RUN_CYCLE_M };
const cycleOf = (clip: string) => cycles[clip];
const DURATIONS: Readonly<Record<string, number>> = {
  clip_idle: 8.33,
  clip_walk: WALK_LENGTH_S,
  clip_run: 0.7,
  clip_talk: 5.17,
  clip_pick_up: 9.57,
  clip_push: 8.0,
  clip_shoved: 2.73,
};
const durationOf = (clip: string) => DURATIONS[clip];

const snapshot = robberyGatedSnapshot();
const resolved = snapshot.resolved as ResolvedGraph;
const e1 = resolved.events.find((event) => event.id === "e1") as ResolvedEvent;

describe("locomotion clip time from distance along the path", () => {
  test("the clip time is proportional to the distance, wrapping once per cycle", () => {
    expect(locomotionClipTime(0, 2, 1)).toBe(0);
    expect(locomotionClipTime(0.5, 2, 1)).toBeCloseTo(0.25, 12);
    expect(locomotionClipTime(1, 2, 1)).toBeCloseTo(0.5, 12);
    expect(locomotionClipTime(2.5, 2, 1)).toBeCloseTo(0.25, 12);
  });

  test("distance along the path is the resolver's length times the event fraction", () => {
    expect(distanceAlongPath(e1, e1.tStart)).toBe(0);
    expect(distanceAlongPath(e1, (e1.tStart + e1.tEnd) / 2)).toBeCloseTo(e1.pathLengthM / 2, 9);
    expect(distanceAlongPath(e1, e1.tEnd + 1)).toBeCloseTo(e1.pathLengthM, 9);
  });

  test("at e1's resolved speed the cycle advances one stride per stride walked, so the feet do not slide", () => {
    const timer = locomotionTimer(resolved.events, cycleOf);
    const window = buildClipWindows("suspect", resolved.events, (clip) => clip in DURATIONS, (event) =>
      statusOf(snapshot.statuses, event),
    ).windows.find((w) => w.source === "e1");
    if (!window) throw new Error("e1 has no clip window");
    const dt = 0.01;
    const before = timer(window, 2, WALK_LENGTH_S) as number;
    const after = timer(window, 2 + dt, WALK_LENGTH_S) as number;
    const resolvedSpeed = e1.pathLengthM / (e1.tEnd - e1.tStart);
    const clipSpeed = ((after - before) / dt / WALK_LENGTH_S) * WALK_CYCLE_M;
    expect(clipSpeed).toBeCloseTo(resolvedSpeed, 6);
  });

  test("the sampler uses the override for walk and run and the time-based clock for the rest", () => {
    const set = buildClipWindows("suspect", resolved.events, (clip) => clip in DURATIONS, (event) =>
      statusOf(snapshot.statuses, event),
    );
    const timer = locomotionTimer(resolved.events, cycleOf);
    const sampler = createClipSampler();
    const walk = sampler(set, 2, durationOf, timer).find((sample) => sample.clip === "clip_walk");
    expect(walk?.time).toBeCloseTo(locomotionClipTime(distanceAlongPath(e1, 2), WALK_CYCLE_M, WALK_LENGTH_S), 9);
    const talk = sampler(set, 7, durationOf, timer).find((sample) => sample.clip === "clip_talk");
    expect(talk?.time).toBeCloseTo(2, 9);
  });

  test("non-locomotion windows, unknown strides and unreachable paths fall back to the time-based clock", () => {
    const unreachable = { ...e1, id: "u", reachable: false };
    const timer = locomotionTimer([...resolved.events, unreachable], (clip) => (clip === "clip_walk" ? WALK_CYCLE_M : undefined));
    const base = { start: 0, end: 5, loop: true, anchor: 0, rampIn: [0, 0] as const, rampOut: [5, 5] as const, suppressors: [] };
    expect(timer({ ...base, source: "e4", clip: "clip_talk" }, 6, 5.17)).toBeUndefined();
    expect(timer({ ...base, source: "e10", clip: "clip_run" }, 21, 0.7)).toBeUndefined();
    expect(timer({ ...base, source: "u", clip: "clip_walk" }, 2, WALK_LENGTH_S)).toBeUndefined();
    expect(timer({ ...base, source: "e1", clip: "clip_walk" }, 2, WALK_LENGTH_S)).toBeTypeOf("number");
  });

  test("the stride is measured once from the clip's horizontal hips travel, in meters", () => {
    const track = new VectorKeyframeTrack("mixamorigHips.position", [0, 0.5, 1.033], [0, 101.6, 1.5, 0, 101.6, 90, 0, 101.6, 186.1]);
    expect(measureCycleDistance(track, MIXAMO_UNIT_SCALE)).toBeCloseTo(1.846, 6);
    const inPlace = new VectorKeyframeTrack("mixamorigHips.position", [0, 1], [1.3, 101, 2.8, 1.3, 101, 2.8]);
    expect(measureCycleDistance(inPlace, MIXAMO_UNIT_SCALE)).toBeUndefined();
    expect(measureCycleDistance(undefined, MIXAMO_UNIT_SCALE)).toBeUndefined();
  });
});
