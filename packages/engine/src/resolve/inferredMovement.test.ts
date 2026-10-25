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

const template = (id: string) => robberyGraph.events.find((e) => e.id === id)!;

const dated = (id: string, from: string, over: Partial<Event>): Event => ({ ...template(from), id, ...over }) as Event;

const lookWithoutPlace = (id: string, over: Partial<Event>): Event => {
  const { at: _at, ...rest } = template("e5");
  return { ...rest, id, ...over } as Event;
};

const run = (graph: EventGraph) => {
  const resolved = resolve(graph, storeScene);
  const verdict = gate(resolved, storeScene, { meshes: [] });
  const byId = (id: string) => resolved.events.find((e) => e.id === id)!;
  const flagsOf = (id: string) => verdict.flags.filter((f) => f.eventId === id);
  return { resolved, verdict, byId, flagsOf };
};

const allStated = (graph: EventGraph): EventGraph => ({
  ...graph,
  events: graph.events.map((e) => ({ ...e, tConfidence: "stated" })),
});

const mcfix1 = (walkEvent: Event): EventGraph => {
  const events = robberyGraph.events.map((e) => {
    if (e.id === "e3") return { ...e, t: [0, 8] as [number, number] };
    if (e.id === "e5") return { ...e, at: at("window_front") };
    if (e.id === "e9") return { ...e, at: at("window_front") };
    return e;
  });
  return { ...robberyGraph, events: [...events, walkEvent] } as EventGraph;
};

const withoutWitness = robberyGraph.events.filter((e) => e.actor !== "witness");

const repros: Record<string, EventGraph> = {
  mcfix1: mcfix1(walk()),
  "A: an estimated walk then a stated crouch at the counter": {
    ...robberyGraph,
    events: [
      dated("s0", "e3", { t: [0, 8] }),
      walk({ t: [8, 10] }),
      dated("c1", "e9", { t: [12, 20], at: at("counter") }),
    ],
  } as EventGraph,
  "B: an estimated run then an estimated crouch": {
    ...robberyGraph,
    events: [
      dated("s0", "e3", { at: at("front_door"), t: [0, 10] }),
      walk({ id: "x1", action: "run", from: at("front_door"), to: at("back_door"), t: [10, 11] }),
      dated("x2", "e9", { at: at("back_door"), t: [11, 13], tConfidence: "inferred" }),
    ],
  } as EventGraph,
  ...Object.fromEntries(
    (
      [
        ["C: a stated look over the estimated walk", [8, 9]],
        ["C: a stated look that starts first", [7.5, 9]],
        ["C: a stated look that starts inside the walk", [8.5, 9.5]],
      ] as const
    ).map(([name, lookT]) => [
      name,
      {
        ...robberyGraph,
        events: [
          ...withoutWitness,
          dated("s0", "e3", { at: at("front_door"), t: [0, 2] }),
          walk({ from: at("front_door"), t: [8, 9] }),
          lookWithoutPlace("l1", { t: [...lookT] }),
        ],
      } as EventGraph,
    ]),
  ),
  "cross-actor: a stated look at the suspect's estimated walk": {
    ...robberyGraph,
    events: [
      ...robberyGraph.events.filter((e) => e.actor !== "witness" && e.id !== "e10"),
      walk({ id: "x1", actor: "suspect", from: at("front_door"), to: at("counter"), t: [19.5, 20.5] }),
      dated("l1", "e5", { at: at("back_door"), t: [19.5, 21.5] }),
    ],
  } as EventGraph,
};

