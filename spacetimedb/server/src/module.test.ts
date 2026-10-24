import { beforeEach, describe, expect, test } from "vitest";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { Patch } from "@rashomon/schema";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { eventGraphFromRow } from "./convert";
import * as mod from "./index";
import { spacetimedb } from "./tables";

const auth = TestAuth.internal();
const SESSION = "s1";

type Harness = ReturnType<typeof newHarness>;
const newHarness = () => createModuleTestHarness(spacetimedb, mod);

const flag = (id: string, eventId: string, severity: "hard" | "soft" = "hard") => ({
  id,
  eventId,
  check: "sightline",
  severity,
  detail: "the chips shelf blocks the line of sight 2.4 m along a 6.1 m ray",
  evidence: JSON.stringify({ blocker: "shelf_a", distanceM: 2.4 }),
  conflictsWith: undefined,
  suggestedQuestion: "Where exactly were you standing when you saw that?",
});

const eventPatches = (): Patch[] => [
  ...robberyGraph.actors.map((actor): Patch => ({ op: "add_actor", actor })),
  ...robberyGraph.props.map((p): Patch => {
    const { id: _id, ...prop } = p;
    return { op: "add_prop", prop };
  }),
  ...robberyGraph.events.map((e): Patch => {
    const { id: _id, status: _s, flags: _f, ...event } = e;
    return { op: "add_event", event };
  }),
];

let h: Harness;
const run = <T>(body: Parameters<Harness["withReducerTx"]>[1] & ((ctx: never) => T)) =>
  h.withReducerTx(auth, body as never) as T;

const call = (fn: (ctx: Parameters<Parameters<Harness["withReducerTx"]>[1]>[0]) => unknown) =>
  h.withReducerTx(auth, fn as never);

const apply = (patches: Patch[], baseVersion: number) =>
  call((ctx) => mod.applyPatches(ctx, { sessionId: SESSION, baseVersion, patchesJson: JSON.stringify(patches) }));

const graph = () =>
  eventGraphFromRow(
    mod.graphForScene(h.anonymousViewContext(), { sessionId: SESSION }) as never,
  );

const eventRow = (id: string) =>
  h.db.events.rowKey.find(`${SESSION}/${id}`);

beforeEach(() => {
  h = newHarness();
  call((ctx) => mod.createSession(ctx, { id: SESSION, sceneId: robberyGraph.sceneId }));
});

describe("insertSegment", () => {
  const segment: Parameters<typeof mod.insertSegment>[1] = {
    id: "seg1",
    sessionId: SESSION,
    witnessId: "w1",
    speaker: "witness",
    text: "He came in through the front door.",
    tStart: 0,
    tEnd: 4,
    source: "live",
    supersedes: undefined,
    utterances: [{ id: "utt_1", text: "He came in through the front door.", tStart: 0, tEnd: 4 }],
  };
  const insert = (over: Partial<typeof segment> = {}) =>
    call((ctx) => mod.insertSegment(ctx, { ...segment, ...over }));

  test("stores the segment and its utterances", () => {
    insert();
    expect(h.db.segments.id.find("seg1")).toMatchObject({ sessionId: SESSION, speaker: "witness", tEnd: 4 });
    expect(h.db.utterances.rowKey.find(`${SESSION}/utt_1`)).toMatchObject({ segmentId: "seg1", text: expect.any(String) });
  });

  test("rejects an unknown session, a bad speaker or source, a reversed interval and an empty text", () => {
    expect(() => insert({ sessionId: "nope" })).toThrow(/unknown session/);
    expect(() => insert({ speaker: "narrator" })).toThrow(/speaker/);
    expect(() => insert({ source: "telepathy" })).toThrow(/source/);
    expect(() => insert({ tStart: 5, tEnd: 1 })).toThrow(/after its end/);
    expect(() => insert({ text: "  " })).toThrow(/text/);
  });

  test("rejects a duplicate id and a supersedes that does not exist, and leaves nothing behind", () => {
    insert();
    expect(() => insert()).toThrow(/already exists/);
    expect(() => insert({ id: "seg2", supersedes: "ghost", utterances: [] })).toThrow(/unknown segment/);
    expect(h.db.segments.id.find("seg2")).toBeNull();
    insert({ id: "seg3", supersedes: "seg1", utterances: [] });
    expect(h.db.segments.id.find("seg3")?.supersedes).toBe("seg1");
  });

  test("a duplicate utterance id rolls the whole reducer back", () => {
    const utterances = [segment.utterances[0]!, segment.utterances[0]!];
    expect(() => insert({ utterances })).toThrow(/utterance/);
    expect(h.db.segments.id.find("seg1")).toBeNull();
  });
});

