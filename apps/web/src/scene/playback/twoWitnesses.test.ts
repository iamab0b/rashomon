import { robberyClerkPatches, robberyClerkWitness, robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callHook } from "../testing/hookHost";
import { useSceneStore } from "../store";
import { buildActorPlayback } from "./actorPose";
import { applyPatches } from "./applyPatches";
import { fixtureGraphSource, scenarioFromSearch } from "./graphSource";
import { gatedSnapshot } from "./gatedSnapshot";
import { statusOf } from "./useGraph";
import { useWitnessLayers } from "./useWitnessLayers";
import { useGraphActions } from "./useGraphActions";
import { CORRECTION_TEXT } from "./recordedStatements";
import { disagreementEvents, markerShown, witnessLayers } from "./witnessLayers";

const initial = useSceneStore.getState();

afterEach(() => {
  useSceneStore.setState(initial, true);
});

const patched = () => applyPatches(robberyGraph, robberyClerkPatches, 0, storeScene);

const mountTwo = () => {
  const source = fixtureGraphSource("store", "two-witnesses");
  if (!source) throw new Error("two-witnesses source missing");
  useSceneStore.getState().setGraphSource(source);
  useSceneStore.getState().setGraph(source.getSnapshot());
  return source;
};

describe("the clerk's account on the robbery", () => {
  it("makes the contradiction rule fire on the w2 cooler event and on w1's e6 or e7, and leaves e5's sightline alone", () => {
    const { resolved } = gatedSnapshot(patched(), storeScene);
    const events = resolved!.events;
    const cooler = events.find((e) => e.witnessId === "w2")!;
    const contradictions = (id: string) => events.find((e) => e.id === id)!.flags.filter((f) => f.check === "contradiction");
    expect(contradictions(cooler.id).length).toBeGreaterThan(0);
    const w1Hits = ["e6", "e7"].filter((id) => contradictions(id).length > 0);
    expect(w1Hits.length).toBeGreaterThan(0);
    for (const flag of contradictions(cooler.id)) expect(flag.severity).toBe("soft");
    expect(contradictions(cooler.id).some((f) => w1Hits.some((id) => f.conflictsWith?.includes(id)))).toBe(true);

    const main = gatedSnapshot(robberyGraph, storeScene).resolved!.events.find((e) => e.id === "e5")!;
    const e5 = events.find((e) => e.id === "e5")!;
    const [sightline, ...rest] = e5.flags.filter((f) => f.check === "sightline");
    expect(rest).toEqual([]);
    expect(sightline).toMatchObject({ id: "sightline:e5", severity: "hard", evidence: { blocker: "shelf_a" } });
    expect(sightline!.id).toBe(main.flags[0]!.id);
    expect(e5.status).toBe("implausible");
    expect(events.filter((e) => e.flags.some((f) => f.severity === "hard")).map((e) => e.id)).toEqual(["e5"]);
  });

  it("the questions are addressed to each witness's own account", () => {
    const { resolved } = gatedSnapshot({ ...patched(), witnesses: [...(robberyGraph.witnesses ?? []), robberyClerkWitness] }, storeScene);
    const cooler = resolved!.events.find((e) => e.witnessId === "w2")!;
    const own = cooler.flags.find((f) => f.check === "contradiction")!;
    expect(own.suggestedQuestion).toMatch(/^Another witness places the suspect by the .+ around then; you placed the suspect by the .+\. Where was the suspect, as you saw it\?$/);
    const other = resolved!.events.find((e) => e.id === own.conflictsWith![0])!;
    const theirs = other.flags.find((f) => f.check === "contradiction" && f.conflictsWith?.includes(cooler.id))!;
    expect(theirs.suggestedQuestion).toMatch(/^Another witness places the suspect/);
    expect(theirs.suggestedQuestion).not.toBe(own.suggestedQuestion);
  });
});

describe("?scenario=two-witnesses", () => {
  it("has 11 events, soft contradictions on the clerk's event and on e6 or e7, and two witnesses", () => {
    const source = mountTwo();
    const snapshot = source.getSnapshot();
    const events = snapshot.resolved!.events;
    expect(events).toHaveLength(11);
    expect(snapshot.graph?.witnesses?.map((w) => w.id)).toEqual(["w1", "w2"]);
    const withContradiction = events.filter((e) => e.flags.some((f) => f.check === "contradiction")).map((e) => e.id);
    expect(withContradiction).toContain("e11");
    expect(withContradiction.some((id) => id === "e6" || id === "e7")).toBe(true);
    expect(events.find((e) => e.id === "e11")?.witnessId).toBe("w2");
    expect(events.every((e) => e.flags.every((f) => f.severity === "soft" || e.id === "e5"))).toBe(true);
  });

  it("an unknown scenario has no source, so the app shows its error card", () => {
    expect(fixtureGraphSource("store", "no-such-scenario")).toBeNull();
    expect(fixtureGraphSource("store", "two-witnesses,corrected")).toBeNull();
    expect(fixtureGraphSource("store", "corrected")).not.toBeNull();
    expect(scenarioFromSearch("?scenario=two-witnesses")).toBe("two-witnesses");
  });

  it("the single-witness fixture is unchanged", () => {
    const source = fixtureGraphSource("store");
    const events = source!.getSnapshot().resolved!.events;
    expect(events).toHaveLength(10);
    expect(events.flatMap((e) => e.flags).map((f) => f.id)).toEqual(["sightline:e5"]);
  });
});

