import type { SceneManifest } from "@rashomon/schema";
import { storeScene } from "@rashomon/schema/fixtures";
import { describe, expect, test } from "vitest";
import type { SceneGeom } from "../types";
import { missingTimeFlags, unanchoredFlags } from "./completeness";
import { contradictionFlags } from "./contradiction";
import { gate } from "./index";
import { boxMesh } from "./occluders";
import { reachabilityFlags } from "./reachability";
import { sightlineFlags } from "./sightline";
import { ev, floorPlanGeom, graphOf } from "./testHelpers";
import { timeDistanceFlags } from "./timeDistance";

const lmk = (
  id: string,
  min: [number, number],
  max: [number, number],
  occludes = true,
  height = 1,
) => ({
  id,
  label: `the ${id}`,
  aliases: [],
  position: [(min[0] + max[0]) / 2, 0, (min[1] + max[1]) / 2] as [number, number, number],
  bounds: {
    min: [min[0], 0, min[1]] as [number, number, number],
    max: [max[0], height, max[1]] as [number, number, number],
  },
  kind: "furniture" as const,
  occludes,
});

const manifest = (extra: ReturnType<typeof lmk>[] = []): SceneManifest => ({
  sceneId: "t",
  meshUrl: "",
  up: "y",
  unitsPerMeter: 1,
  eyeHeight: 1.6,
  landmarks: [lmk("block", [0, 4.5], [7, 5.5]), lmk("zone", [0, 0], [1, 1], false), ...extra],
});

const empty: SceneGeom = { meshes: [] };