describe("inferred movement keeps its time and is only softened", () => {
  test("mcfix1: e11 keeps 8-10, is estimated with soft flags and proposed; e5 stays plausible from the window", () => {
    const { verdict, byId, flagsOf } = run(repros.mcfix1!);
    const e11 = byId("e11");
    expect([e11.tStart, e11.tEnd]).toEqual([8, 10]);
    expect(e11.pathLengthM).toBeCloseTo(5.7, 0);
    expect(e11.tInferred).toBe(true);
    const timing = flagsOf("e11").filter((f) => f.check === "time_distance");
    expect(timing.length).toBeGreaterThan(0);
    expect(timing.every((f) => f.severity === "soft")).toBe(true);
    expect(flagsOf("e11").filter((f) => f.severity === "hard")).toEqual([]);
    expect(verdict.statuses.e11).toBe("proposed");
    expect(verdict.statuses.e5).toBe("plausible");
    expect(flagsOf("e5").filter((f) => f.check === "sightline")).toEqual([]);
    expect(byId("e5").at).toEqual(storeScene.landmarks.find((l) => l.id === "window_front")!.position);
    expect([byId("e3").tStart, byId("e3").tEnd]).toEqual([0, 8]);
    expect([byId("e5").tStart, byId("e5").tEnd]).toEqual([10, 12]);
    expect([byId("e9").tStart, byId("e9").tEnd]).toEqual([13, 24]);
  });

  test("the same walk with a stated time keeps the hard flag and is implausible", () => {
    const { verdict, byId, flagsOf } = run(mcfix1(walk({ tConfidence: "stated" })));
    expect(byId("e11").tInferred).toBe(false);
    expect(flagsOf("e11").filter((f) => f.check === "time_distance").map((f) => f.severity)).toEqual(["hard"]);
    expect(verdict.statuses.e11).toBe("implausible");
  });

  test("an estimated walk that fits its interval is not marked estimated", () => {
    const { byId, flagsOf } = run({ ...robberyGraph, events: [walk({ t: [30, 40] })] } as EventGraph);
    expect(byId("e11")).toMatchObject({ tStart: 30, tEnd: 40, tInferred: false });
    expect(flagsOf("e11")).toEqual([]);
  });

  test("an estimated run over the run limit is marked estimated and keeps its time", () => {
    const { byId, flagsOf } = run({
      ...robberyGraph,
      events: [walk({ id: "r1", action: "run", from: at("front_door"), to: at("back_door"), t: [30, 31] })],
    } as EventGraph);
    expect(byId("r1")).toMatchObject({ tStart: 30, tEnd: 31, tInferred: true });
    expect(flagsOf("r1").filter((f) => f.check === "time_distance").every((f) => f.severity === "soft")).toBe(true);
  });

  test("a between-event flag is soft when the earlier event's time is estimated", () => {
    const events = [
      dated("s0", "e3", { t: [0, 8] }),
      walk({ t: [8, 10] }),
      dated("c1", "e9", { t: [10.1, 20], at: at("counter") }),
    ];
    const { verdict, byId, flagsOf } = run({ ...robberyGraph, events } as EventGraph);
    expect(byId("e11").tInferred).toBe(true);
    expect(byId("c1").tInferred).toBe(false);
    const between = flagsOf("c1").filter((f) => f.check === "time_distance");
    expect(between.length).toBeGreaterThan(0);
    expect(between.every((f) => f.severity === "soft" && f.evidence.previousEventId === "e11")).toBe(true);
    expect(verdict.statuses.c1).toBe("plausible");
  });

  test("a between-event flag stays hard when both sides are stated", () => {
    const events = [
      dated("s0", "e3", { t: [0, 8] }),
      walk({ t: [8, 8.1], tConfidence: "stated" }),
      dated("c1", "e9", { t: [8.2, 20], at: at("counter") }),
    ];
    const { verdict } = run({ ...robberyGraph, events } as EventGraph);
    expect(verdict.statuses.c1).toBe("implausible");
  });

  for (const [name, graph] of Object.entries(repros)) {
    test(`${name}: times and positions equal main's, and no status gets worse`, () => {
      const now = run(graph);
      const before = run(allStated(graph));
      expect(now.resolved.events.map(({ tInferred: _t, ...rest }) => rest)).toEqual(
        before.resolved.events.map(({ tInferred: _t, ...rest }) => rest),
      );
      for (const e of now.resolved.events) {
        if (before.verdict.statuses[e.id] !== "implausible") expect(now.verdict.statuses[e.id], e.id).not.toBe("implausible");
      }
    });
  }

  test("for random estimated walks, every event's time and position equals the confidence-blind resolve", () => {
    const places = storeScene.landmarks.filter((l) => l.kind !== "zone").map((l) => l.id);
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 200; i++) {
      const start = Math.round(next() * 200) / 10;
      const span = 0.2 + Math.round(next() * 60) / 10;
      const action = next() < 0.5 ? "walk" : "run";
      const from = places[Math.floor(next() * places.length)]!;
      const to = places[Math.floor(next() * places.length)]!;
      const graph = {
        ...robberyGraph,
        events: [
          ...robberyGraph.events,
          walk({ id: "x1", action, actor: next() < 0.5 ? "witness" : "suspect", from: at(from), to: at(to), t: [start, start + span] }),
        ],
      } as EventGraph;
      const now = resolve(graph, storeScene);
      const before = resolve(allStated(graph), storeScene);
      expect(now.events.map(({ tInferred: _t, ...rest }) => rest)).toEqual(before.events.map(({ tInferred: _t, ...rest }) => rest));
    }
  });
});
