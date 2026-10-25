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

  test("an inferred 12 m run in 1 s is lengthened to 3 s", () => {
    const open = {
      ...storeScene,
      landmarks: [],
      portals: undefined,
      interior: { min: [0, 0, 0], max: [20, 3, 20] },
    } as unknown as typeof storeScene;
    const xyz = (x: number, z: number) => ({ kind: "xyz" as const, position: [x, 0, z] as [number, number, number] });
    const sprint = walk({ id: "r1", action: "run", from: xyz(2, 5), to: xyz(14, 5), t: [30, 31] });
    const resolved = resolve({ ...robberyGraph, props: [], events: [sprint] } as EventGraph, open);
    const r1 = resolved.events[0]!;
    expect(r1.pathLengthM).toBeCloseTo(12, 5);
    expect(r1.tStart).toBe(30);
    expect(r1.tEnd).toBeCloseTo(33, 5);
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

  test("a stated crouch right after an estimated walk stays plausible", () => {
    const events = [
      { ...robberyGraph.events.find((e) => e.id === "e3")!, t: [0, 8] as [number, number] },
      walk({ t: [8, 10] }),
      { ...robberyGraph.events.find((e) => e.id === "e9")!, id: "c1", t: [12, 20] as [number, number], at: at("counter") },
    ];
    const { verdict, byId, flagsOf } = run({ ...robberyGraph, events } as EventGraph);
    expect([byId("c1").tStart, byId("c1").tEnd]).toEqual([12, 20]);
    expect(flagsOf("c1").filter((f) => f.severity === "hard")).toEqual([]);
    expect(verdict.statuses.c1).toBe("plausible");
    expect(verdict.statuses.e11).not.toBe("implausible");
  });

  test("a stated event with no estimate before it keeps its hard between-event flag", () => {
    const events = [
      { ...robberyGraph.events.find((e) => e.id === "e3")!, t: [0, 8] as [number, number] },
      walk({ t: [8, 8.1], tConfidence: "stated" }),
      { ...robberyGraph.events.find((e) => e.id === "e9")!, id: "c1", t: [8.2, 20] as [number, number], at: at("counter") },
    ];
    const { verdict } = run({ ...robberyGraph, events } as EventGraph);
    expect(verdict.statuses.c1).toBe("implausible");
  });

  test("the lengthened end stops early enough to walk to a close next event", () => {
    const events = [
      walk({ t: [8, 9] }),
      { ...robberyGraph.events.find((e) => e.id === "e9")!, id: "c1", t: [14, 20] as [number, number], at: at("counter") },
    ];
    const { byId, flagsOf } = run({ ...robberyGraph, events } as EventGraph);
    const e11 = byId("e11");
    const c1 = byId("c1");
    const travel = Math.hypot(e11.to![0] - c1.at![0], e11.to![2] - c1.at![2]);
    expect(travel / 1.4).toBeGreaterThan(14 - (8 + e11.pathLengthM / 1.4));
    expect(c1.tStart - e11.tEnd).toBeGreaterThanOrEqual(travel / 1.4 - 1e-6);
    expect(flagsOf("c1").filter((f) => f.check === "time_distance")).toEqual([]);
  });

  test("an estimated run cannot swallow the estimated event after it", () => {
    const spot = (id: string, over: Partial<Event>): Event =>
      ({ ...robberyGraph.events.find((e) => e.id === "e3")!, id, actor: "witness", ...over }) as Event;
    const events = [
      spot("s0", { at: at("front_door"), t: [0, 10], tConfidence: "stated" }),
      walk({ id: "x1", action: "run", from: at("front_door"), to: at("back_door"), t: [10, 11] }),
      spot("x2", { action: "crouch", at: at("back_door"), t: [11, 13], tConfidence: "inferred" }),
    ];
    const { verdict, byId, flagsOf } = run({ ...robberyGraph, events } as EventGraph);
    const run1 = byId("x1");
    const crouch = byId("x2");
    expect(run1.tEnd).toBeLessThanOrEqual(crouch.tStart);
    expect(run1.tStart).toBeGreaterThanOrEqual(10);
    expect([crouch.tStart, crouch.tEnd]).toEqual([11, 13]);
    expect(verdict.statuses.x2).not.toBe("implausible");
    expect(flagsOf("x2").filter((f) => f.severity === "hard")).toEqual([]);
    expect(run1.tInferred).toBe(true);
    expect(flagsOf("x1").filter((f) => f.severity === "hard")).toEqual([]);
    expect(verdict.statuses.x1).not.toBe("implausible");
  });

  test("a stated event that starts when the walk does bounds the start, and one ending at the walk's end bounds the end", () => {
    const events = [
      { ...robberyGraph.events.find((e) => e.id === "e3")!, id: "s1", t: [8, 9] as [number, number] },
      walk({ t: [8, 10] }),
      { ...robberyGraph.events.find((e) => e.id === "e5")!, t: [10, 12] as [number, number], at: at("window_front") },
    ];
    const { byId } = run({ ...robberyGraph, events } as EventGraph);
    expect(byId("e11").tStart).toBe(8);
    expect(byId("e11").tEnd).toBe(10);
  });

  describe("a walk whose own interval already overlaps a dated event is never stretched", () => {
    const others = robberyGraph.events.filter((e) => e.actor !== "witness");
    const stand = { ...robberyGraph.events.find((e) => e.id === "e3")!, id: "s0", at: at("front_door"), t: [0, 2] as [number, number] };
    const look = (t: [number, number]) => {
      const { at: _at, ...rest } = robberyGraph.events.find((e) => e.id === "e5")!;
      return { ...rest, id: "l1", t } as Event;
    };
    const graphWith = (lookT: [number, number], confidence: "inferred" | "stated") =>
      ({
        ...robberyGraph,
        events: [...others, stand, walk({ from: at("front_door"), t: [8, 9], tConfidence: confidence }), look(lookT)],
      }) as EventGraph;

    test("a look over the same interval keeps its verdict and stays plausible", () => {
      const inferred = run(graphWith([8, 9], "inferred"));
      expect([inferred.byId("e11").tStart, inferred.byId("e11").tEnd]).toEqual([8, 9]);
      expect(inferred.verdict.statuses.l1).toBe("plausible");
      expect(inferred.flagsOf("l1").filter((f) => f.check === "sightline")).toEqual([]);
      expect(inferred.flagsOf("e11").filter((f) => f.severity === "hard")).toEqual([]);
    });

    for (const [name, lookT] of [
      ["a look that starts first", [7.5, 9]],
      ["a look that starts inside the walk", [8.5, 9.5]],
    ] as const) {
      test(`${name} sees from where the unstretched walk puts the witness`, () => {
        const inferred = run(graphWith([...lookT], "inferred"));
        const stated = run(graphWith([...lookT], "stated"));
        expect([inferred.byId("e11").tStart, inferred.byId("e11").tEnd]).toEqual([8, 9]);
        expect(inferred.verdict.statuses.l1).toBe(stated.verdict.statuses.l1);
        expect(inferred.flagsOf("l1")).toEqual(stated.flagsOf("l1"));
      });
    }
  });

  test("the start never stretches back over an untimed event just before the walk", () => {
    const base = robberyGraph.events.find((e) => e.id === "e3")!;
    const events = [
      { ...base, id: "s0", t: [0, 4] as [number, number] },
      { ...base, id: "s1", t: undefined, tConfidence: "inferred" } as unknown as Event,
      walk({ t: [7, 8] }),
      { ...robberyGraph.events.find((e) => e.id === "e5")!, t: [8, 12] as [number, number], at: at("window_front") },
    ];
    const { byId } = run({ ...robberyGraph, events } as EventGraph);
    const untimedEnd = byId("s1").tEnd;
    expect(untimedEnd).toBeGreaterThan(4);
    expect(byId("e11").tEnd).toBe(8);
    expect(byId("e11").tStart).toBeLessThan(7);
    expect(byId("e11").tStart).toBeGreaterThanOrEqual(untimedEnd);
  });

  test("when the reserve does not fit, the end is not stretched toward the next event", () => {
    const events = [
      { ...robberyGraph.events.find((e) => e.id === "e3")!, t: [0, 8] as [number, number] },
      walk({ t: [8, 10] }),
      { ...robberyGraph.events.find((e) => e.id === "e9")!, id: "c1", t: [11, 20] as [number, number], at: at("counter") },
    ];
    const { verdict, byId } = run({ ...robberyGraph, events } as EventGraph);
    expect([byId("e11").tStart, byId("e11").tEnd]).toEqual([8, 10]);
    expect(byId("e11").tInferred).toBe(true);
    expect(verdict.statuses.c1).not.toBe("implausible");
  });
});
