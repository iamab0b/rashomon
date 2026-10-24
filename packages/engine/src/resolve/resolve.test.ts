import { describe, expect, test } from "vitest";
import type { EventGraph, Landmark, SceneManifest } from "@rashomon/schema";
import robberyJson from "../../../schema/fixtures/robbery.graph.json";
import resolvedJson from "../../../schema/fixtures/robbery.resolved.json";
import storeJson from "../../../schema/fixtures/store.scene.json";
import { anchorToPoint } from "./anchors";
import { MARGIN_M } from "./geometry";
import { pathLength, shortestPath } from "./portals";
import { resolve } from "./resolve";
import { durationFor, resolveInterval } from "./time";

const store = storeJson as unknown as SceneManifest;
const robbery = robberyJson as unknown as EventGraph;
const box = (id: string): Landmark => {
  const l = store.landmarks.find((m) => m.id === id);
  if (!l) throw new Error(id);
  return l;
};

const lm = (
  id: string,
  min: [number, number],
  max: [number, number],
  position: [number, number, number] = [0, 0, 0],
): Landmark => ({
  id,
  label: id,
  aliases: [],
  position,
  bounds: { min: [min[0], 0, min[1]], max: [max[0], 1, max[1]] },
  kind: "furniture",
  occludes: true,
});

// 10 x 10 room, center (5, 5)
const synth: SceneManifest = {
  sceneId: "synth",
  meshUrl: "",
  up: "y",
  unitsPerMeter: 1,
  eyeHeight: 1.6,
  landmarks: [
    lm("west", [0, 4], [1, 6], [1.5, 0, 5.5]), // against the west wall, room is to its +X
    lm("south", [4, 0], [6, 1]), // room is to its +Z
    lm("mid", [4, 4], [6, 6]),
  ],
};
(synth as unknown as { interior: unknown }).interior = {
  min: [0, 0, 0],
  max: [10, 3, 10],
};

describe("anchorToPoint", () => {
  test("at: the landmark's position field on the floor, not the box center", () => {
    expect(anchorToPoint({ kind: "at", landmark: "west" }, synth)).toEqual([1.5, 0, 5.5]);
  });
  test("near: 0.6 m off the face that looks at the room center", () => {
    const p = anchorToPoint({ kind: "near", landmark: "west" }, synth);
    expect(p[0]).toBeCloseTo(1.6);
    expect(p[2]).toBeCloseTo(5);
    const s = anchorToPoint({ kind: "near", landmark: "south" }, synth);
    expect(s[0]).toBeCloseTo(5);
    expect(s[2]).toBeCloseTo(1.6);
  });
  test("near: honors radiusM", () => {
    const p = anchorToPoint({ kind: "near", landmark: "west", radiusM: 1 }, synth);
    expect(p[0]).toBeCloseTo(2);
  });
  test("behind: the far side from the room center", () => {
    const p = anchorToPoint({ kind: "behind", landmark: "west" }, synth);
    expect(p[0]).toBeCloseTo(0); // 0 - 0.6 clamped to the interior
    expect(p[2]).toBeCloseTo(5);
    const s = anchorToPoint({ kind: "behind", landmark: "south" }, synth);
    expect(s[2]).toBeCloseTo(0); // clamped to the interior
    // a box in the south-west quarter: the far side from the room center is -Z
    const sw = { ...synth, landmarks: [lm("sw", [1, 1], [3, 2])] };
    const m = anchorToPoint({ kind: "behind", landmark: "sw" }, sw);
    expect(m[0]).toBeCloseTo(2);
    expect(m[2]).toBeCloseTo(0.4);
  });
  test("between: midpoint of two landmark box centers", () => {
    expect(anchorToPoint({ kind: "between", a: "west", b: "south" }, synth)).toEqual([2.75, 0, 2.75]);
  });
  test("xyz is flattened to the floor", () => {
    expect(anchorToPoint({ kind: "xyz", position: [1, 2, 3] }, synth)).toEqual([1, 0, 3]);
  });
  test("unknown landmark throws with the id", () => {
    expect(() => anchorToPoint({ kind: "at", landmark: "nope" }, synth)).toThrow(/nope/);
    expect(() => anchorToPoint({ kind: "between", a: "west", b: "zzz" }, synth)).toThrow(/zzz/);
  });
});

describe("time", () => {
  test("given intervals are kept", () => {
    expect(resolveInterval([2, 5], "walk", 100, 99)).toEqual({ tStart: 2, tEnd: 5, tInferred: false });
  });
  test("missing interval inherits previous end and uses the table", () => {
    expect(resolveInterval(undefined, "walk", 7, 10)).toEqual({ tStart: 10, tEnd: 15, tInferred: true });
    expect(durationFor("run", 8)).toBe(2);
    expect(durationFor("stand", 0)).toBe(2);
    expect(durationFor("look", 0)).toBe(2);
    for (const a of ["shove", "fall", "pick_up"] as const) expect(durationFor(a, 0)).toBe(1);
  });
  test("resolve chains inferred events off the previous end", () => {
    const g = {
      sceneId: "store_v1",
      version: 1,
      actors: robbery.actors,
      props: [],
      events: [
        { ...robbery.events[0]! },
        { ...robbery.events[1]!, t: undefined },
        { ...robbery.events[7]!, t: undefined },
      ],
    } as unknown as EventGraph;
    const r = resolve(g, store);
    expect(r.events[1]).toMatchObject({ tStart: 5, tEnd: 7, tInferred: true });
    expect(r.events[2]).toMatchObject({ tStart: 7, tEnd: 8, tInferred: true });
    expect(r.events[0]!.tInferred).toBe(false);
  });
});

