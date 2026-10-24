import type { Portals, SceneManifest } from "@rashomon/schema";
import { describe, expect, test } from "vitest";
import { gate } from "./index";
import { contradictionFlags } from "./contradiction";
import { missingTimeFlags, unanchoredFlags } from "./completeness";
import { hasRoute, reachabilityFlags } from "./reachability";
import { sightlineFlags } from "./sightline";
import { timeDistanceFlags } from "./timeDistance";
import { boxMesh, ev, graphOf } from "./testHelpers";
import type { SceneGeom } from "../types";

const lmk = (id: string, min: [number, number], max: [number, number], occludes = true) => ({
  id,
  label: id,
  aliases: [],
  position: [(min[0] + max[0]) / 2, 0, (min[1] + max[1]) / 2] as [number, number, number],
  bounds: { min: [min[0], 0, min[1]] as [number, number, number], max: [max[0], 1, max[1]] as [number, number, number] },
  kind: "furniture" as const,
  occludes,
});

// 10 x 10 room with a wall-like block across the middle that has a gap at the east end.
const portals: Portals = {
  waypoints: [
    { id: "south", x: 2, z: 2 },
    { id: "gap_s", x: 8, z: 3.5 },
    { id: "gap_n", x: 8, z: 6.5 },
    { id: "north", x: 2, z: 8 },
  ],
  edges: [
    ["south", "gap_s"],
    ["gap_s", "gap_n"],
    ["gap_n", "north"],
  ],
};
const manifest = (p?: Portals): SceneManifest =>
  ({
    sceneId: "t",
    meshUrl: "",
    up: "y",
    unitsPerMeter: 1,
    eyeHeight: 1.6,
    landmarks: [lmk("block", [0, 4.5], [7, 5.5]), lmk("zone", [0, 0], [1, 1], false)],
    ...(p ? { portals: p } : {}),
  }) as SceneManifest;

describe("sightline", () => {
  const geom: SceneGeom = { meshes: [boxMesh("wall", [4, 0, 0], [5, 2, 10])] };
  const look = (target: string) =>
    ev({ id: "l", actor: "a", action: "look", target, at: [1, 0, 5], tStart: 0, tEnd: 2 });

  test("blocked look is a hard flag naming the mesh and carrying numbers", () => {
    const g = graphOf([look("b"), ev({ id: "s", actor: "b", at: [8, 0, 5], tStart: 0, tEnd: 2 })]);
    const f = sightlineFlags(g, geom);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "sightline", severity: "hard", eventIds: ["l"] });
    expect(f[0]!.message).toContain("wall");
    expect(f[0]!.message).toMatch(/\d+\.\d m/);
  });

  test("clear look, taller target line and non-actor targets give no flag", () => {
    const clear = graphOf([look("b"), ev({ id: "s", actor: "b", at: [4, 0, 12], tStart: 0, tEnd: 2 })]);
    expect(sightlineFlags(clear, geom)).toEqual([]);
    const lm = graphOf([look("shelf_x")]);
    expect(sightlineFlags(lm, geom)).toEqual([]);
  });

  test("uses eye 1.6 and chest 1.2: a 1.4 m wall blocks nothing above the line", () => {
    const low: SceneGeom = { meshes: [boxMesh("rail", [4, 0, 0], [5, 1.1, 10])] };
    const g = graphOf([look("b"), ev({ id: "s", actor: "b", at: [8, 0, 5], tStart: 0, tEnd: 2 })]);
    expect(sightlineFlags(g, low)).toEqual([]);
  });

  test("target position is taken at the look's time, from the target's moving path", () => {
    const g = graphOf([
      look("b"),
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
    // at t = 1 b is at x = 6, behind the wall at x 4-5
    expect(sightlineFlags(g, geom)).toHaveLength(1);
  });
});

describe("reachability", () => {
  const move = (from: [number, number, number], to: [number, number, number]) =>
    graphOf([ev({ id: "m", action: "walk", from, to, path: [from, to], pathLengthM: 5 })]);

  test("route through the gap exists, straight line is blocked", () => {
    const m = manifest(portals);
    const g = move([2, 0, 2], [2, 0, 8]);
    expect(reachabilityFlags(g, m)).toEqual([]);
    expect(hasRoute([2, 0, 2], [2, 0, 8], portals, [m.landmarks[0]!.bounds])).toBe(true);
  });

  test("a graph with the gap edge removed has no route: hard flag", () => {
    const cut: Portals = { ...portals, edges: [portals.edges[0]!, portals.edges[2]!] };
    const f = reachabilityFlags(move([2, 0, 2], [2, 0, 8]), manifest(cut));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "reachability", severity: "hard", eventIds: ["m"] });
    expect(f[0]!.message).toMatch(/\d+\.\d m/);
  });

  test("a destination inside furniture is unreachable", () => {
    const f = reachabilityFlags(move([2, 0, 2], [3, 0, 5]), manifest(portals));
    expect(f).toHaveLength(1);
  });

  test("no portals field: no flags", () => {
    expect(reachabilityFlags(move([2, 0, 2], [2, 0, 8]), manifest())).toEqual([]);
  });
});

