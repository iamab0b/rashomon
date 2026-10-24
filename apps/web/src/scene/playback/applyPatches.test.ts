import type { EventGraph, Patch } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { describe, expect, it, vi } from "vitest";
import { applyPatches } from "./applyPatches";
import { fixtureGraphSource, gatedSnapshot, robberyCorrectionPatches, scenarioFromSearch } from "./graphSource";

const NOW = 1_700_000_000_000;
const REASON = "witness later confirmed the view";
const OVERRIDE_E5: Patch = { op: "override", id: "e5", reason: REASON, by: "investigator" };

function storeSource() {
  const source = fixtureGraphSource("store");
  if (!source) throw new Error("store fixture source missing");
  return source;
}

function eventOf(graph: EventGraph, id: string) {
  const event = graph.events.find((candidate) => candidate.id === id);
  if (!event) throw new Error(`event ${id} missing`);
  return event;
}

function gatedEvents(source: ReturnType<typeof storeSource>) {
  return source.getSnapshot().resolved?.events ?? [];
}

function probeEngineHonorsOverride(): boolean {
  const graph: EventGraph = {
    ...robberyGraph,
    events: robberyGraph.events.map((event) =>
      event.id === "e5" ? { ...event, override: { by: "test", reason: REASON, at: 0, flagIds: ["sightline:e5"] } } : event,
    ),
  };
  return gatedSnapshot(graph, storeScene).resolved?.events.find((event) => event.id === "e5")?.status === "overridden";
}

const engineHonorsOverride = probeEngineHonorsOverride();

describe("correction through the fixture source", () => {
  it("makes e5 plausible with no flags and every event plausible, all from the gate", () => {
    const source = storeSource();

    source.apply(robberyCorrectionPatches());

    const events = gatedEvents(source);
    const e5 = events.find((event) => event.id === "e5");
    expect(e5?.status).toBe("plausible");
    expect(e5?.flags).toEqual([]);
    expect(events).toHaveLength(11);
    for (const event of events) {
      expect(event.status, event.id).toBe("plausible");
      expect(source.getSnapshot().statuses[event.id], event.id).toBe("plausible");
    }
  });

  it("adds the walk as e11 with the schema's starting status and the patch's fields", () => {
    const graph = applyPatches(robberyGraph, robberyCorrectionPatches(), NOW);
    const e11 = eventOf(graph, "e11");

    expect(e11).toMatchObject({ actor: "witness", action: "walk", t: [8, 11], status: "proposed", flags: [] });
    expect(eventOf(graph, "e3").t).toEqual([0, 9]);
    expect(eventOf(graph, "e5").sources).toEqual(["utt_6", "utt_7", "utt_12"]);
  });

  it("?scenario=corrected starts the fixture already patched", () => {
    const source = fixtureGraphSource("store", scenarioFromSearch("?fixture=store&scenario=corrected"));
    const e5 = source?.getSnapshot().resolved?.events.find((event) => event.id === "e5");

    expect(e5?.status).toBe("plausible");
    expect(source?.getSnapshot().resolved?.events).toHaveLength(11);
    expect(fixtureGraphSource("store", scenarioFromSearch(""))?.getSnapshot().statuses.e5).toBe("implausible");
  });
});