describe("applyPatches", () => {
  test("the robbery fixture round-trips through the tables and graphForScene", () => {
    apply(eventPatches(), 0);
    const g = graph();
    expect(g.sceneId).toBe(robberyGraph.sceneId);
    expect(g.version).toBe(1);
    expect(g.actors).toEqual(robberyGraph.actors);
    expect(g.events).toEqual(
      robberyGraph.events.map((e) => ({ ...e, status: "proposed", flags: [] })),
    );
    expect(g.props.map(({ id: _id, ...p }) => p)).toEqual(
      robberyGraph.props.map(({ id: _id, ...p }) => p),
    );
  });

  test("records every patch in the log with the version it produced", () => {
    apply(eventPatches(), 0);
    const rows = [...h.db.patches.iter()];
    expect(rows).toHaveLength(eventPatches().length);
    expect(rows.every((r) => r.baseVersion === 0 && r.appliedVersion === 1)).toBe(true);
    expect(rows.map((r) => r.op).slice(0, 3)).toEqual(["add_actor", "add_actor", "add_actor"]);
  });

  test("refuses a stale baseVersion and changes nothing", () => {
    apply(eventPatches(), 0);
    expect(() => apply([{ op: "add_actor", actor: { id: "x", label: "X", role: "other", rig: "mixamo_ybot" } }], 0)).toThrow(/stale/);
    expect(graph().version).toBe(1);
    expect(graph().actors).toHaveLength(robberyGraph.actors.length);
  });

  test("a bad patch rolls back the whole batch", () => {
    const good: Patch = { op: "add_actor", actor: { id: "x", label: "X", role: "other", rig: "mixamo_ybot" } };
    const bad = { op: "retract_event", id: "e404", sources: ["utt_9"] } as Patch;
    expect(() => apply([good, bad], 0)).toThrow(/unknown event/);
    expect(graph().actors).toEqual([]);
    expect(graph().version).toBe(0);
  });

  test("validates events: sources never empty, known action, interval in order, confidence in range", () => {
    const base = robberyGraph.events[0]!;
    const { id: _id, status: _s, flags: _f, ...event } = base;
    const add = (e: object) => apply([{ op: "add_event", event: e as never }], 0);
    expect(() => add({ ...event, sources: [] })).toThrow(/sources/);
    expect(() => add({ ...event, action: "teleport" })).toThrow(/action/);
    expect(() => add({ ...event, t: [5, 1] })).toThrow(/after its end/);
    expect(() => add({ ...event, confidence: 1.5 })).toThrow(/confidence/);
    expect(() => add({ ...event, from: { kind: "at" } })).toThrow(/landmark/);
    expect(graph().events).toEqual([]);
  });

  test("accepts the schema's behind anchor", () => {
    const { id: _id, status: _s, flags: _f, ...event } = robberyGraph.events[0]!;
    apply([{ op: "add_event", event: { ...event, to: { kind: "behind", landmark: "counter" } } }], 0);
    expect(graph().events[0]?.to).toEqual({ kind: "behind", landmark: "counter" });
  });

  test("update_event merges changes, unions sources and puts the event back to proposed", () => {
    apply(eventPatches(), 0);
    call((ctx) =>
      mod.setStatuses(ctx, { sessionId: SESSION, statuses: [{ eventId: "e5", status: "plausible" }], flags: [] }),
    );
    apply(
      [
        {
          op: "update_event",
          id: "e5",
          changes: { at: { kind: "at", landmark: "window_front" } },
          sources: ["utt_12"],
        },
      ],
      1,
    );
    const e5 = graph().events.find((e) => e.id === "e5")!;
    expect(e5.at).toEqual({ kind: "at", landmark: "window_front" });
    expect(e5.sources).toEqual(["utt_6", "utt_7", "utt_12"]);
    expect(e5.status).toBe("proposed");
    expect(e5.target).toBe("suspect");
  });

  test("the fixture's correctionPatch applies cleanly on top of the graph", () => {
    apply(eventPatches(), 0);
    const { patches } = (robberyGraph as unknown as { correctionPatch: { patches: Patch[] } }).correctionPatch;
    apply(patches, 1);
    const g = graph();
    expect(g.version).toBe(2);
    expect(g.events).toHaveLength(robberyGraph.events.length + 1);
    expect(g.events.at(-1)).toMatchObject({ id: "e11", action: "walk", status: "proposed" });
    expect(g.events.find((e) => e.id === "e3")?.t).toEqual([0, 9]);
  });

  test("retract_event marks the event superseded and it can no longer be updated", () => {
    apply(eventPatches(), 0);
    apply([{ op: "retract_event", id: "e9", sources: ["utt_12"] }], 1);
    expect(graph().events.find((e) => e.id === "e9")?.status).toBe("superseded");
    expect(() =>
      apply([{ op: "update_event", id: "e9", changes: { confidence: 0.5 }, sources: ["utt_13"] }], 2),
    ).toThrow(/retracted/);
  });

  test("update_prop merges and add_actor refuses a duplicate", () => {
    apply(eventPatches(), 0);
    apply([{ op: "update_prop", id: "p2", changes: { notes: "a paring knife" }, sources: ["utt_13"] }], 1);
    expect(graph().props[1]).toMatchObject({ id: "p2", notes: "a paring knife", sources: ["utt_5", "utt_13"] });
    expect(() =>
      apply([{ op: "add_actor", actor: robberyGraph.actors[0]! }], 2),
    ).toThrow(/already exists/);
  });
});

