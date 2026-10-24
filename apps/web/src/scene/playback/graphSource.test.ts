import { describe, expect, test } from "vitest";
import { fixtureGraphSource, gatedSnapshot, robberyGatedSnapshot } from "./graphSource";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";

const snapshot = robberyGatedSnapshot();
const events = snapshot.resolved?.events ?? [];

describe("fixture graph source runs the real resolver and gate", () => {
  test("e5 is implausible with exactly one hard sightline flag blocked by shelf_a", () => {
    const e5 = events.find((event) => event.id === "e5");

    expect(e5?.status).toBe("implausible");
    expect(e5?.flags).toHaveLength(1);
    expect(e5?.flags[0]).toMatchObject({ check: "sightline", severity: "hard", eventId: "e5" });
    expect(e5?.flags[0]?.evidence.blocker).toBe("shelf_a");
    expect(e5?.flags[0]?.suggestedQuestion.length).toBeGreaterThan(0);
  });

  test("every other event is plausible with no flags", () => {
    const others = events.filter((event) => event.id !== "e5");

    expect(others).toHaveLength(9);
    for (const event of others) {
      expect(event.status, event.id).toBe("plausible");
      expect(event.flags, event.id).toEqual([]);
    }
  });

  test("statuses mirror the status on each event", () => {
    for (const event of events) expect(snapshot.statuses[event.id]).toBe(event.status);
  });

  test("flags carry the gate's own ids", () => {
    expect(events.find((event) => event.id === "e5")?.flags[0]?.id).toBe("sightline:e5");
  });

  test("the snapshot is computed once and reused", () => {
    const source = fixtureGraphSource("store");

    expect(source?.getSnapshot()).toBe(source?.getSnapshot());
    expect(fixtureGraphSource("store")?.getSnapshot()).toBe(snapshot);
  });

  test("unknown fixtures have no source, including inherited keys", () => {
    expect(fixtureGraphSource("nope")).toBeNull();
    expect(fixtureGraphSource("constructor")).toBeNull();
  });

  test("gatedSnapshot is a pure function of its inputs", () => {
    expect(gatedSnapshot(robberyGraph, storeScene)).toEqual(snapshot);
  });
});
