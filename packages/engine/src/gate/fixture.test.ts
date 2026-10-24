import { describe, expect, test } from "vitest";
import type { Event, EventGraph, SceneManifest } from "@rashomon/schema";
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

type PatchJson = {
  op: string;
  id?: string;
  changes?: Partial<Event>;
  event?: Omit<Event, "id" | "status" | "flags">;
};

function applyCorrection(graph: EventGraph, patches: PatchJson[]): EventGraph {
  let events = graph.events;
  for (const p of patches) {
    if (p.op === "update_event" && p.id && p.changes) {
      const { id, changes } = p;
      events = events.map((e) => (e.id === id ? { ...e, ...changes } : e));
    } else if (p.op === "add_event" && p.event) {
      events = [...events, { ...p.event, id: `e${events.length + 1}`, status: "proposed", flags: [] }];
    } else {
      throw new Error(`unsupported patch ${p.op}`);
    }
  }
  return { ...graph, events };
}

describe("resolve() then gate() on the robbery fixture", () => {
  const out = gate(resolved, store, geom);

  test("e5 is implausible with a sightline flag naming shelf_a; everything else is plausible", () => {
    expect(out.statuses.e5).toBe("implausible");
    for (const e of robbery.events) if (e.id !== "e5") expect(out.statuses[e.id], e.id).toBe("plausible");
    expect(out.flags).toHaveLength(1);
    const flag = out.flags[0]!;
    expect(flag).toMatchObject({ id: "sightline:e5", eventId: "e5", check: "sightline", severity: "hard" });
    expect(flag.detail).toContain("shelf_a");
    expect(flag.suggestedQuestion.length).toBeGreaterThan(0);
  });

  test("reachability is clean for every event using the real portals", () => {
    expect(store.portals?.waypoints.length).toBeGreaterThan(0);
    expect(resolved.events.every((e) => e.reachable)).toBe(true);
    expect(out.flags.filter((f) => f.check === "reachability")).toEqual([]);
  });

  test("the resolver copies each event's sources", () => {
    expect(resolved.events.map((e) => [e.id, e.sources])).toEqual(
      robbery.events.map((e) => [e.id, e.sources]),
    );
  });

  test("matches expectedAfterGate in the fixture", () => {
    const exp = (robberyJson as unknown as { expectedAfterGate: { statuses: Record<string, string>; hardFlags: { eventId: string; check: string; blockedBy: string }[]; softFlags: unknown[] } }).expectedAfterGate;
    const expectedStatuses = { ...exp.statuses };
    expect(out.statuses).toEqual(expectedStatuses);
    for (const h of exp.hardFlags) {
      const f = out.flags.find((x) => x.eventId === h.eventId)!;
      expect(f.check).toBe(h.check);
      expect(f.detail).toContain(h.blockedBy);
    }
    expect(out.flags.filter((f) => f.severity === "soft")).toHaveLength(exp.softFlags.length);
  });

  test("the fixture's own correction patches leave every event plausible with no flags", () => {
    const corrected = applyCorrection(robbery, robberyJson.correctionPatch.patches as PatchJson[]);
    expect(corrected.events).toHaveLength(robbery.events.length + 1);
    const o = gate(resolve(corrected, store), store, geom);
    expect(Object.values(o.statuses).every((st) => st === "plausible")).toBe(true);
    expect(Object.keys(o.statuses)).toHaveLength(corrected.events.length);
    expect(o.flags).toEqual([]);
  });
});

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