describe("override", () => {
  const gated = () => {
    apply(eventPatches(), 0);
    call((ctx) =>
      mod.setStatuses(ctx, {
        sessionId: SESSION,
        statuses: [
          { eventId: "e5", status: "implausible" },
          { eventId: "e1", status: "plausible" },
        ],
        flags: [flag("sightline:e5", "e5")],
      }),
    );
  };
  const override = (over: Partial<{ eventId: string; reason: string; by: string }> = {}) =>
    call((ctx) =>
      mod.override(ctx, {
        sessionId: SESSION,
        eventId: "e5",
        reason: "Investigator measured the aisle and the shelf is 1.2 m",
        by: "investigator:u1",
        ...over,
      }),
    );

  test("sets overridden and records who, why, when and which hard flags", () => {
    gated();
    h.clock.set(h.clock.now());
    override();
    const e5 = graph().events.find((e) => e.id === "e5")!;
    expect(e5.status).toBe("overridden");
    expect(e5.override).toMatchObject({
      by: "investigator:u1",
      reason: "Investigator measured the aisle and the shelf is 1.2 m",
      flagIds: ["sightline:e5"],
    });
    expect(typeof e5.override?.at).toBe("number");
  });

  test("a reason under 10 characters is refused, counting trimmed text", () => {
    gated();
    expect(() => override({ reason: "too short" })).toThrow(/at least 10/);
    expect(() => override({ reason: "   short   " })).toThrow(/at least 10/);
    expect(() => override({ reason: "" })).toThrow(/at least 10/);
    expect(eventRow("e5")?.status).toBe("implausible");
    override({ reason: "exactly 10" });
    expect(eventRow("e5")?.status).toBe("overridden");
  });

  test("only implausible events can be overridden, and a name is required", () => {
    gated();
    expect(() => override({ eventId: "e1" })).toThrow(/only implausible/);
    expect(() => override({ eventId: "e404" })).toThrow(/unknown event/);
    expect(() => override({ by: " " })).toThrow(/override.by/);
    override();
    expect(() => override()).toThrow(/only implausible/);
  });

  test("the override patch op goes through the same reason check", () => {
    gated();
    expect(() => apply([{ op: "override", id: "e5", reason: "nope", by: "u1" }], 1)).toThrow(/at least 10/);
    apply([{ op: "override", id: "e5", reason: "a written reason of some length", by: "u1" }], 1);
    expect(eventRow("e5")?.status).toBe("overridden");
  });

  test("a time-only change keeps the override; any other change clears it", () => {
    gated();
    override();
    apply([{ op: "update_event", id: "e5", changes: { t: [10, 13] }, sources: ["utt_14"] }], 1);
    expect(graph().events.find((e) => e.id === "e5")).toMatchObject({ status: "overridden" });
    apply(
      [{ op: "update_event", id: "e5", changes: { at: { kind: "at", landmark: "window_front" } }, sources: ["utt_15"] }],
      2,
    );
    const e5 = graph().events.find((e) => e.id === "e5")!;
    expect(e5.status).toBe("proposed");
    expect(e5.override).toBeUndefined();
  });
});

