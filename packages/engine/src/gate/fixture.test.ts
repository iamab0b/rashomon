import { describe, expect, test } from "vitest";
import type { EventGraph, SceneManifest } from "@rashomon/schema";
import robberyJson from "../../../schema/fixtures/robbery.graph.json";
import storeJson from "../../../schema/fixtures/store.scene.json";
import { gate } from "./index";
import { segmentBlocked } from "./raycast";
import { resolve } from "../resolve/resolve";
import { floorPlanGeom } from "./testHelpers";

const store = storeJson as unknown as SceneManifest;
const robbery = robberyJson as unknown as EventGraph;
const geom = floorPlanGeom();
const resolved = resolve(robbery, store);

describe("resolve() then gate() on the robbery fixture", () => {
  const out = gate(resolved, store, geom);

  test("e5 is implausible with a sightline flag naming shelf_a; everything else is plausible", () => {
    expect(out.statuses.e5).toBe("implausible");
    for (const e of robbery.events) if (e.id !== "e5") expect(out.statuses[e.id], e.id).toBe("plausible");
    const flag = out.flags.filter((f) => f.eventIds.includes("e5"));
    expect(flag).toHaveLength(1);
    expect(flag[0]).toMatchObject({ kind: "sightline", severity: "hard" });
    expect(flag[0]!.message).toContain("shelf_a");
    expect(out.flags).toHaveLength(1);
  });

  test("reachability is clean for every event using the real portals", () => {
    expect(store.portals?.waypoints.length).toBeGreaterThan(0);
    expect(resolved.events.every((e) => e.reachable)).toBe(true);
    expect(out.flags.filter((f) => f.kind === "reachability")).toEqual([]);
  });

  test("the resolver copies each event's first source as segmentId", () => {
    expect(resolved.events.map((e) => [e.id, e.segmentId])).toEqual(
      robbery.events.map((e) => [e.id, e.sources[0]]),
    );
  });

  test("matches expectedAfterGate in the fixture", () => {
    const exp = (robberyJson as unknown as { expectedAfterGate: { statuses: Record<string, string>; hardFlags: { eventId: string; check: string; blockedBy: string }[]; softFlags: unknown[] } }).expectedAfterGate;
    const expectedStatuses = { ...exp.statuses };
    expect(out.statuses).toEqual(expectedStatuses);
    for (const h of exp.hardFlags) {
      const f = out.flags.find((x) => x.eventIds.includes(h.eventId))!;
      expect(f.kind).toBe(h.check);
      expect(f.message).toContain(h.blockedBy);
    }
    expect(out.flags.filter((f) => f.severity === "soft")).toHaveLength(exp.softFlags.length);
  });

  test("the correction patch from the fixture (witness at the window) makes e5 plausible", () => {
    const window = [4.5, 0, 1.0] as [number, number, number];
    const aisle = [1.5, 0, 3.5] as [number, number, number];
    const base = resolved.events.find((e) => e.id === "e5")!;
    const events = resolved.events.map((e) => {
      if (e.id === "e5" || e.id === "e9") return { ...e, at: window };
      if (e.id === "e3") return { ...e, tEnd: 9 };
      return e;
    });
    events.push({
      ...base,
      id: "e3b",
      action: "walk",
      tStart: 8,
      tEnd: 11,
      path: [aisle, window],
      pathLengthM: Math.hypot(3, 2.5),
      reachable: true,
      from: aisle,
      to: window,
      at: undefined,
      target: undefined,
    });
    const o = gate({ ...resolved, events }, store, geom);
    expect(o.statuses.e5).toBe("plausible");
    expect(o.flags).toEqual([]);
  });
});

// docs/store-floorplan.md has no table of landmark pairs; its "planted contradiction"
// section hand-checks two rays (eye 1.6 m to chest 1.2 m), reproduced here row by row.
describe("floor plan sightline rows", () => {
  const pos = (id: string) => store.landmarks.find((l) => l.id === id)!.position;
  const ray = (from: string, to: string, g = geom) => {
    const a = pos(from);
    const b = pos(to);
    return segmentBlocked([a[0], 1.6, a[2]], [b[0], 1.2, b[2]], g);
  };

  test("aisle_chips -> counter is blocked by shelf_a", () => {
    const h = ray("aisle_chips", "counter")!;
    expect(h.meshId).toBe("shelf_a");
    // doc: at x = 2.4 the ray is at z = 3.35
    expect(h.point[0]).toBeCloseTo(2.4);
    expect(h.point[2]).toBeCloseTo(3.35, 1);
  });

  test("...and would be blocked again by shelf_b", () => {
    const noA = { meshes: geom.meshes.filter((m) => m.id !== "shelf_a") };
    const h = ray("aisle_chips", "counter", noA)!;
    expect(h.meshId).toBe("shelf_b");
    expect(h.point[0]).toBeCloseTo(5.0);
    expect(h.point[2]).toBeCloseTo(2.9, 1);
  });

  test("window_front -> counter is clear", () => {
    expect(ray("window_front", "counter")).toBeNull();
  });
});