describe("sightline", () => {
  const look = (target = "b", at: [number, number, number] = [1, 0, 5]) =>
    ev({ id: "l", actor: "a", action: "look", target, at, tStart: 0, tEnd: 2 });
  const seen = (at: [number, number, number]) => ev({ id: "s", actor: "b", at, tStart: 0, tEnd: 2 });
  const wall: SceneGeom = { meshes: [boxMesh("wall", [4, 0, 0], [5, 2, 10])] };

  test("a look blocked on both rays is a hard flag naming the blocker with evidence and a question", () => {
    const g = graphOf([look(), seen([8, 0, 5])]);
    const f = sightlineFlags(g, manifest(), wall);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ check: "sightline", severity: "hard", eventId: "l" });
    expect(f[0]!.detail).toContain("wall");
    expect(f[0]!.detail).toMatch(/\d+\.\d m/);
    expect(f[0]!.evidence).toMatchObject({ blocker: "wall" });
    expect(f[0]!.suggestedQuestion).toContain("would be between you and the b");
  });

  test("only the chest ray blocked is no flag", () => {
    const rail: SceneGeom = { meshes: [boxMesh("rail", [7, 0, 0], [7.5, 1.4, 10])] };
    const g = graphOf([look(), seen([8, 0, 5])]);
    expect(sightlineFlags(g, manifest(), rail)).toEqual([]);
  });

  test("both rays blocked by an occludes landmark with no geom mesh is a hard flag", () => {
    const m = manifest([lmk("tall_unit", [4, 0], [5, 10], true, 2)]);
    const g = graphOf([look(), seen([8, 0, 5])]);
    const f = sightlineFlags(g, m, empty);
    expect(f).toHaveLength(1);
    expect(f[0]!.evidence).toMatchObject({ blocker: "tall_unit" });
    expect(f[0]!.suggestedQuestion).toContain("the tall_unit would be between you");
  });

  test("a landmark the looker or target stands inside does not block", () => {
    const m = manifest([lmk("tall_unit", [0, 0], [9, 10], true, 2)]);
    expect(sightlineFlags(graphOf([look(), seen([8, 0, 5])]), m, empty)).toEqual([]);
  });

  test("a landmark with a geom mesh of the same id is counted once", () => {
    const m = manifest([lmk("wall", [4, 0], [5, 10], true, 2)]);
    const f = sightlineFlags(graphOf([look(), seen([8, 0, 5])]), m, wall);
    expect(f).toHaveLength(1);
  });

  test("a looker whose only known position is later gets no sightline flag and stays proposed", () => {
    const g = graphOf([
      ev({ id: "l", actor: "a", action: "look", target: "b", tStart: 0, tEnd: 2 }),
      ev({ id: "later", actor: "a", at: [1, 0, 5], tStart: 5, tEnd: 6 }),
      seen([8, 0, 5]),
    ]);
    expect(sightlineFlags(g, manifest(), wall)).toEqual([]);
    const out = gate(g, manifest(), wall);
    expect(out.statuses.l).toBe("proposed");
    expect(out.flags.map((f) => f.check)).toEqual(["unanchored"]);
  });

  test("a target whose only known position is later gets no sightline flag", () => {
    const g = graphOf([look(), ev({ id: "s", actor: "b", at: [8, 0, 5], tStart: 5, tEnd: 6 })]);
    expect(sightlineFlags(g, manifest(), wall)).toEqual([]);
  });

  test("an earlier event's end is used only when nothing sits between it and the look", () => {
    const withEarlier = graphOf([
      ev({ id: "early", actor: "b", at: [8, 0, 5], tStart: 0, tEnd: 0.5 }),
      ev({ id: "l", actor: "a", action: "look", target: "b", at: [1, 0, 5], tStart: 1, tEnd: 2 }),
    ]);
    expect(sightlineFlags(withEarlier, manifest(), wall)).toHaveLength(1);
    const withGap = graphOf([
      ev({ id: "early", actor: "b", at: [8, 0, 5], tStart: 0, tEnd: 0.5 }),
      ev({ id: "unknown", actor: "b", tStart: 0.6, tEnd: 0.8 }),
      ev({ id: "l", actor: "a", action: "look", target: "b", at: [1, 0, 5], tStart: 1, tEnd: 2 }),
    ]);
    expect(sightlineFlags(withGap, manifest(), wall)).toEqual([]);
  });

  test("a look during a walk uses the walker's position on the path, not the position the look inherited", () => {
    const aisle: [number, number, number] = [1.5, 0, 3.5];
    const window: [number, number, number] = [4.5, 0, 1];
    const counter: [number, number, number] = [7.2, 0, 2.5];
    const walk = ev({
      id: "walk",
      actor: "w",
      action: "walk",
      from: aisle,
      to: window,
      path: [aisle, window],
      pathLengthM: 3.9,
      tStart: 0,
      tEnd: 6,
    });
    const inherited = ev({
      id: "look",
      actor: "w",
      action: "look",
      target: "c",
      at: aisle,
      tStart: 5.5,
      tEnd: 6,
    });
    const clerk = ev({ id: "clerk", actor: "c", at: counter, tStart: 0, tEnd: 6 });
    const geom = floorPlanGeom();
    const moving = graphOf([walk, inherited, clerk], ["w", "c"]);
    expect(sightlineFlags(moving, storeScene, geom)).toEqual([]);
    const out = gate(moving, storeScene, geom);
    expect(out.statuses.look).not.toBe("implausible");
    expect(out.flags.some((f) => f.check === "sightline")).toBe(false);
    const standing = graphOf([inherited, clerk], ["w", "c"]);
    const flags = sightlineFlags(standing, storeScene, geom);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.evidence).toMatchObject({ blocker: "shelf_a" });
  });

  test("a moving target is also taken from its path, and a walk with no path leaves the position unknown", () => {
    const geom: SceneGeom = { meshes: [boxMesh("wall", [4, 0, 0], [5, 2, 10])] };
    const looker = ev({ id: "l", actor: "a", action: "look", target: "b", at: [1, 0, 5], tStart: 4, tEnd: 6 });
    const crossing = ev({
      id: "w",
      actor: "b",
      action: "walk",
      from: [8, 0, 5],
      to: [2, 0, 5],
      path: [[8, 0, 5], [2, 0, 5]],
      pathLengthM: 6,
      tStart: 0,
      tEnd: 10,
    });
    expect(sightlineFlags(graphOf([looker, crossing]), manifest(), geom)).toHaveLength(1);
    const toOnly = ev({ ...crossing, from: undefined, path: [[2, 0, 5]], pathLengthM: 0 });
    const still = ev({ id: "s", actor: "b", at: [8, 0, 5], tStart: 0, tEnd: 10 });
    expect(sightlineFlags(graphOf([looker, toOnly, still]), manifest(), geom)).toEqual([]);
  });

  test("a clear look and non-actor targets give no flag", () => {
    expect(sightlineFlags(graphOf([look(), seen([4, 0, 12])]), manifest(), wall)).toEqual([]);
    expect(sightlineFlags(graphOf([look("shelf_x")]), manifest(), wall)).toEqual([]);
  });

  test("the target is taken at the look's time from its moving path", () => {
    const g = graphOf([
      look(),
      ev({
        id: "w",
        actor: "b",
        action: "walk",
        tStart: 0,
        tEnd: 2,
        from: [3, 0, 5],
        to: [9, 0, 5],
        path: [[3, 0, 5], [9, 0, 5]],
        pathLengthM: 6,
      }),
    ]);
    expect(sightlineFlags(g, manifest(), wall)).toHaveLength(1);
  });
});

