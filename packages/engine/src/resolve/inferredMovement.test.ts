import type { Event, EventGraph } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { describe, expect, test } from "vitest";
import { gate } from "../gate";
import { resolve } from "./resolve";

const at = (landmark: string) => ({ kind: "at" as const, landmark });

const walk = (over: Partial<Event> = {}): Event =>
  ({
    id: "e11",
    witnessId: "w1",
    actor: "witness",
    action: "walk",
    from: at("aisle_chips"),
    to: at("window_front"),
    t: [8, 10],
    tConfidence: "inferred",
    confidence: 0.9,
    sources: ["utt_12"],
    status: "proposed",
    flags: [],
    ...over,
  }) as Event;

const mcfix1 = (walkEvent: Event): EventGraph => {
  const events = robberyGraph.events.map((e) => {
    if (e.id === "e3") return { ...e, t: [0, 8] as [number, number] };
    if (e.id === "e5") return { ...e, at: at("window_front") };
    if (e.id === "e9") return { ...e, at: at("window_front") };
    return e;
  });
  return { ...robberyGraph, events: [...events, walkEvent] } as EventGraph;
};

const run = (graph: EventGraph) => {
  const resolved = resolve(graph, storeScene);
  const verdict = gate(resolved, storeScene, { meshes: [] });
  const byId = (id: string) => resolved.events.find((e) => e.id === id)!;
  const flagsOf = (id: string) => verdict.flags.filter((f) => f.eventId === id);
  return { resolved, verdict, byId, flagsOf };
};

describe("inferred movement", () => {
  test("mcfix1: an inferred walk squeezed between stated events is estimated and soft, and e5 keeps its view", () => {
    const { verdict, byId, flagsOf } = run(mcfix1(walk()));
    const e11 = byId("e11");
    expect(e11.pathLengthM).toBeCloseTo(5.7, 0);
    expect(e11.tInferred).toBe(true);
    expect([e11.tStart, e11.tEnd]).toEqual([8, 10]);
    const timing = flagsOf("e11").filter((f) => f.check === "time_distance");
    expect(timing.length).toBeGreaterThan(0);
    expect(timing.every((f) => f.severity === "soft")).toBe(true);
    expect(verdict.statuses.e11).toBe("proposed");
    expect(flagsOf("e11").filter((f) => f.severity === "hard")).toEqual([]);
    expect(verdict.statuses.e5).toBe("plausible");
    expect(flagsOf("e5").filter((f) => f.check === "sightline")).toEqual([]);
    expect([byId("e3").tStart, byId("e3").tEnd]).toEqual([0, 8]);
    expect([byId("e5").tStart, byId("e5").tEnd]).toEqual([10, 12]);
    expect([byId("e9").tStart, byId("e9").tEnd]).toEqual([13, 24]);
  });

  test("the same walk with a stated time keeps the hard flag and is implausible", () => {
    const { verdict, byId, flagsOf } = run(mcfix1(walk({ tConfidence: "stated" })));
    expect(byId("e11").tInferred).toBe(false);
    const timing = flagsOf("e11").filter((f) => f.check === "time_distance");
    expect(timing.map((f) => f.severity)).toEqual(["hard"]);
    expect(verdict.statuses.e11).toBe("implausible");
  });

  test("with room to extend, an inferred 5.7 m walk lasts at least 4.07 s and has no time_distance flag", () => {
    const graph = { ...robberyGraph, events: [walk({ t: [30, 32] })] } as EventGraph;
    const { verdict, byId, flagsOf } = run(graph);
    const e11 = byId("e11");
    expect(e11.tInferred).toBe(true);
    expect(e11.tStart).toBe(30);
    expect(e11.tEnd - e11.tStart).toBeGreaterThanOrEqual(e11.pathLengthM / 1.4 - 1e-6);
    expect(e11.tEnd - e11.tStart).toBeGreaterThanOrEqual(4.07);
    expect(flagsOf("e11").filter((f) => f.check === "time_distance")).toEqual([]);
    expect(flagsOf("e11").filter((f) => f.severity === "hard")).toEqual([]);
    expect(verdict.statuses.e11).not.toBe("implausible");
  });

  test("an inferred run is lengthened to path / 4 m/s", () => {
    const run12 = walk({ id: "r1", action: "run", from: at("front_door"), to: at("cooler"), t: [30, 31] });
    const { byId } = run({ ...robberyGraph, events: [run12] } as EventGraph);
    const r1 = byId("r1");
    expect(r1.tEnd - r1.tStart).toBeCloseTo(r1.pathLengthM / 4, 5);
    expect(r1.tInferred).toBe(true);
  });

  test("when the end cannot move the start extends back, never into a stated event", () => {
    const events = [
      { ...robberyGraph.events.find((e) => e.id === "e3")!, t: [0, 6] as [number, number] },
      walk({ t: [8, 10] }),
      { ...robberyGraph.events.find((e) => e.id === "e5")!, t: [10, 12] as [number, number], at: at("window_front") },
    ];
    const { byId } = run({ ...robberyGraph, events } as EventGraph);
    const e11 = byId("e11");
    expect(e11.tEnd).toBe(10);
    expect(e11.tStart).toBeLessThan(8);
    expect(e11.tStart).toBeGreaterThanOrEqual(6);
  });

  test("a walk that already fits its interval is untouched and not estimated", () => {
    const { byId } = run({ ...robberyGraph, events: [walk({ t: [30, 40] })] } as EventGraph);
    expect(byId("e11")).toMatchObject({ tStart: 30, tEnd: 40, tInferred: false });
  });

  test("the fixture's own correction walk overlaps stated events and is left alone", () => {
    const patch = (robberyGraph as unknown as { correctionPatch: { patches: { op: string; event?: Event }[] } }).correctionPatch.patches;
    const added = patch.find((p) => p.op === "add_event")!.event!;
    const { byId } = run({ ...robberyGraph, events: [...robberyGraph.events, { ...added, id: "e11" } as Event] } as EventGraph);
    expect(byId("e11")).toMatchObject({ tStart: 8, tEnd: 11, tInferred: false });
  });
});