describe("time_distance", () => {
  const walk = (id: string, len: number, t0: number, t1: number, action: "walk" | "run" = "walk") =>
    ev({ id, action, tStart: t0, tEnd: t1, from: [0, 0, 0], to: [len, 0, 0], path: [[0, 0, 0], [len, 0, 0]], pathLengthM: len });

  test("walk over 2 m/s is soft, run over 6 is soft, anything over 8 is hard", () => {
    const f = timeDistanceFlags(
      graphOf([
        walk("ok", 10, 0, 10),
        walk("w", 30, 0, 10),
        walk("r_ok", 50, 0, 10, "run"),
        walk("r", 70, 0, 10, "run"),
        walk("h", 90, 0, 10),
      ].map((e, i) => ({ ...e, actor: `x${i}` }))),
    );
    const by = Object.fromEntries(f.map((x) => [x.eventIds[0]!, x.severity]));
    expect(by).toEqual({ w: "soft", r: "soft", h: "hard" });
    expect(f.find((x) => x.eventIds[0] === "w")!.message).toContain("3.0 m/s");
  });

  test("a jump between consecutive events is checked against the gap", () => {
    const g = graphOf([
      ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 1 }),
      ev({ id: "q", at: [20, 0, 0], tStart: 2, tEnd: 3 }),
    ]);
    const f = timeDistanceFlags(g);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "hard", eventIds: ["p", "q"] });
    expect(f[0]!.message).toContain("20.0 m in 1.0 s");
  });

  test("overlapping events are left to the contradiction rule", () => {
    const g = graphOf([
      ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 5 }),
      ev({ id: "q", at: [20, 0, 0], tStart: 2, tEnd: 3 }),
    ]);
    expect(timeDistanceFlags(g)).toEqual([]);
  });
});

describe("contradiction", () => {
  test("same actor, overlapping time, more than 2 m apart: soft flag on both", () => {
    const g = graphOf([
      ev({ id: "p", at: [0.5, 0, 0.5], tStart: 0, tEnd: 10 }),
      ev({ id: "q", at: [5, 0, 8], tStart: 5, tEnd: 12 }),
    ]);
    const f = contradictionFlags(g, manifest());
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "contradiction", severity: "soft", eventIds: ["p", "q"] });
    expect(f[0]!.message).toMatch(/zone.*block|block.*zone/);
    expect(f[0]!.message).toMatch(/\d+\.\d m apart/);
  });

  test("no flag when apart in time, close together, or different actors", () => {
    const base = ev({ id: "p", at: [0, 0, 0], tStart: 0, tEnd: 5 });
    expect(contradictionFlags(graphOf([base, ev({ id: "q", at: [9, 0, 9], tStart: 5, tEnd: 6 })]), manifest())).toEqual([]);
    expect(contradictionFlags(graphOf([base, ev({ id: "q", at: [1, 0, 1], tStart: 1, tEnd: 6 })]), manifest())).toEqual([]);
    expect(contradictionFlags(graphOf([base, ev({ id: "q", actor: "b", at: [9, 0, 9], tStart: 1, tEnd: 6 })]), manifest())).toEqual([]);
  });
});

describe("unanchored and missing_time", () => {
  test("soft flags, and status stays proposed", () => {
    const g = graphOf([
      ev({ id: "u" }), // no position at all
      ev({ id: "m", at: [1, 0, 1], tInferred: true, tStart: 3, tEnd: 5 }),
      ev({ id: "ok", at: [1, 0, 1] }),
    ]);
    expect(unanchoredFlags(g).map((f) => f.eventIds[0])).toEqual(["u"]);
    expect(missingTimeFlags(g).map((f) => f.eventIds[0])).toEqual(["m"]);
    const out = gate(g, manifest(), { meshes: [] });
    expect(out.statuses).toEqual({ u: "proposed", m: "proposed", ok: "plausible" });
    expect(out.flags.every((f) => f.severity === "soft")).toBe(true);
    expect(missingTimeFlags(g)[0]!.message).toContain("2.0 s");
  });

  test("a movement with one anchor is unanchored", () => {
    const g = graphOf([ev({ id: "w", action: "walk", from: [1, 0, 1], path: [[1, 0, 1]] })]);
    expect(unanchoredFlags(g)[0]!.message).toContain("1 of its 2");
  });
});