describe("reachability", () => {
  const walk = (reachable: boolean, action: "walk" | "run" | "stand" = "walk") =>
    graphOf([
      ev({ id: "m", action, from: [2, 0, 2], to: [2, 0, 8], path: [], pathLengthM: 0, reachable }),
    ]);

  test("a walk the resolver marked unreachable is a hard flag naming what is in the way", () => {
    const f = reachabilityFlags(walk(false), manifest());
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ check: "reachability", severity: "hard", eventId: "m" });
    expect(f[0]!.evidence).toMatchObject({ distanceM: 6, blocker: "the block" });
    expect(f[0]!.detail).toContain("6.0 m");
    expect(f[0]!.suggestedQuestion).toContain("runs through the the block");
  });

  test("runs count too; reachable walks and non-movement events never do", () => {
    expect(reachabilityFlags(walk(false, "run"), manifest())).toHaveLength(1);
    expect(reachabilityFlags(walk(true), manifest())).toEqual([]);
    expect(reachabilityFlags(walk(false, "stand"), manifest())).toEqual([]);
  });

  test("an unreachable walk missing an endpoint is skipped, not flagged hard", () => {
    const noEnd = graphOf([ev({ id: "m", action: "walk", from: [2, 0, 2], reachable: false })]);
    const noStart = graphOf([ev({ id: "m", action: "run", to: [2, 0, 8], reachable: false })]);
    const neither = graphOf([ev({ id: "m", action: "walk", reachable: false })]);
    for (const g of [noEnd, noStart, neither]) expect(reachabilityFlags(g, manifest())).toEqual([]);
    expect(gate(neither, manifest(), empty).statuses.m).toBe("proposed");
  });
});

