import { beforeEach, describe, expect, test } from "vitest";
import { ConnectionId } from "spacetimedb";
import { TestAuth, createModuleTestHarness } from "spacetimedb/server/test-utils";
import type { Patch } from "@rashomon/schema";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { eventGraphFromRow } from "./convert";
import * as mod from "./index";
import { spacetimedb } from "./tables";

const auth = TestAuth.internal();
const stranger = TestAuth.fromJwtPayload(JSON.stringify({ iss: "https://example.test", sub: "stranger" }), ConnectionId.random());
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
  ...robberyGraph.props.map((prop): Patch => ({ op: "add_prop", prop })),
  ...robberyGraph.events.map((e): Patch => {
    const { status: _s, flags: _f, ...event } = e;
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
    expect(h.db.segments.rowKey.find(`${SESSION}/seg1`)).toMatchObject({ sessionId: SESSION, speaker: "witness", tEnd: 4 });
    expect(h.db.utterances.rowKey.find(`${SESSION}/utt_1`)).toMatchObject({ segmentKey: `${SESSION}/seg1`, text: expect.any(String) });
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
    expect(h.db.segments.rowKey.find(`${SESSION}/seg2`)).toBeNull();
    insert({ id: "seg3", supersedes: "seg1", utterances: [] });
    expect(h.db.segments.rowKey.find(`${SESSION}/seg3`)?.supersedes).toBe("seg1");
  });

  test("two sessions can each insert seg1 and stay separate", () => {
    call((ctx) => mod.createSession(ctx, { id: "s2", sceneId: "store_v1" }));
    insert();
    insert({ sessionId: "s2", text: "Second session.", utterances: [{ id: "utt_1", text: "Second session.", tStart: 0, tEnd: 4 }] });
    expect(() => insert()).toThrow(/already exists/);
    expect(h.db.segments.rowKey.find(`${SESSION}/seg1`)).toMatchObject({ sessionId: SESSION, text: segment.text });
    expect(h.db.segments.rowKey.find("s2/seg1")).toMatchObject({ sessionId: "s2", text: "Second session." });
    expect(h.db.utterances.rowKey.find(`${SESSION}/utt_1`)).toMatchObject({ segmentKey: `${SESSION}/seg1`, text: segment.text });
    expect(h.db.utterances.rowKey.find("s2/utt_1")).toMatchObject({ segmentKey: "s2/seg1", text: "Second session." });
    expect([...h.db.segments.sessionId.filter("s2")]).toHaveLength(1);
    expect([...h.db.utterances.segmentKey.filter(`${SESSION}/seg1`)]).toHaveLength(1);
    expect(() => insert({ id: "seg9", sessionId: "s2", supersedes: "seg1/x", utterances: [] })).toThrow(/"\/"/);
    insert({ id: "seg2", sessionId: "s2", supersedes: "seg1", utterances: [] });
    expect(h.db.segments.rowKey.find("s2/seg2")?.supersedes).toBe("seg1");
  });

  test("a supersedes from another session is unknown", () => {
    call((ctx) => mod.createSession(ctx, { id: "s2", sceneId: "store_v1" }));
    insert();
    expect(() => insert({ id: "seg2", sessionId: "s2", supersedes: "seg1", utterances: [] })).toThrow(/unknown segment/);
  });

  test("a duplicate utterance id rolls the whole reducer back", () => {
    const utterances = [segment.utterances[0]!, segment.utterances[0]!];
    expect(() => insert({ utterances })).toThrow(/utterance/);
    expect(h.db.segments.rowKey.find(`${SESSION}/seg1`)).toBeNull();
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
    expect(g.props).toEqual(robberyGraph.props);
    const e6 = g.events.find((e) => e.id === "e6")!;
    expect(g.props.map((p) => p.id)).toContain(e6.prop);
    expect(e6.prop).toBe("p_knife");
  });

  test("the fixture round-trips through insertSegment, applyPatches and graphForScene", () => {
    call((ctx) =>
      mod.insertSegment(ctx, {
        id: "seg1",
        sessionId: SESSION,
        witnessId: "w1",
        speaker: "witness",
        text: "He took the knife.",
        tStart: 0,
        tEnd: 4,
        source: "live",
        supersedes: undefined,
        utterances: [{ id: "utt_1", text: "He took the knife.", tStart: 0, tEnd: 4 }],
      }),
    );
    apply(eventPatches(), 0);
    const g = graph();
    expect(g).toEqual({
      sceneId: robberyGraph.sceneId,
      actors: robberyGraph.actors,
      events: robberyGraph.events.map((e) => ({ ...e, status: "proposed", flags: [] })),
      props: robberyGraph.props,
      version: 1,
    });
  });

  test("an add_event or add_prop without an id gets a generated one, and a duplicate id is refused", () => {
    apply(eventPatches(), 0);
    const { id: _i, status: _s, flags: _f, ...event } = robberyGraph.events[0]!;
    const { id: _p, ...prop } = robberyGraph.props[0]!;
    apply([{ op: "add_event", event }, { op: "add_prop", prop }], 1);
    const g = graph();
    expect(g.events.at(-1)?.id).toBe("e11");
    expect(g.props.at(-1)?.id).toBe("p3");
    expect(() => apply([{ op: "add_prop", prop: { ...prop, id: "p_knife" } as never }], 2)).toThrow(/already exists/);
    expect(() => apply([{ op: "add_event", event: { ...event, id: "e1" } as never }], 2)).toThrow(/already exists/);
    expect(() =>
      apply(
        [
          { op: "add_prop", prop: { ...prop, id: "p_new" } as never },
          { op: "add_prop", prop: { ...prop, id: "p_new" } as never },
        ],
        2,
      ),
    ).toThrow(/already exists/);
  });

  test("a dangling actor, target or prop rejects the batch and rolls it back", () => {
    apply(eventPatches(), 0);
    const { id: _i, status: _s, flags: _f, ...event } = robberyGraph.events[0]!;
    expect(() => apply([{ op: "add_event", event: { ...event, actor: "ghost" } }], 1)).toThrow(/unknown actor ghost/);
    expect(() => apply([{ op: "add_event", event: { ...event, target: "ghost" } }], 1)).toThrow(/unknown target ghost/);
    expect(() => apply([{ op: "add_event", event: { ...event, prop: "p_ghost" } }], 1)).toThrow(/unknown prop p_ghost/);
    expect(() => apply([{ op: "update_event", id: "e6", changes: { prop: "p_ghost" }, sources: ["utt_1"] }], 1)).toThrow(
      /unknown prop/,
    );
    expect(graph().version).toBe(1);
    expect(graph().events).toHaveLength(robberyGraph.events.length);
  });

  test("a batch may add an actor, a prop and the event that uses them together", () => {
    const { id: _i, status: _s, flags: _f, ...event } = robberyGraph.events[0]!;
    apply(
      [
        { op: "add_event", event: { ...event, actor: "guard", target: "guard", prop: "p_bat" } },
        { op: "add_actor", actor: { id: "guard", label: "Guard", role: "other", rig: "mixamo_ybot" } },
        { op: "add_prop", prop: { ...robberyGraph.props[1]!, id: "p_bat" } as never },
      ],
      0,
    );
    expect(graph().events[0]).toMatchObject({ actor: "guard", target: "guard", prop: "p_bat" });
  });

  test("session and entity ids may not contain a slash", () => {
    expect(() => call((ctx) => mod.createSession(ctx, { id: "a/b", sceneId: "store_v1" }))).toThrow(/"\/"/);
    expect(() => apply([{ op: "add_actor", actor: { id: "x/y", label: "X", role: "other", rig: "mixamo_ybot" } }], 0)).toThrow(
      /"\/"/,
    );
    const { id: _i, status: _s, flags: _f, ...event } = robberyGraph.events[0]!;
    expect(() => apply([{ op: "add_event", event: { ...event, id: "b/e1" } as never }], 0)).toThrow(/"\/"/);
    expect(() => apply([{ op: "add_prop", prop: { ...robberyGraph.props[0]!, id: "b/p1" } as never }], 0)).toThrow(/"\/"/);
  });

  test("a patch for one session cannot reach another session's rows", () => {
    call((ctx) => mod.createSession(ctx, { id: "a", sceneId: "store_v1" }));
    apply(eventPatches(), 0);
    const other = (patches: Patch[]) =>
      call((ctx) => mod.applyPatches(ctx, { sessionId: "a", baseVersion: 0, patchesJson: JSON.stringify(patches) }));
    expect(() => other([{ op: "retract_event", id: "e1", sources: ["utt_1"] }])).toThrow(/unknown event/);
    expect(() => other([{ op: "update_prop", id: "p_knife", changes: { notes: "x" }, sources: ["utt_1"] }])).toThrow(
      /unknown prop/,
    );
    expect(() => other([{ op: "retract_event", id: `${SESSION}/e1`, sources: ["utt_1"] }])).toThrow(/"\/"/);
    expect(() => other([{ op: "update_prop", id: `${SESSION}/p_knife`, changes: { notes: "x" }, sources: ["utt_1"] }])).toThrow(
      /"\/"/,
    );
    expect(eventRow("e1")?.status).toBe("proposed");
    expect(h.db.props.rowKey.find(`${SESSION}/p_knife`)?.notes).not.toBe("x");
  });

  test("a row whose sessionId differs from the call's session is never reached through its key", () => {
    call((ctx) => mod.createSession(ctx, { id: "a", sceneId: "store_v1" }));
    apply(eventPatches(), 0);
    const row = h.db.events.rowKey.find(`${SESSION}/e1`)!;
    call((ctx) => ctx.db.events.rowKey.update({ ...row, sessionId: "a" }));
    expect(() => apply([{ op: "retract_event", id: "e1", sources: ["utt_1"] }], 1)).toThrow(/unknown event/);
    const prop = h.db.props.rowKey.find(`${SESSION}/p_knife`)!;
    call((ctx) => ctx.db.props.rowKey.update({ ...prop, sessionId: "a" }));
    expect(() => apply([{ op: "update_prop", id: "p_knife", changes: { notes: "x" }, sources: ["utt_1"] }], 1)).toThrow(
      /unknown prop/,
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
    expect(() => add({ ...event, confidence: 0.5 })).toThrow(/0.3, 0.6, 0.9/);
    expect(() => add({ ...event, confidence: 0.95 })).toThrow(/0.3, 0.6, 0.9/);
    expect(() => add({ ...event, from: { kind: "at" } })).toThrow(/landmark/);
    expect(graph().events).toEqual([]);
  });

  test("accepts the schema's behind anchor", () => {
    const { id: _id, status: _s, flags: _f, ...event } = robberyGraph.events[0]!;
    apply(
      [
        ...robberyGraph.actors.map((actor): Patch => ({ op: "add_actor", actor })),
        { op: "add_event", event: { ...event, to: { kind: "behind", landmark: "counter" } } },
      ],
      0,
    );
    expect(graph().events[0]?.to).toEqual({ kind: "behind", landmark: "counter" });
  });

  test("update_event merges changes, unions sources and puts the event back to proposed", () => {
    apply(eventPatches(), 0);
    call((ctx) =>
      mod.setStatuses(ctx, {
        sessionId: SESSION,
        baseVersion: 1,
        statuses: [{ eventId: "e5", status: "plausible" }],
        flags: [],
      }),
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
      apply([{ op: "update_event", id: "e9", changes: { confidence: 0.6 }, sources: ["utt_13"] }], 2),
    ).toThrow(/retracted/);
  });

  test("update_prop merges and add_actor refuses a duplicate", () => {
    apply(eventPatches(), 0);
    apply([{ op: "update_prop", id: "p_knife", changes: { notes: "a paring knife" }, sources: ["utt_13"] }], 1);
    expect(graph().props[1]).toMatchObject({ id: "p_knife", notes: "a paring knife", sources: ["utt_5", "utt_13"] });
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
        baseVersion: 1,
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
    {
      const baseVersion = graph().version;
      return call((ctx) => mod.setStatuses(ctx, { sessionId: SESSION, baseVersion, statuses, flags }));
    };

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

describe("stale gate results", () => {
  test("a setStatuses for an older version is refused and does not overwrite proposed", () => {
    apply(eventPatches(), 0);
    call((ctx) =>
      mod.setStatuses(ctx, {
        sessionId: SESSION,
        baseVersion: 1,
        statuses: [{ eventId: "e5", status: "plausible" }],
        flags: [],
      }),
    );
    apply([{ op: "update_event", id: "e5", changes: { at: { kind: "at", landmark: "window_front" } }, sources: ["utt_12"] }], 1);
    expect(eventRow("e5")?.status).toBe("proposed");
    expect(() =>
      call((ctx) =>
        mod.setStatuses(ctx, {
          sessionId: SESSION,
          baseVersion: 1,
          statuses: [{ eventId: "e5", status: "implausible" }],
          flags: [],
        }),
      ),
    ).toThrow(/stale baseVersion 1/);
    expect(eventRow("e5")?.status).toBe("proposed");
    call((ctx) =>
      mod.setStatuses(ctx, {
        sessionId: SESSION,
        baseVersion: 2,
        statuses: [{ eventId: "e5", status: "plausible" }],
        flags: [],
      }),
    );
    expect(eventRow("e5")?.status).toBe("plausible");
    expect(graph().version).toBe(2);
  });
});

describe("clearing optional fields", () => {
  test("null clears heldBy on a prop and at on an event", () => {
    apply(eventPatches(), 0);
    apply([{ op: "update_prop", id: "p_knife", changes: { heldBy: "suspect" }, sources: ["utt_5"] }], 1);
    expect(graph().props.find((p) => p.id === "p_knife")?.heldBy).toBe("suspect");
    apply([{ op: "update_prop", id: "p_knife", changes: { heldBy: null } as never, sources: ["utt_5"] }], 2);
    expect(graph().props.find((p) => p.id === "p_knife")).not.toHaveProperty("heldBy");

    expect(graph().events.find((e) => e.id === "e5")?.at).toBeDefined();
    apply([{ op: "update_event", id: "e5", changes: { at: null } as never, sources: ["utt_6"] }], 3);
    expect(graph().events.find((e) => e.id === "e5")).not.toHaveProperty("at");
  });

  test("null is refused for required fields", () => {
    apply(eventPatches(), 0);
    expect(() => apply([{ op: "update_event", id: "e5", changes: { actor: null } as never, sources: ["utt_6"] }], 1)).toThrow(/actor/);
    expect(() => apply([{ op: "update_event", id: "e5", changes: { t: null } as never, sources: ["utt_6"] }], 1)).toThrow(/changes.t/);
    expect(() => apply([{ op: "update_prop", id: "p_knife", changes: { anchor: null } as never, sources: ["utt_5"] }], 1)).toThrow(/anchor/);
    expect(() => apply([{ op: "update_prop", id: "p_knife", changes: { type: null } as never, sources: ["utt_5"] }], 1)).toThrow(/type/);
  });
});

describe("retracting an overridden event", () => {
  test("keeps the override row but graphForScene no longer reports it", () => {
    apply(eventPatches(), 0);
    call((ctx) =>
      mod.setStatuses(ctx, {
        sessionId: SESSION,
        baseVersion: 1,
        statuses: [{ eventId: "e5", status: "implausible" }],
        flags: [flag("sightline:e5", "e5")],
      }),
    );
    call((ctx) =>
      mod.override(ctx, { sessionId: SESSION, eventId: "e5", reason: "written reason here", by: "u1" }),
    );
    expect(graph().events.find((e) => e.id === "e5")?.override).toBeDefined();
    apply([{ op: "retract_event", id: "e5", sources: ["utt_12"] }], 1);
    const e5 = graph().events.find((e) => e.id === "e5")!;
    expect(e5.status).toBe("superseded");
    expect(e5.override).toBeUndefined();
    expect(h.db.overrides.rowKey.find(`${SESSION}/e5`)).toMatchObject({ by: "u1" });
  });
});

describe("identity", () => {
  const statusesFor = (who: TestAuth) =>
    h.withReducerTx(who, ((ctx: never) =>
      mod.setStatuses(ctx, {
        sessionId: SESSION,
        baseVersion: 1,
        statuses: [{ eventId: "e5", status: "implausible" }],
        flags: [],
      })) as never);

  test("a stranger's setStatuses is refused and the creator's is accepted", () => {
    apply(eventPatches(), 0);
    expect(() => statusesFor(stranger)).toThrow(/creator/);
    expect(eventRow("e5")?.status).toBe("proposed");
    statusesFor(auth);
    expect(eventRow("e5")?.status).toBe("implausible");
  });

  test("the session's creator can set statuses even when it is not the module", () => {
    const creator = TestAuth.fromJwtPayload(JSON.stringify({ iss: "https://example.test", sub: "creator" }), ConnectionId.random());
    h.withReducerTx(creator, ((ctx: never) => mod.createSession(ctx, { id: "s2", sceneId: "store_v1" })) as never);
    expect(h.db.sessions.id.find("s2")?.creator).not.toBe(h.db.sessions.id.find(SESSION)?.creator);
    h.withReducerTx(creator, ((ctx: never) =>
      mod.setStatuses(ctx, { sessionId: "s2", baseVersion: 0, statuses: [], flags: [] })) as never);
    expect(() =>
      h.withReducerTx(stranger, ((ctx: never) =>
        mod.setStatuses(ctx, { sessionId: "s2", baseVersion: 0, statuses: [], flags: [] })) as never),
    ).toThrow(/creator/);
  });

  test("the module's own identity can set statuses on a session it did not create", () => {
    const creator = TestAuth.fromJwtPayload(JSON.stringify({ iss: "https://example.test", sub: "creator" }), ConnectionId.random());
    h.withReducerTx(creator, ((ctx: never) => mod.createSession(ctx, { id: "s3", sceneId: "store_v1" })) as never);
    const call3 = (who: TestAuth) =>
      h.withReducerTx(who, ((ctx: never) =>
        mod.setStatuses(ctx, { sessionId: "s3", baseVersion: 0, statuses: [], flags: [] })) as never);
    expect(h.db.sessions.id.find("s3")?.creator).not.toBe(h.moduleIdentity.toHexString());
    expect(() => call3(stranger)).toThrow(/creator/);
    expect(() => call3(auth)).not.toThrow();
  });

  test("an override records the sender's identity beside the display name", () => {
    apply(eventPatches(), 0);
    statusesFor(auth);
    h.withReducerTx(stranger, ((ctx: never) =>
      mod.override(ctx, { sessionId: SESSION, eventId: "e5", reason: "written reason here", by: "Investigator Ruiz" })) as never);
    const row = h.db.overrides.rowKey.find(`${SESSION}/e5`)!;
    expect(row.by).toBe("Investigator Ruiz");
    expect(row.sender).toMatch(/^[0-9a-f]{64}$/);
    expect(row.sender).not.toBe(h.db.sessions.id.find(SESSION)?.creator);
    expect(graph().events.find((e) => e.id === "e5")?.override?.by).toBe("Investigator Ruiz");
  });
});