describe("witness layers", () => {
  it("lists the witnesses with their event counts, from the graph or derived from the events", () => {
    const source = mountTwo();
    const snapshot = source.getSnapshot();
    expect(witnessLayers(snapshot.graph ?? null, snapshot.resolved)).toEqual([
      { id: "w1", label: "Customer", actorId: "witness", eventCount: 10 },
      { id: "w2", label: "Clerk", actorId: "clerk", eventCount: 1 },
    ]);
    const single = fixtureGraphSource("store")!.getSnapshot();
    expect(witnessLayers(null, single.resolved).map((w) => [w.id, w.label, w.eventCount])).toEqual([["w1", "w1", 10]]);
    expect(witnessLayers(single.graph ?? null, single.resolved)).toEqual([
      { id: "w1", label: "Customer", actorId: "witness", eventCount: 10 },
    ]);
    expect(witnessLayers(null, null)).toEqual([]);
  });

  it("hiding a witness is render-only: no status or flag changes", () => {
    const source = mountTwo();
    const before = JSON.stringify(source.getSnapshot());
    const layers = callHook(() => useWitnessLayers());
    layers.toggle("w2");
    expect(useSceneStore.getState().hiddenWitnesses.has("w2")).toBe(true);
    expect(JSON.stringify(source.getSnapshot())).toBe(before);
    expect(JSON.stringify(useSceneStore.getState().resolved)).toBe(JSON.stringify(source.getSnapshot().resolved));
  });

  it("only(w1) hides w2, toggle flips, showAll clears", () => {
    mountTwo();
    const layers = callHook(() => useWitnessLayers());
    layers.only("w1");
    expect([...useSceneStore.getState().hiddenWitnesses]).toEqual(["w2"]);
    layers.toggle("w2");
    expect(useSceneStore.getState().hiddenWitnesses.size).toBe(0);
    layers.only("w2");
    expect([...useSceneStore.getState().hiddenWitnesses]).toEqual(["w1"]);
    layers.showAll();
    expect(useSceneStore.getState().hiddenWitnesses.size).toBe(0);
  });

  it("the hidden set is cleared when the graph source changes", () => {
    mountTwo();
    useSceneStore.getState().toggleWitness("w2");
    const same = useSceneStore.getState().graphSource;
    useSceneStore.getState().setGraphSource(same);
    expect(useSceneStore.getState().hiddenWitnesses.has("w2")).toBe(true);
    useSceneStore.getState().setGraphSource(fixtureGraphSource("store"));
    expect(useSceneStore.getState().hiddenWitnesses.size).toBe(0);
  });
});

describe("the other witness's claimed place", () => {
  const setup = () => {
    const snapshot = mountTwo().getSnapshot();
    const resolved = snapshot.resolved!;
    const lookup = (event: Parameters<typeof statusOf>[1]) => statusOf(snapshot.statuses, event);
    return { resolved, lookup, playback: buildActorPlayback(resolved, "suspect", lookup) };
  };

  it("marks the events of the suspect that another witness disagrees with", () => {
    const { resolved, lookup } = setup();
    const ids = disagreementEvents(resolved, lookup).map((e) => e.id);
    expect(ids).toContain("e11");
    expect(ids.some((id) => id === "e6" || id === "e7")).toBe(true);
    expect(ids.every((id) => resolved.events.find((e) => e.id === id)?.actor === "suspect")).toBe(true);
  });

  it("shows exactly the second witness's marker while both events cover t, and none outside the overlap", () => {
    const { resolved, lookup, playback } = setup();
    const candidates = disagreementEvents(resolved, lookup);
    const shownAt = (t: number) => candidates.filter((e) => markerShown(playback, e, t)).map((e) => e.witnessId);
    const at11 = shownAt(11);
    expect(at11).toHaveLength(1);
    expect(shownAt(1)).toEqual([]);
    expect(shownAt(20)).toEqual([]);
    expect(shownAt(11)).toEqual(at11);
  });
});

describe("typed statements in fixture mode", () => {
  it.each([[undefined], ["two-witnesses"]])("go to witness w1 in the %s scenario", async (scenario) => {
    const source = fixtureGraphSource("store", scenario)!;
    useSceneStore.getState().setGraphSource(source);
    const { segmentId } = await useGraphActions().submitStatement(CORRECTION_TEXT, "Witness");
    await vi.waitFor(() => expect(source.statementStatuses()[segmentId]?.state).toBe("done"));
    const events = source.getSnapshot().graph!.events;
    const added = events.filter((e) => e.sources.includes(segmentId));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((e) => e.witnessId === "w1")).toBe(true);
    expect(events.find((e) => e.id === "e11" && scenario === "two-witnesses")?.witnessId ?? "w2").toBe("w2");
  });
});