describe("time_distance", () => {
  const walk = (id: string, len: number, t0: number, t1: number, action: "walk" | "run" = "walk") =>
    ev({
      id,
      action,
      tStart: t0,
      tEnd: t1,
      from: [0, 0, 0],
      to: [len, 0, 0],
      path: [[0, 0, 0], [len, 0, 0]],
      pathLengthM: len,
    });

  test("walk over 2 m/s, run over 6 m/s and anything over 8 m/s are all hard", () => {
    const f = timeDistanceFlags(
      graphOf(
        [
          walk("ok", 10, 0, 10),
          walk("w", 30, 0, 10),
          walk("r_ok", 50, 0, 10, "run"),
          walk("r", 70, 0, 10, "run"),
          walk("h", 90, 0, 10),
        ].map((e, i) => ({ ...e, actor: `x${i}` })),
      ),
    );
    const by = Object.fromEntries(f.map((x) => [x.eventId, x.severity]));
    expect(by).toEqual({ w: "hard", r: "hard", h: "hard" });
    const w = f.find((x) => x.eventId === "w")!;
    expect(w.detail).toContain("3.0 m/s");
    expect(w.evidence).toMatchObject({ distanceM: 30, durationS: 10, speedMS: 3, limitMS: 2 });
    expect(w.suggestedQuestion).toContain("30.0 m in 10.0 s");
  });

  test("a jump between consecutive events is checked against the gap", () => {
    const g = graphOf([
      ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 1 }),
      ev({ id: "q", at: [20, 0, 0], tStart: 2, tEnd: 3 }),
    ]);
    const f = timeDistanceFlags(g);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "hard", eventId: "q" });
    expect(f[0]!.evidence).toMatchObject({ previousEventId: "p", distanceM: 20, durationS: 1 });
    expect(f[0]!.detail).toContain("20.0 m between p and q in 1.0 s");
  });

  test("an unpositioned event between two positioned ones does not hide the jump", () => {
    const g = graphOf([
      ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 1 }),
      ev({ id: "gap", tStart: 1.1, tEnd: 1.2 }),
      ev({ id: "q", at: [7, 0, 0], tStart: 1.5, tEnd: 2.5 }),
    ]);
    const f = timeDistanceFlags(g);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ eventId: "q", severity: "hard" });
    expect(f[0]!.evidence).toMatchObject({ previousEventId: "p", speedMS: 14 });
  });

  test("a short event overlapping a longer one does not hide the jump after it", () => {
    const g = graphOf([
      walk("long", 10, 0, 10),
      ev({ id: "short", at: [0.5, 0, 0], tStart: 0.5, tEnd: 0.6 }),
      ev({ id: "back", at: [0, 0, 0], tStart: 10, tEnd: 11 }),
    ]);
    const f = timeDistanceFlags(g);
    expect(f.map((x) => x.eventId)).toEqual(["back"]);
    expect(f[0]!.evidence).toMatchObject({ previousEventId: "long", distanceM: 10 });
  });

  test("a walk that knows only where it ends invents no start and no jump", () => {
    const g = graphOf([
      ev({ id: "stand", at: [0, 0, 0], tStart: 0, tEnd: 1 }),
      ev({
        id: "toOnly",
        action: "walk",
        to: [4, 0, 0],
        path: [[4, 0, 0]],
        pathLengthM: 0,
        tStart: 1,
        tEnd: 5,
      }),
    ]);
    expect(timeDistanceFlags(g)).toEqual([]);
    const reversed = graphOf([...g.events].reverse());
    expect(timeDistanceFlags(reversed)).toEqual([]);
  });

  test("the end of an unreachable walk is unknown, so no jump is measured from it", () => {
    const g = graphOf([
      ev({ id: "stand", at: [0, 0, 0], tStart: 0, tEnd: 1 }),
      ev({ id: "blocked", action: "walk", from: [0, 0, 0], to: [30, 0, 0], reachable: false, tStart: 1, tEnd: 2 }),
      ev({ id: "after", at: [0, 0, 1], tStart: 2.5, tEnd: 3 }),
    ]);
    expect(timeDistanceFlags(g)).toEqual([]);
  });

  test("a gap is held to the 8 m/s limit, not to the next event's own walk limit", () => {
    const walkFrom = (x: number, tStart: number) =>
      ev({
        id: "w",
        action: "walk",
        from: [x, 0, 0],
        to: [x, 0, 1],
        path: [[x, 0, 0], [x, 0, 1]],
        pathLengthM: 1,
        tStart,
        tEnd: tStart + 5,
      });
    const near = graphOf([ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 1 }), walkFrom(4, 2)]);
    expect(timeDistanceFlags(near)).toEqual([]);
    const far = timeDistanceFlags(graphOf([ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 1 }), walkFrom(10, 2)]));
    expect(far).toHaveLength(1);
    expect(far[0]).toMatchObject({ eventId: "w", severity: "hard" });
    expect(far[0]!.evidence).toMatchObject({ distanceM: 10, durationS: 1, speedMS: 10, limitMS: 8 });
  });

  test("overlapping events are not compared with each other", () => {
    const g = graphOf([
      ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 5 }),
      ev({ id: "q", at: [20, 0, 0], tStart: 2, tEnd: 3 }),
    ]);
    expect(timeDistanceFlags(g)).toEqual([]);
  });
});