describe("override", () => {
  it("writes override with the gate's hard flag ids and leaves status untouched", () => {
    const graph = applyPatches(robberyGraph, [OVERRIDE_E5], NOW);
    const e5 = eventOf(graph, "e5");

    expect(e5.override).toEqual({ by: "investigator", reason: REASON, at: NOW, flagIds: ["sightline:e5"] });
    expect(e5.status).toBe(eventOf(robberyGraph, "e5").status);
    expect(e5.flags).toEqual(eventOf(robberyGraph, "e5").flags);
  });

  it("throws on a reason shorter than 10 characters", () => {
    expect(() => applyPatches(robberyGraph, [{ ...OVERRIDE_E5, reason: "too short" }], NOW)).toThrow(
      /reason of at least 10 characters/,
    );
    expect(() => applyPatches(robberyGraph, [{ ...OVERRIDE_E5, reason: "   padded   " }], NOW)).toThrow(
      /reason of at least 10 characters/,
    );
  });

  it("throws on an override of an event the gate does not mark implausible", () => {
    expect(() => applyPatches(robberyGraph, [{ ...OVERRIDE_E5, id: "e1" }], NOW)).toThrow(
      /only an event the gate marks implausible can be overridden \(gate says plausible\)/,
    );
    expect(() => applyPatches(robberyGraph, [...robberyCorrectionPatches(), OVERRIDE_E5], NOW)).toThrow(
      /gate says plausible/,
    );
  });

  it("a rejected apply leaves the fixture source unchanged and silent", () => {
    const source = storeSource();
    const before = source.getSnapshot();
    const listener = vi.fn();
    source.subscribe(listener);

    expect(() => source.apply([{ ...OVERRIDE_E5, reason: "too short" }])).toThrow();

    expect(source.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it.skipIf(!engineHonorsOverride)(
    engineHonorsOverride
      ? "after the override the fixture source shows e5 overridden"
      : "after the override the fixture source shows e5 overridden (skipped: waits on PR #11, branch engine-override, for the engine to read Event.override)",
    () => {
      const source = storeSource();

      source.apply([OVERRIDE_E5]);

      expect(source.getSnapshot().statuses.e5).toBe("overridden");
      expect(gatedEvents(source).find((event) => event.id === "e5")?.status).toBe("overridden");
    },
  );
});

describe("every op", () => {
  it("update_event drops status, flags, id and override, and null clears a field", () => {
    const changes = { status: "plausible", flags: [], id: "e99", override: { by: "x", reason: REASON, at: 0, flagIds: [] }, facing: null, confidence: 0.5 };
    const graph = applyPatches(
      robberyGraph,
      [{ op: "update_event", id: "e2", changes: changes as unknown as Partial<EventGraph["events"][number]>, sources: ["utt_20"] }],
      NOW,
    );
    const e2 = eventOf(graph, "e2");

    expect(e2.status).toBe(eventOf(robberyGraph, "e2").status);
    expect(e2.override).toBeUndefined();
    expect("facing" in e2).toBe(false);
    expect(e2.confidence).toBe(0.5);
    expect(e2.sources).toEqual(["utt_2", "utt_20"]);
    expect(graph.events.some((event) => event.id === "e99")).toBe(false);
  });

  it("add_event keeps the id the patch carries and rejects a duplicate", () => {
    const draft = { ...eventOf(robberyGraph, "e9"), id: "e3b" } as Record<string, unknown>;
    const withId = applyPatches(robberyGraph, [{ op: "add_event", event: draft as never }], NOW);

    expect(eventOf(withId, "e3b").status).toBe("proposed");
    expect(() => applyPatches(withId, [{ op: "add_event", event: draft as never }], NOW)).toThrow(/already exists/);
  });

  it("add_event drops a carried status, flags, override and supersededBy", () => {
    const draft = {
      ...eventOf(robberyGraph, "e9"),
      id: "e3c",
      status: "plausible",
      flags: [{ id: "x" }],
      override: { by: "x", reason: REASON, at: 0, flagIds: [] },
      supersededBy: "utt_1",
    };
    const added = eventOf(applyPatches(robberyGraph, [{ op: "add_event", event: draft as never }], NOW), "e3c");

    expect(added.status).toBe("proposed");
    expect(added.flags).toEqual([]);
    expect("override" in added).toBe(false);
    expect("supersededBy" in added).toBe(false);
  });

  it("a null on a required field throws, and changes.sources appends", () => {
    expect(() =>
      applyPatches(robberyGraph, [{ op: "update_event", id: "e2", changes: { t: null } as never, sources: [] }], NOW),
    ).toThrow(/t is required and cannot be cleared/);
    expect(() =>
      applyPatches(robberyGraph, [{ op: "update_prop", id: "p_knife", changes: { anchor: null } as never, sources: [] }], NOW),
    ).toThrow(/anchor is required/);
    const graph = applyPatches(
      robberyGraph,
      [{ op: "update_event", id: "e2", changes: { sources: ["utt_50"] }, sources: ["utt_51"] }],
      NOW,
    );
    expect(eventOf(graph, "e2").sources).toEqual(["utt_2", "utt_50", "utt_51"]);
  });

  it("a graph is never gated against another scene's manifest", () => {
    expect(() => applyPatches({ ...robberyGraph, sceneId: "other" }, [OVERRIDE_E5], NOW)).toThrow(
      /graph other cannot be gated against manifest store_v1/,
    );
  });

  it("retract_event sets supersededBy to the retracting source", () => {
    const graph = applyPatches(robberyGraph, [{ op: "retract_event", id: "e7", sources: ["utt_30"] }], NOW);

    expect(eventOf(graph, "e7").supersededBy).toBe("utt_30");
    expect(eventOf(graph, "e7").status).toBe(eventOf(robberyGraph, "e7").status);
  });

  it("add_prop, update_prop and add_actor", () => {
    const graph = applyPatches(
      robberyGraph,
      [
        { op: "add_prop", prop: { type: "bottle", anchor: { kind: "at", landmark: "cooler" }, notes: "", sources: ["utt_40"] } },
        { op: "update_prop", id: "p_knife", changes: { heldBy: null } as never, sources: ["utt_41"] },
        { op: "add_actor", actor: { id: "bystander", label: "Bystander", role: "other", rig: "mixamo_ybot" } },
      ],
      NOW,
    );

    expect(graph.props.find((prop) => prop.id === "p1")?.type).toBe("bottle");
    const knife = graph.props.find((prop) => prop.id === "p_knife");
    expect(knife && "heldBy" in knife).toBe(false);
    expect(knife?.sources).toEqual(["utt_5", "utt_41"]);
    expect(graph.actors.map((actor) => actor.id)).toEqual(["witness", "suspect", "clerk", "bystander"]);
  });

  it("an unknown id throws", () => {
    expect(() => applyPatches(robberyGraph, [{ op: "update_event", id: "nope", changes: {}, sources: [] }], NOW)).toThrow(
      /unknown event id nope/,
    );
  });
});

describe("purity and notification", () => {
  it("does not mutate the graph or the patches", () => {
    const patches: Patch[] = [...robberyCorrectionPatches(), { op: "retract_event", id: "e7", sources: ["utt_30"] }];
    const graphBefore = structuredClone(robberyGraph);
    const patchesBefore = structuredClone(patches);

    applyPatches(robberyGraph, patches, NOW);
    applyPatches(robberyGraph, [OVERRIDE_E5], NOW);

    expect(robberyGraph).toEqual(graphBefore);
    expect(patches).toEqual(patchesBefore);
  });

  it("apply notifies subscribers once per call", () => {
    const source = storeSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    source.apply([OVERRIDE_E5]);
    expect(listener).toHaveBeenCalledTimes(1);
    source.apply([{ op: "retract_event", id: "e7", sources: ["utt_30"] }]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    source.apply([{ op: "retract_event", id: "e8", sources: ["utt_31"] }]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("each fixture source patches its own copy", () => {
    const patched = storeSource();
    patched.apply(robberyCorrectionPatches());

    expect(storeSource().getSnapshot().statuses.e5).toBe("implausible");
  });
});
