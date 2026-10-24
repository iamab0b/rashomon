import { describe, expect, test } from "vitest";
import { eventNeighbors, versionChain, versionChanges } from "./history";

const ev = (id: string, tStart: number, tEnd: number, supersededBy?: string) => ({ id, tStart, tEnd, supersededBy });

describe("versionChain", () => {
  const events = [ev("a1", 1, 2, "a2"), ev("a2", 1, 3, "a3"), ev("a3", 2, 3), ev("b", 0, 1)];

  test("newest first from any version in the chain", () => {
    expect(versionChain(events, "a3").map((e) => e.id)).toEqual(["a3", "a2", "a1"]);
    expect(versionChain(events, "a1").map((e) => e.id)).toEqual(["a3", "a2", "a1"]);
    expect(versionChain(events, "b").map((e) => e.id)).toEqual(["b"]);
    expect(versionChain(events, "missing")).toEqual([]);
  });

  test("cycles terminate", () => {
    expect(versionChain([ev("x", 0, 1, "y"), ev("y", 0, 1, "x")], "x")).toHaveLength(2);
  });
});

test("versionChanges lists only fields that differ", () => {
  const describe = (e: { t: string; place: string }) => ({ Time: e.t, Place: e.place });
  expect(versionChanges({ t: "1", place: "" }, { t: "2", place: "" }, describe)).toEqual([
    { field: "Time", from: "1", to: "2" },
  ]);
  expect(versionChanges({ t: "1", place: "" }, { t: "1", place: "Door" }, describe)).toEqual([
    { field: "Place", from: "none", to: "Door" },
  ]);
});

describe("eventNeighbors", () => {
  const events = [ev("c", 5, 6), ev("a", 0, 2), ev("b", 0, 1)];

  test("follows chronological display order, not array order", () => {
    expect(eventNeighbors(events, "b")).toMatchObject({ index: 0, total: 3, prev: null, next: { id: "a" } });
    expect(eventNeighbors(events, "a")).toMatchObject({ index: 1, prev: { id: "b" }, next: { id: "c" } });
    expect(eventNeighbors(events, "c")).toMatchObject({ index: 2, next: null });
  });

  test("no selection offers the first event as next", () => {
    expect(eventNeighbors(events, null)).toMatchObject({ index: -1, prev: null, next: { id: "b" } });
  });
});