describe("contradiction", () => {
  const pair = (sa: string[], sb: string[]) =>
    graphOf([
      ev({ id: "p", at: [0.5, 0, 0.5], tStart: 0, tEnd: 10, sources: sa }),
      ev({ id: "q", at: [5, 0, 8], tStart: 5, tEnd: 12, sources: sb }),
    ]);

  test("one soft flag per event, each pointing at the other", () => {
    const f = contradictionFlags(pair(["s1"], ["s2"]), manifest());
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ check: "contradiction", severity: "soft", eventId: "p", conflictsWith: ["q"] });
    expect(f[1]).toMatchObject({ eventId: "q", conflictsWith: ["p"] });
    expect(f[0]!.detail).toMatch(/\d+\.\d m apart/);
    expect(f[0]!.suggestedQuestion).toMatch(/^Earlier you said a was by the .* around then; now the .*\. Which came first\?$/);
    expect(f[0]!.evidence).toMatchObject({ distanceM: expect.any(Number) });
  });

  test("events sharing any source, even a non-first one, are the same segment", () => {
    expect(contradictionFlags(pair(["s1", "s2"], ["s3", "s2"]), manifest())).toEqual([]);
    expect(contradictionFlags(pair(["s1", "s2"], ["s3", "s4"]), manifest())).toHaveLength(2);
  });

  test("two editor placements sharing an investigator source are still checked against each other", () => {
    const f = contradictionFlags(pair(["investigator:u1"], ["investigator:u1"]), manifest());
    expect(f.map((x) => x.eventId)).toEqual(["p", "q"]);
    expect(f[0]).toMatchObject({ conflictsWith: ["q"] });
    expect(contradictionFlags(pair(["investigator:u1", "utt_1"], ["investigator:u1", "utt_1"]), manifest())).toEqual([]);
  });

  test("no flag when apart in time, close together, or different actors", () => {
    const base = ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 5 });
    expect(contradictionFlags(graphOf([base, ev({ id: "q", at: [9, 0, 9], tStart: 5, tEnd: 6 })]), manifest())).toEqual([]);
    expect(contradictionFlags(graphOf([base, ev({ id: "q", at: [1, 0, 1], tStart: 1, tEnd: 6 })]), manifest())).toEqual([]);
    expect(contradictionFlags(graphOf([base, ev({ id: "q", actor: "b", at: [9, 0, 9], tStart: 1, tEnd: 6 })]), manifest())).toEqual([]);
  });
});

describe("unanchored and missing_time", () => {
  const g = graphOf([
    ev({ id: "u" }),
    ev({ id: "m", at: [1, 0, 1], tInferred: true, tStart: 3, tEnd: 5 }),
    ev({ id: "ok", at: [1, 0, 1] }),
  ]);

  test("soft flags with questions, and status stays proposed", () => {
    const un = unanchoredFlags(g, manifest());
    expect(un.map((f) => f.eventId)).toEqual(["u"]);
    expect(un[0]!.suggestedQuestion).toMatch(/^Where in the room was that\?/);
    const mt = missingTimeFlags(g);
    expect(mt.map((f) => f.eventId)).toEqual(["m"]);
    expect(mt[0]!.detail).toContain("2.0 s");
    expect(mt[0]!.suggestedQuestion).toMatch(/^Was that before or after the stand by a\?$/);
    const out = gate(g, manifest(), empty);
    expect(out.statuses).toEqual({ u: "proposed", m: "proposed", ok: "plausible" });
    expect(out.flags.every((f) => f.severity === "soft")).toBe(true);
  });

  test("the missing_time question never names a superseded event", () => {
    const withOld = graphOf([
      ev({ id: "old", action: "fall", at: [1, 0, 1], status: "superseded" }),
      ev({ id: "m", action: "shove", at: [1, 0, 1], tInferred: true, tStart: 3, tEnd: 4 }),
    ]);
    const [flag] = missingTimeFlags(withOld);
    expect(flag!.suggestedQuestion).toBe("When did that happen?");
    const withLive = graphOf([
      ev({ id: "old", action: "fall", at: [1, 0, 1], status: "superseded" }),
      ev({ id: "live", action: "stand", at: [1, 0, 1] }),
      ev({ id: "m", action: "shove", at: [1, 0, 1], tInferred: true, tStart: 3, tEnd: 4 }),
    ]);
    expect(missingTimeFlags(withLive)[0]!.suggestedQuestion).toBe("Was that before or after the stand by a?");
  });

  test("an unanchored event's question names the two landmarks nearest the actor's last known position", () => {
    const later = graphOf([
      ev({ id: "earlier", at: [0.5, 0, 0.5], tStart: 0, tEnd: 1 }),
      ev({ id: "u", tStart: 2, tEnd: 3 }),
    ]);
    const [flag] = unanchoredFlags(later, manifest());
    expect(flag!.suggestedQuestion).toBe("Where in the room was that? Closer to the the zone or the the block?");
    const first = graphOf([ev({ id: "u", tStart: 0, tEnd: 1 })]);
    expect(unanchoredFlags(first, manifest())[0]!.suggestedQuestion).toBe("Where in the room was that?");
    const overlapping = graphOf([
      ev({ id: "overlaps", at: [0.5, 0, 0.5], tStart: 0, tEnd: 5 }),
      ev({ id: "u", tStart: 2, tEnd: 3 }),
    ]);
    expect(unanchoredFlags(overlapping, manifest())[0]!.suggestedQuestion).toBe("Where in the room was that?");
  });

  test("a movement with one anchor is unanchored", () => {
    const one = graphOf([ev({ id: "w", action: "walk", from: [1, 0, 1], path: [[1, 0, 1]] })]);
    expect(unanchoredFlags(one, manifest())[0]!.detail).toContain("1 of its 2");
  });
});