describe("portals", () => {
  const portals = store.portals!;
  const obstacles = store.landmarks.filter((l) => l.occludes);
  const wp = new Map(portals.waypoints.map((w) => [w.id, w]));

  // Independent of the resolver's clipping code: sample along the edge and
  // require every sample to be at least MARGIN_M from every obstacle box.
  const clearance = (x: number, z: number, b: Landmark["bounds"]) =>
    Math.hypot(
      Math.max(b.min[0] - x, 0, x - b.max[0]),
      Math.max(b.min[2] - z, 0, z - b.max[2]),
    );

  test("every waypoint is itself clear of every obstacle", () => {
    for (const w of portals.waypoints)
      for (const o of obstacles)
        expect(clearance(w.x, w.z, o.bounds), `${w.id} vs ${o.id}`).toBeGreaterThanOrEqual(MARGIN_M - 1e-9);
  });

  test("every edge is clear of every obstacle box by the margin", () => {
    expect(portals.edges.length).toBeGreaterThan(10);
    for (const [ia, ib] of portals.edges) {
      const a = wp.get(ia)!;
      const b = wp.get(ib)!;
      for (let i = 0; i <= 400; i++) {
        const t = i / 400;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        for (const o of obstacles)
          expect(clearance(x, z, o.bounds), `${ia}-${ib} vs ${o.id}`).toBeGreaterThanOrEqual(MARGIN_M - 1e-6);
      }
    }
  });

  test("the graph is connected", () => {
    const seen = new Set([portals.waypoints[0]!.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const [a, b] of portals.edges)
        if (seen.has(a) !== seen.has(b)) {
          seen.add(a).add(b);
          grew = true;
        }
    }
    expect(seen.size).toBe(portals.waypoints.length);
  });

  test("shortestPath removes collinear points and routes around a box", () => {
    const obs = obstacles.map((o) => o.bounds);
    const straight = shortestPath([1.5, 0, 0.3], [1.5, 0, 5.5], portals, obs);
    expect(straight).toEqual([[1.5, 0, 0.3], [1.5, 0, 5.5]]);
    const around = shortestPath([1.5, 0, 0.3], [7.2, 0, 2.5], portals, obs);
    expect(around.length).toBeGreaterThanOrEqual(3);
  });
});

describe("robbery fixture", () => {
  const r = resolve(robbery, store);
  const ev = (id: string) => r.events.find((e) => e.id === id)!;
  const inside = (p: number[], id: string) => {
    const b = box(id).bounds;
    return p[0]! > b.min[0] && p[0]! < b.max[0] && p[2]! > b.min[2] && p[2]! < b.max[2];
  };

  test("e1 walks around shelf_b", () => {
    const e1 = ev("e1");
    expect(e1.tStart).toBe(0);
    expect(e1.tEnd).toBe(5);
    expect(e1.path.length).toBeGreaterThanOrEqual(3);
    // no vertex and no segment inside shelf_b's box
    const b = box("shelf_b").bounds;
    for (let i = 1; i < e1.path.length; i++) {
      const [a, c] = [e1.path[i - 1]!, e1.path[i]!];
      for (let k = 0; k <= 200; k++) {
        const x = a[0] + (c[0] - a[0]) * (k / 200);
        const z = a[2] + (c[2] - a[2]) * (k / 200);
        expect(x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]).toBe(false);
      }
    }
  });

  test("e1 length is a plausible detour (see PR: the 7-10 m expectation does not match the floor plan)", () => {
    const len = pathLength(ev("e1").path);
    expect(len).toBeCloseTo(ev("e1").pathLengthM, 5);
    expect(len).toBeGreaterThan(Math.hypot(7.2 - 1.5, 2.5 - 0.4)); // longer than the straight line
    expect(len).toBeLessThanOrEqual(7.5); // floor plan: "longer than 7.5 m = wrong side of a shelf"
  });

  test("e5 stands inside aisle_chips", () => {
    expect(inside(ev("e5").at!, "aisle_chips")).toBe(true);
  });

  test("e10 reuses e1's waypoints in reverse", () => {
    expect(ev("e10").path).toEqual([...ev("e1").path].reverse());
  });

  test("statuses are copied, durations and props", () => {
    expect(r.events.every((e) => e.status === "proposed")).toBe(true);
    expect(r.handwritten).toBe(false);
    expect(r.durationS).toBe(24);
    expect(r.props.find((p) => p.id === "p_knife")).toMatchObject({
      heldBy: "suspect",
      heldByIntervals: [{ actor: "suspect", tStart: 11, tEnd: 24 }],
    });
    expect(r.actors.find((a) => a.id === "suspect")).toHaveProperty("position");
  });

  test("robbery.resolved.json matches the resolver output", () => {
    // regenerate by writing JSON.stringify(resolve(graph, manifest), null, 2)
    expect(resolvedJson).toEqual(JSON.parse(JSON.stringify(r)));
  });
});
