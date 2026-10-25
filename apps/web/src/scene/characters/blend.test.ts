import type { ResolvedEvent, ResolvedGraph } from "@rashomon/engine";
import type { Action, Status } from "@rashomon/schema";
import { robberyResolved } from "@rashomon/schema/fixtures";
import { describe, expect, test } from "vitest";
import { buildClipWindows, clipTime, createClipSampler, envelope, sampleClips, type ClipSample } from "./blend";

const DURATIONS: Readonly<Record<string, number>> = {
  clip_idle: 8.33,
  clip_walk: 1.03,
  clip_run: 0.7,
  clip_crouch_idle: 2.5,
  clip_fall_back: 2.6,
  clip_push: 8.0,
  clip_shoved: 2.73,
  clip_punch: 0.87,
  clip_pick_up: 9.57,
  clip_look_around: 6.33,
  clip_talk: 5.17,
};
const durationOf = (clip: string): number | undefined => DURATIONS[clip];
const hasClip = (clip: string): boolean => clip in DURATIONS;

function event(
  id: string,
  actor: string,
  action: Action,
  tStart: number,
  tEnd: number,
  extra: Partial<ResolvedEvent> = {},
): ResolvedEvent {
  return {
    id,
    witnessId: "w1",
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

function sample(actor: string, events: readonly ResolvedEvent[], t: number): ClipSample[] {
  return sampleClips(buildClipWindows(actor, events, hasClip), t, durationOf);
}

function weightOf(samples: readonly ClipSample[], clip: string): number {
  return samples.find((s) => s.clip === clip)?.weight ?? 0;
}

function timeOf(samples: readonly ClipSample[], clip: string): number | undefined {
  return samples.find((s) => s.clip === clip)?.time;
}

function totalWeight(samples: readonly ClipSample[]): number {
  return samples.reduce((sum, s) => sum + s.weight, 0);
}

describe("clipTime", () => {
  test("loop: (t - tStart) % length", () => {
    expect(clipTime({ start: 2, loop: true }, 4.5, 1)).toBeCloseTo(0.5);
    expect(clipTime({ start: 0, loop: true }, 10.3, 1.03)).toBeCloseTo(10.3 % 1.03);
  });

  test("loop before tStart wraps into the clip instead of going negative", () => {
    expect(clipTime({ start: 2, loop: true }, 1.75, 1)).toBeCloseTo(0.75);
  });

  test("one-shot: min(t - tStart, length), never negative", () => {
    expect(clipTime({ start: 2, loop: false }, 3, 2.6)).toBeCloseTo(1);
    expect(clipTime({ start: 2, loop: false }, 9, 2.6)).toBeCloseTo(2.6);
    expect(clipTime({ start: 2, loop: false }, 1, 2.6)).toBe(0);
  });
});

describe("single actor blending", () => {
  const walkThenTalk = [event("a", "x", "walk", 0, 5), event("b", "x", "speak", 5, 9)];

  test("an event that starts at t = 0 is at full weight from the first frame", () => {
    const at0 = sample("x", walkThenTalk, 0);
    expect(weightOf(at0, "clip_walk")).toBe(1);
    expect(at0).toHaveLength(1);
  });

  test("back-to-back events crossfade over the incoming event's blend-in, centred on the handoff", () => {
    const atBoundary = sample("x", walkThenTalk, 5);
    expect(weightOf(atBoundary, "clip_walk")).toBeCloseTo(0.5);
    expect(weightOf(atBoundary, "clip_talk")).toBeCloseTo(0.5);
    expect(weightOf(sample("x", walkThenTalk, 4.85), "clip_walk")).toBeCloseTo(1);
    expect(weightOf(sample("x", walkThenTalk, 5.15), "clip_talk")).toBeCloseTo(1);
  });

  test("a back-to-back handoff never dips into idle", () => {
    for (let t = 4.8; t <= 5.2; t += 0.01) {
      const samples = sample("x", walkThenTalk, t);
      expect(weightOf(samples, "clip_idle"), `t=${t.toFixed(2)}`).toBe(0);
      expect(totalWeight(samples)).toBeCloseTo(1, 6);
    }
  });

  test("an event followed by a gap blends out over its own blend-out into idle", () => {
    const gap = [event("a", "x", "walk", 0, 5), event("b", "x", "speak", 7, 9)];
    expect(weightOf(sample("x", gap, 5), "clip_walk")).toBeCloseTo(0.5);
    expect(weightOf(sample("x", gap, 5 + 0.125), "clip_walk")).toBe(0);
    expect(weightOf(sample("x", gap, 5 + 0.125), "clip_idle")).toBeCloseTo(1);
  });

  test("overlapping events blend by overlap fraction", () => {
    const overlapping = [event("a", "x", "stand", 0, 11), event("b", "x", "look", 10, 12)];
    for (const [t, lookWeight] of [[10, 0], [10.25, 0.25], [10.5, 0.5], [10.75, 0.75], [11, 1]] as const) {
      const samples = sample("x", overlapping, t);
      expect(weightOf(samples, "clip_look_around"), `t=${t}`).toBeCloseTo(lookWeight);
      expect(weightOf(samples, "clip_idle"), `t=${t}`).toBeCloseTo(1 - lookWeight);
    }
  });

  test("idle fills a gap between events, starting its phase where the previous clip begins to fade", () => {
    const gappy = [event("a", "x", "walk", 0, 4), event("b", "x", "run", 8, 10)];
    const inGap = sample("x", gappy, 6);
    expect(inGap).toHaveLength(1);
    expect(inGap[0]?.clip).toBe("clip_idle");
    expect(inGap[0]?.weight).toBe(1);
    expect(inGap[0]?.time).toBeCloseTo(6 - (4 - 0.25 / 2));
  });

  test("before any event and after the last one the actor idles", () => {
    const later = [event("a", "x", "speak", 3, 4)];
    expect(weightOf(sample("x", later, 1), "clip_idle")).toBe(1);
    expect(weightOf(sample("x", later, 20), "clip_idle")).toBe(1);
  });

  test("fall holds its last frame until the actor's next event", () => {
    const fallThenStand = [event("a", "x", "fall", 2, 4), event("b", "x", "stand", 10, 12)];
    const held = sample("x", fallThenStand, 8);
    expect(weightOf(held, "clip_fall_back")).toBe(1);
    expect(timeOf(held, "clip_fall_back")).toBeCloseTo(2.6);
    const getUp = sample("x", fallThenStand, 10);
    expect(weightOf(getUp, "clip_fall_back")).toBeCloseTo(0.5);
    expect(weightOf(getUp, "clip_idle")).toBeCloseTo(0.5);
  });

  test("fall with nothing after it holds forever", () => {
    const samples = sample("x", [event("a", "x", "fall", 2, 4)], 500);
    expect(samples).toEqual([{ clip: "clip_fall_back", time: 2.6, weight: 1 }]);
  });

  test("a drink longer than its clip holds the last frame inside its own interval and stops at its end", () => {
    const drinkDurations: Readonly<Record<string, number>> = { ...DURATIONS, clip_drink: 8.867 };
    const windows = buildClipWindows("x", [event("a", "x", "drink", 0, 12)], (clip) => clip in drinkDurations);
    const early = sampleClips(windows, 4, (clip) => drinkDurations[clip]);
    expect(early).toEqual([{ clip: "clip_drink", time: 4, weight: 1 }]);
    const late = sampleClips(windows, 11, (clip) => drinkDurations[clip]);
    expect(late).toEqual([{ clip: "clip_drink", time: 8.867, weight: 1 }]);
    const later = buildClipWindows(
      "x",
      [event("a", "x", "drink", 0, 1), event("b", "x", "stand", 20, 22)],
      (clip) => clip in drinkDurations,
    );
    const after = sampleClips(later, 15, (clip) => drinkDurations[clip]);
    expect(after.some((s) => s.clip === "clip_drink")).toBe(false);
  });

  test("three overlapping events render only the latest and report a conflict", () => {
    const three = [event("a", "x", "walk", 0, 10), event("b", "x", "speak", 2, 10), event("c", "x", "look", 4, 10)];
    const set = buildClipWindows("x", three, hasClip);
    expect(set.conflicts).toEqual([["a", "b", "c"]]);
    const samples = sampleClips(set, 5, durationOf);
    expect(samples).toEqual([{ clip: "clip_look_around", time: 1, weight: 1 }]);
  });

  test("two overlapping events are not a conflict", () => {
    const two = [event("a", "x", "stand", 0, 11), event("b", "x", "look", 10, 12)];
    expect(buildClipWindows("x", two, hasClip).conflicts).toEqual([]);
  });
});

describe("nested events (review fix 2)", () => {
  const walkWithLook = [event("walk", "x", "walk", 0, 20), event("look", "x", "look", 5, 8)];

  test("the nested event blends in over its own blend-in", () => {
    expect(weightOf(sample("x", walkWithLook, 5), "clip_look_around")).toBeCloseTo(0.5);
    expect(weightOf(sample("x", walkWithLook, 5), "clip_walk")).toBeCloseTo(0.5);
    expect(weightOf(sample("x", walkWithLook, 6.5), "clip_look_around")).toBe(1);
    expect(weightOf(sample("x", walkWithLook, 6.5), "clip_walk")).toBe(0);
  });

  test("the parent comes back after the nested event over the nested event's blend-out", () => {
    expect(weightOf(sample("x", walkWithLook, 8), "clip_walk")).toBeCloseTo(0.5);
    expect(weightOf(sample("x", walkWithLook, 8), "clip_look_around")).toBeCloseTo(0.5);
    expect(weightOf(sample("x", walkWithLook, 8.15), "clip_walk")).toBeCloseTo(1);
  });

  test("the actor walks, not idles, for the rest of the parent event", () => {
    for (let t = 8.2; t < 19.8; t += 0.5) {
      const samples = sample("x", walkWithLook, t);
      expect(weightOf(samples, "clip_walk"), `t=${t}`).toBe(1);
      expect(weightOf(samples, "clip_idle"), `t=${t}`).toBe(0);
    }
  });

  test("the parent's walk phase is unbroken by the nested event", () => {
    expect(timeOf(sample("x", walkWithLook, 12), "clip_walk")).toBeCloseTo(12 % 1.03);
  });

  test("weights sum to 1 through the whole nested span", () => {
    for (let t = 0; t <= 21; t += 0.05) {
      expect(totalWeight(sample("x", walkWithLook, t)), `t=${t.toFixed(2)}`).toBeCloseTo(1, 6);
    }
  });
});

describe("phase continuity across same-clip events (review fix 3)", () => {
  function maxTimeJump(events: readonly ResolvedEvent[], clip: string, from: number, to: number): number {
    let worst = 0;
    let previous: number | undefined;
    const step = 0.01;
    for (let t = from; t <= to; t += step) {
      const time = timeOf(sample("x", events, t), clip);
      if (time !== undefined && previous !== undefined) {
        const duration = DURATIONS[clip] ?? 1;
        const delta = Math.abs(time - previous);
        worst = Math.max(worst, Math.min(delta, duration - delta));
      }
      previous = time;
    }
    return worst;
  }

  test("walk 0-5 then walk 5-9 keeps one continuous walk phase", () => {
    const twoWalks = [event("a", "x", "walk", 0, 5), event("b", "x", "walk", 5, 9)];
    expect(timeOf(sample("x", twoWalks, 7), "clip_walk")).toBeCloseTo(7 % 1.03);
    expect(maxTimeJump(twoWalks, "clip_walk", 4.5, 5.5)).toBeLessThan(0.02);
  });

  test("stand, gap, stand keeps one continuous idle phase through the gap", () => {
    const standGapStand = [event("a", "x", "stand", 0, 4), event("b", "x", "stand", 6, 9)];
    expect(timeOf(sample("x", standGapStand, 7), "clip_idle")).toBeCloseTo(7);
    expect(maxTimeJump(standGapStand, "clip_idle", 3.5, 6.5)).toBeLessThan(0.02);
  });

  test("a different clip in between restarts the second event's loop at its tStart", () => {
    const standWalkStand = [
      event("a", "x", "stand", 0, 3),
      event("b", "x", "walk", 3, 5),
      event("c", "x", "stand", 5, 9),
    ];
    expect(timeOf(sample("x", standWalkStand, 6), "clip_idle")).toBeCloseTo(1);
  });

  test("idle phase is continuous when an event hands off to the filler and back", () => {
    const walkGapRun = [event("a", "x", "walk", 0, 4), event("b", "x", "stand", 6, 8)];
    expect(maxTimeJump(walkGapRun, "clip_idle", 3.5, 8)).toBeLessThan(0.02);
  });
});

describe("degenerate durations (review fix 4)", () => {
  test.each([
    ["zero", 5, 5],
    ["negative", 6, 5],
  ])("a %s-duration event gets no weight at any t", (_label, tStart, tEnd) => {
    const events = [event("a", "x", "speak", tStart, tEnd)];
    for (let t = 4; t <= 7; t += 0.01) {
      expect(weightOf(sample("x", events, t), "clip_talk"), `t=${t.toFixed(2)}`).toBe(0);
    }
  });

  test("a zero-duration shove does not make its target react", () => {
    const events = [event("s", "a", "shove", 3, 3, { target: "b" })];
    expect(weightOf(sample("b", events, 3.3), "clip_shoved")).toBe(0);
  });
});

describe("createClipSampler scratch reuse (review fix 5)", () => {
  const events = [event("a", "x", "walk", 0, 5), event("b", "x", "speak", 5, 9), event("c", "x", "fall", 9, 10)];
  const set = buildClipWindows("x", events, hasClip);
  const snapshot = (samples: readonly ClipSample[]) => samples.map(({ clip, time, weight }) => ({ clip, time, weight }));

  test("same t gives the same output regardless of what was sampled before", () => {
    const sampler = createClipSampler();
    const fresh = snapshot(sampleClips(set, 5, durationOf));

    sampler(set, 12, durationOf);
    sampler(set, 0.3, durationOf);

    expect(snapshot(sampler(set, 5, durationOf))).toEqual(fresh);
  });

  test("reuses its result array and sample objects between calls", () => {
    const sampler = createClipSampler();

    const first = sampler(set, 5, durationOf);
    const firstSlot = first[0];
    const second = sampler(set, 5.05, durationOf);

    expect(second).toBe(first);
    expect(second[0]).toBe(firstSlot);
  });

  test("matches the allocating sampleClips across the whole timeline", () => {
    const sampler = createClipSampler();
    for (let t = 0; t <= 12; t += 0.1) {
      expect(snapshot(sampler(set, t, durationOf)), `t=${t.toFixed(1)}`).toEqual(sampleClips(set, t, durationOf));
    }
  });
});

describe("status gating", () => {
  test.each<Status>(["superseded", "implausible"])("%s events never play a clip", (status) => {
    const events = [event("a", "x", "walk", 0, 5, { status })];
    expect(sample("x", events, 2)).toEqual([{ clip: "clip_idle", time: 2, weight: 1 }]);
  });

  test.each<Status>(["proposed", "plausible", "overridden"])("%s events play", (status) => {
    const events = [event("a", "x", "walk", 0, 5, { status })];
    expect(weightOf(sample("x", events, 2), "clip_walk")).toBe(1);
  });

  test("an implausible shove does not make its target react", () => {
    const events = [event("s", "a", "shove", 2, 3, { target: "b", status: "implausible" })];
    expect(weightOf(sample("b", events, 2.8), "clip_shoved")).toBe(0);
  });
});

describe("status map gating", () => {
  test("an event the status map marks implausible plays no clip even if its own status is proposed", () => {
    const events = [event("e5", "x", "look", 0, 5, { status: "proposed" })];
    const set = buildClipWindows("x", events, hasClip, (e) => (e.id === "e5" ? "implausible" : e.status));
    expect(sampleClips(set, 2, durationOf).map((s) => s.clip)).toEqual(["clip_idle"]);
  });
});

describe("shove reaction", () => {
  const events = [
    event("stand", "clerk", "stand", 0, 13),
    event("shove", "suspect", "shove", 12, 13, { target: "clerk" }),
    event("fall", "clerk", "fall", 13, 15),
  ];

  test("the target plays clip_shoved starting 0.3 s after the shove", () => {
    expect(weightOf(sample("clerk", events, 12.3), "clip_shoved")).toBe(0);
    const reacting = sample("clerk", events, 12.65);
    expect(weightOf(reacting, "clip_shoved")).toBeCloseTo(0.5);
    expect(timeOf(reacting, "clip_shoved")).toBeCloseTo(0.35);
  });

  test("the shover's own clip is push, not shoved", () => {
    const shover = sample("suspect", events, 12.5);
    expect(weightOf(shover, "clip_push")).toBeGreaterThan(0);
    expect(weightOf(shover, "clip_shoved")).toBe(0);
  });
});

describe("envelope", () => {
  test("stays within [0, 1] and is 0 outside the window's ramps", () => {
    const { windows } = buildClipWindows("x", [event("a", "x", "speak", 3, 4)], hasClip);
    const window = windows[0];
    if (!window) throw new Error("no window");
    expect(envelope(window, 2)).toBe(0);
    expect(envelope(window, 3.5)).toBe(1);
    expect(envelope(window, 6)).toBe(0);
  });
});

const resolved = robberyResolved as unknown as ResolvedGraph;

describe("robbery.resolved.json, witness and suspect", () => {
  const events = resolved.events;
  const witness = (t: number) => sample("witness", events, t);
  const suspect = (t: number) => sample("suspect", events, t);

  test("fixture has the witness stand 0-11 and suspect walk 0-5 the test is built on", () => {
    expect(events.find((e) => e.actor === "witness" && e.action === "stand")).toMatchObject({ tStart: 0, tEnd: 11 });
    expect(events.find((e) => e.actor === "suspect" && e.action === "walk")).toMatchObject({ tStart: 0, tEnd: 5 });
  });

  test("at t = 2.5 the suspect walks and the witness stands", () => {
    expect(suspect(2.5)).toEqual([{ clip: "clip_walk", time: 2.5 % 1.03, weight: 1 }]);
    expect(witness(2.5)).toEqual([{ clip: "clip_idle", time: 2.5, weight: 1 }]);
  });

  test("at t = 5 the suspect is halfway from walk into talk", () => {
    const samples = suspect(5);
    expect(weightOf(samples, "clip_walk")).toBeCloseTo(0.5);
    expect(weightOf(samples, "clip_talk")).toBeCloseTo(0.5);
  });

  test("at t = 10.5 the witness is halfway through the stand/look overlap", () => {
    const samples = witness(10.5);
    expect(weightOf(samples, "clip_idle")).toBeCloseTo(0.5);
    expect(weightOf(samples, "clip_look_around")).toBeCloseTo(0.5);
  });

  test("the suspect runs at t = 21 and the witness crouches", () => {
    expect(weightOf(suspect(21), "clip_run")).toBe(1);
    expect(weightOf(witness(21), "clip_crouch_idle")).toBe(1);
  });

  test("the clerk is held down after the fall", () => {
    const samples = sample("clerk", events, 20);
    expect(samples).toEqual([{ clip: "clip_fall_back", time: 2.6, weight: 1 }]);
  });

  test("weights sum to 1 for every actor across the whole timeline", () => {
    for (const actor of resolved.actors) {
      for (let t = 0; t <= resolved.durationS; t += 0.05) {
        const samples = sample(actor.id, events, t);
        expect(totalWeight(samples), `${actor.id} at t=${t.toFixed(2)}`).toBeCloseTo(1, 6);
        for (const s of samples) {
          expect(s.weight).toBeGreaterThan(0);
          expect(s.time).toBeGreaterThanOrEqual(0);
          expect(s.time).toBeLessThanOrEqual(DURATIONS[s.clip] ?? 0);
        }
      }
    }
  });

  test("scrubbing backward gives the same pose as arriving fresh", () => {
    const forward = [0, 3, 7, 12.5, 14, 21].map((t) => [witness(t), suspect(t)]);
    const scrubbedBack = [21, 14, 12.5, 7, 3, 0].map((t) => [witness(t), suspect(t)]).reverse();
    expect(scrubbedBack).toEqual(forward);
  });

  test("no actor in the fixture has three overlapping events", () => {
    for (const actor of resolved.actors) {
      expect(buildClipWindows(actor.id, events, hasClip).conflicts, actor.id).toEqual([]);
    }
  });
});

describe("styles and new actions in the clip windows", () => {
  test("a styled walk plays the style's clip when it is loaded and the plain clip when it is not", () => {
    const sneak = [event("s1", "a", "walk", 0, 4, { style: "sneak" })];
    const withSneak = buildClipWindows("a", sneak, (clip) => clip === "clip_sneak" || hasClip(clip));
    expect(withSneak.windows.map((w) => w.clip)).toEqual(["clip_sneak"]);
    expect(buildClipWindows("a", sneak, hasClip).windows.map((w) => w.clip)).toEqual(["clip_walk"]);
  });

  test("a new action with its file missing plays its fallback clip", () => {
    const events = [event("k1", "a", "kneel", 0, 2), event("p1", "a", "phone", 3, 7)];
    expect(buildClipWindows("a", events, hasClip).windows.map((w) => w.clip)).toEqual(["clip_crouch_idle", "clip_talk"]);
  });
});