describe("setStatuses", () => {
  beforeEach(() => apply(eventPatches(), 0));
  const set = (statuses: { eventId: string; status: string }[], flags: ReturnType<typeof flag>[] = []) =>
    call((ctx) => mod.setStatuses(ctx, { sessionId: SESSION, statuses, flags }));

  test("writes statuses and flags, and the view attaches each flag to its event", () => {
    set(
      robberyGraph.events.map((e) => ({ eventId: e.id, status: e.id === "e5" ? "implausible" : "plausible" })),
      [flag("sightline:e5", "e5")],
    );
    const g = graph();
    expect(g.events.filter((e) => e.status === "plausible")).toHaveLength(9);
    const e5 = g.events.find((e) => e.id === "e5")!;
    expect(e5.status).toBe("implausible");
    expect(e5.flags).toEqual([
      {
        id: "sightline:e5",
        eventId: "e5",
        check: "sightline",
        severity: "hard",
        detail: expect.stringContaining("chips shelf"),
        evidence: { blocker: "shelf_a", distanceM: 2.4 },
        suggestedQuestion: expect.any(String),
      },
    ]);
    expect(g.events.filter((e) => e.flags.length)).toHaveLength(1);
  });

  test("a new run replaces the earlier flags", () => {
    set([{ eventId: "e5", status: "implausible" }], [flag("sightline:e5", "e5")]);
    set([{ eventId: "e5", status: "plausible" }], []);
    expect(graph().events.find((e) => e.id === "e5")).toMatchObject({ status: "plausible", flags: [] });
    expect([...h.db.flags.iter()]).toEqual([]);
  });

  test("a hard flag on an event that is not implausible is refused", () => {
    expect(() => set([{ eventId: "e5", status: "plausible" }], [flag("sightline:e5", "e5")])).toThrow(/hard flag/);
    expect(() => set([], [flag("sightline:e5", "e5")])).toThrow(/hard flag/);
    set([{ eventId: "e5", status: "plausible" }], [flag("sightline:e5", "e5", "soft")]);
    expect(eventRow("e5")?.status).toBe("plausible");
  });

  test("a gate run cannot create overridden or superseded", () => {
    expect(() => set([{ eventId: "e5", status: "overridden" }])).toThrow(/cannot set overridden/);
    expect(() => set([{ eventId: "e5", status: "superseded" }])).toThrow(/cannot set superseded/);
    expect(() => set([{ eventId: "e5", status: "approved" }])).toThrow(/status/);
    expect(eventRow("e5")?.status).toBe("proposed");
  });

  test("overridden and superseded events keep their status through a gate run", () => {
    set([{ eventId: "e5", status: "implausible" }], [flag("sightline:e5", "e5")]);
    call((ctx) =>
      mod.override(ctx, { sessionId: SESSION, eventId: "e5", reason: "written reason here", by: "u1" }),
    );
    apply([{ op: "retract_event", id: "e9", sources: ["utt_12"] }], 1);
    set(
      [
        { eventId: "e5", status: "overridden" },
        { eventId: "e9", status: "superseded" },
      ],
      [flag("sightline:e5", "e5")],
    );
    expect(eventRow("e5")?.status).toBe("overridden");
    expect(eventRow("e9")?.status).toBe("superseded");
    expect(() => set([{ eventId: "e5", status: "plausible" }])).toThrow(/cannot be changed/);
    expect(() => set([{ eventId: "e9", status: "plausible" }])).toThrow(/cannot be changed/);
  });

  test("an unknown event, a bad flag and a duplicate flag id are refused and nothing is written", () => {
    expect(() => set([{ eventId: "e404", status: "plausible" }])).toThrow(/unknown event/);
    expect(() => set([], [flag("x", "e404", "soft")])).toThrow(/unknown event/);
    expect(() => set([], [{ ...flag("x", "e1", "soft"), check: "vibes" }])).toThrow(/check/);
    expect(() => set([], [{ ...flag("x", "e1", "soft"), evidence: "[1]" }])).toThrow(/evidence/);
    expect(() => set([], [flag("x", "e1", "soft"), flag("x", "e2", "soft")])).toThrow(/duplicate/);
    expect([...h.db.flags.iter()]).toEqual([]);
  });
});

describe("graphForScene", () => {
  test("is empty for an unknown session and scoped to its own session", () => {
    expect(mod.graphForScene(h.anonymousViewContext(), { sessionId: "nope" })).toBeUndefined();
    call((ctx) => mod.createSession(ctx, { id: "s2", sceneId: "store_v1" }));
    apply(eventPatches(), 0);
    const other = mod.graphForScene(h.anonymousViewContext(), { sessionId: "s2" }) as never as { events: unknown[] };
    expect(other.events).toEqual([]);
    expect(graph().events).toHaveLength(robberyGraph.events.length);
  });

  test("createSession refuses a duplicate", () => {
    expect(() => call((ctx) => mod.createSession(ctx, { id: SESSION, sceneId: "store_v1" }))).toThrow(/already exists/);
  });
});