describe("gate", () => {
  const wall: SceneGeom = { meshes: [boxMesh("wall", [4, 0, 0], [5, 2, 10])] };
  const blockedLook = [
    ev({ id: "l", actor: "a", action: "look", target: "b", at: [1, 0, 5], tStart: 0, tEnd: 2 }),
    ev({ id: "s", actor: "b", at: [8, 0, 5], tStart: 0, tEnd: 2 }),
  ];

  test("flags carry the schema fields and a hard flag makes the event implausible", () => {
    const out = gate(graphOf(blockedLook), manifest(), wall);
    expect(out.statuses).toEqual({ l: "implausible", s: "plausible" });
    expect(out.flags).toHaveLength(1);
    expect(out.flags[0]).toMatchObject({ id: "sightline:l", eventId: "l", check: "sightline", severity: "hard" });
    expect(out.flags[0]!.suggestedQuestion.length).toBeGreaterThan(0);
  });

  test("ids get :2, :3 when a check flags the same event more than once", () => {
    const g = graphOf([
      ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 1 }),
      ev({ id: "q", at: [20, 0, 0], tStart: 2, tEnd: 3 }),
      ev({ id: "r", at: [60, 0, 0], tStart: 4, tEnd: 5 }),
    ]);
    const q = gate(g, manifest(), empty).flags.filter((f) => f.eventId === "q").map((f) => f.id);
    expect(q).toEqual(["time_distance:q"]);
    const twice = graphOf([
      ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 1 }),
      ev({
        id: "q",
        action: "walk",
        from: [20, 0, 0],
        to: [100, 0, 0],
        path: [[20, 0, 0], [100, 0, 0]],
        pathLengthM: 80,
        tStart: 2,
        tEnd: 3,
      }),
    ]);
    const ids = gate(twice, manifest(), empty).flags.map((f) => f.id);
    expect(ids).toEqual(["time_distance:q", "time_distance:q:2"]);
  });

  test("soft-only keeps plausible with the flags attached", () => {
    const g = graphOf([
      ev({ id: "p", at: [0.5, 0, 0.5], tStart: 0, tEnd: 10, sources: ["s1"] }),
      ev({ id: "q", at: [5, 0, 8], tStart: 5, tEnd: 12, sources: ["s2"] }),
    ]);
    const out = gate(g, manifest(), empty);
    expect(out.statuses).toEqual({ p: "plausible", q: "plausible" });
    expect(out.flags).toHaveLength(2);
  });

  test("overridden keeps its status with the flag reported; superseded events are ignored", () => {
    const g = graphOf(blockedLook.map((e) => (e.id === "l" ? { ...e, status: "overridden" as const } : e)));
    const out = gate(g, manifest(), wall);
    expect(out.statuses).toEqual({ l: "overridden", s: "plausible" });
    expect(out.flags.some((f) => f.check === "sightline")).toBe(true);
    const sup = graphOf(blockedLook.map((e) => ({ ...e, status: "superseded" as const })));
    const o2 = gate(sup, manifest(), wall);
    expect(o2.statuses).toEqual({ l: "superseded", s: "superseded" });
    expect(o2.flags).toEqual([]);
  });

  test("hard beats proposed; inputs are not mutated; output is deterministic", () => {
    const g = graphOf(blockedLook.map((e) => (e.id === "l" ? { ...e, tInferred: true } : e)));
    const before = JSON.stringify([g, wall]);
    const out = gate(g, manifest(), wall);
    expect(out.statuses.l).toBe("implausible");
    expect(JSON.stringify([g, wall])).toBe(before);
    expect(gate(g, manifest(), wall)).toEqual(out);
  });

  test("flags come out in rule order", () => {
    const g = graphOf([
      ...blockedLook,
      ev({ id: "m", actor: "b", at: [8, 0, 5], tInferred: true, tStart: 5, tEnd: 6 }),
      ev({ id: "u", actor: "b", tStart: 7, tEnd: 8 }),
    ]);
    const kinds = gate(g, manifest(), wall).flags.map((f) => f.check);
    expect(kinds).toEqual(["sightline", "unanchored", "missing_time"]);
  });
});