describe("gate status rules", () => {
  const geom: SceneGeom = { meshes: [boxMesh("wall", [4, 0, 0], [5, 2, 10])] };
  const blockedLook = [
    ev({ id: "l", actor: "a", action: "look", target: "b", at: [1, 0, 5], tStart: 0, tEnd: 2 }),
    ev({ id: "s", actor: "b", at: [8, 0, 5], tStart: 0, tEnd: 2 }),
  ];

  test("hard flag makes implausible; the target's event stays plausible", () => {
    const out = gate(graphOf(blockedLook), manifest(), geom);
    expect(out.statuses).toEqual({ l: "implausible", s: "plausible" });
  });

  test("soft-only keeps plausible with the flag attached", () => {
    const g = graphOf([
      ev({ id: "p", at: [0.5, 0, 0.5], tStart: 0, tEnd: 10 }),
      ev({ id: "q", at: [5, 0, 8], tStart: 5, tEnd: 12 }),
    ]);
    const out = gate(g, manifest(), { meshes: [] });
    expect(out.statuses).toEqual({ p: "plausible", q: "plausible" });
    expect(out.flags).toHaveLength(1);
  });

  test("overridden keeps its status and the flag is still reported; superseded events are ignored by every rule", () => {
    const g = graphOf(blockedLook.map((e) => (e.id === "l" ? { ...e, status: "overridden" as const } : e)));
    const out = gate(g, manifest(), geom);
    expect(out.statuses).toEqual({ l: "overridden", s: "plausible" });
    expect(out.flags.some((f) => f.kind === "sightline")).toBe(true);
    const sup = graphOf(blockedLook.map((e) => ({ ...e, status: "superseded" as const })));
    const o2 = gate(sup, manifest(), geom);
    expect(o2.statuses).toEqual({ l: "superseded", s: "superseded" });
    expect(o2.flags).toEqual([]);
  });

  test("hard beats proposed; inputs are not mutated; output is deterministic", () => {
    const g = graphOf(blockedLook.map((e) => (e.id === "l" ? { ...e, tInferred: true } : e)));
    const before = JSON.stringify([g, geom]);
    const out = gate(g, manifest(), geom);
    expect(out.statuses.l).toBe("implausible");
    expect(JSON.stringify([g, geom])).toBe(before);
    expect(gate(g, manifest(), geom)).toEqual(out);
  });

  test("flags come out in rule order", () => {
    const g = graphOf([
      ...blockedLook,
      ev({ id: "m", actor: "b", at: [8, 0, 5], tInferred: true, tStart: 5, tEnd: 6 }),
      ev({ id: "u", actor: "b", tStart: 7, tEnd: 8 }),
    ]);
    const kinds = gate(g, manifest(), geom).flags.map((f) => f.kind);
    expect(kinds).toEqual(["sightline", "unanchored", "missing_time"]);
  });
});

describe("segment ids and the resolver's reachable mark", () => {
  test("contradiction skips pairs from the same segment but not different or missing ones", () => {
    const mk = (sa?: string, sb?: string) =>
      graphOf([
        ev({ id: "p", at: [0.5, 0, 0.5], tStart: 0, tEnd: 10, segmentId: sa }),
        ev({ id: "q", at: [5, 0, 8], tStart: 5, tEnd: 12, segmentId: sb }),
      ]);
    expect(contradictionFlags(mk("s1", "s1"), manifest())).toEqual([]);
    expect(contradictionFlags(mk("s1", "s2"), manifest())).toHaveLength(1);
    expect(contradictionFlags(mk(undefined, "s2"), manifest())).toHaveLength(1);
  });

  test("reachable: false from the resolver is a hard flag even without portals", () => {
    const g = graphOf([ev({ id: "m", action: "walk", from: [1, 0, 1], to: [9, 0, 9], reachable: false })]);
    const f = reachabilityFlags(g, manifest());
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "hard", eventIds: ["m"] });
    expect(f[0]!.message).toContain("11.3 m");
  });
});
