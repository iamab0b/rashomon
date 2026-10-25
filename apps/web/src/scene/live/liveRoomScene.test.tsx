import type { Anchor, Event, EventGraph } from "@rashomon/schema";
import { robberyGraph, roomScene, storeScene } from "@rashomon/schema/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import stairwellJson from "../../../../../packages/schema/fixtures/stairwell.graph.json";
import { pushSource } from "../playback/useGraph";
import { useSceneStore } from "../store";
import type { Anchor as AnchorRow, Event as EventRow } from "./bindings/types";
import type { LiveGraphRow } from "./convert";
import { DEFAULT_LIVE_OPTIONS, type LiveConnector, type LiveHandlers } from "./liveConnection";
import { liveGraphSource, liveSnapshot } from "./liveGraphSource";
import { liveSceneIdOf, meshFixtureFor } from "./liveSceneFixture";

const stairwell = stairwellJson as unknown as EventGraph;

function anchorRow(anchor: Anchor): AnchorRow {
  return {
    kind: anchor.kind,
    landmark: "landmark" in anchor ? anchor.landmark : undefined,
    radiusM: anchor.kind === "near" ? anchor.radiusM : undefined,
    a: anchor.kind === "between" ? anchor.a : undefined,
    b: anchor.kind === "between" ? anchor.b : undefined,
    position: anchor.kind === "xyz" ? [...anchor.position] : undefined,
  };
}

function eventRow(event: Event): EventRow {
  return {
    id: event.id,
    witnessId: event.witnessId,
    actor: event.actor,
    action: event.action,
    from: event.from ? anchorRow(event.from) : undefined,
    to: event.to ? anchorRow(event.to) : undefined,
    at: event.at ? anchorRow(event.at) : undefined,
    facing: event.facing,
    target: event.target,
    prop: event.prop,
    t: [...event.t],
    tConfidence: event.tConfidence,
    confidence: event.confidence,
    sources: [...event.sources],
    status: "plausible",
    flags: [],
    override: undefined,
    supersededBy: event.supersededBy,
    style: event.style,
    actionApproximated: event.actionApproximated,
    verb: event.verb,
  };
}

function graphRow(graph: EventGraph, sceneId: string = graph.sceneId): LiveGraphRow {
  return {
    sceneId,
    actors: graph.actors.map((actor) => ({ ...actor, body: actor.body, heightM: actor.heightM, tint: actor.tint })),
    props: graph.props.map((prop) => ({
      id: prop.id,
      type: prop.type,
      anchor: anchorRow(prop.anchor),
      heldBy: prop.heldBy,
      notes: prop.notes,
      sources: [...prop.sources],
    })),
    events: graph.events.map(eventRow),
    witnesses: undefined,
    version: 1,
  };
}

function fakeConnector() {
  const handlers: LiveHandlers[] = [];
  const connect: LiveConnector = vi.fn((_options, given) => {
    handlers.push(given);
    return { disconnect: vi.fn(), applyPatches: vi.fn(() => Promise.resolve()), submitStatement: vi.fn(() => Promise.resolve()) };
  });
  const current = () => {
    const latest = handlers.at(-1);
    if (!latest) throw new Error("not connected");
    return latest;
  };
  return { connect, current };
}

afterEach(() => {
  useSceneStore.getState().setGraphSource(null);
  useSceneStore.getState().setGraph({ resolved: null, statuses: {}, graph: null });
});

describe("live mode follows the session's scene", () => {
  it("a live row with sceneId room_v1 resolves against roomScene", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    const row = graphRow(stairwell);

    fake.current().onRow(row);

    expect(source.error).toBeNull();
    expect(source.getSnapshot()).toEqual(liveSnapshot(row, roomScene));
    const standing = source.getSnapshot().resolved?.events.find((event) => event.id === "s2");
    const windowS = roomScene.landmarks.find((landmark) => landmark.id === "window_s");
    expect(standing?.at?.[0]).toBeCloseTo(windowS!.position[0], 0);
    expect(standing?.at?.[2]).toBeCloseTo(windowS!.position[2], 0);
  });

  it("a store_v1 row still resolves against storeScene", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    const row = graphRow(robberyGraph);

    fake.current().onRow(row);

    expect(source.error).toBeNull();
    expect(source.getSnapshot()).toEqual(liveSnapshot(row, storeScene));
  });

  it("an unknown sceneId is a live row rejected error and leaves the snapshot empty", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);

    fake.current().onRow(graphRow(stairwell, "attic_v1"));

    expect(source.error).toMatch(/^live row rejected: .*attic_v1/);
    expect(source.getSnapshot().resolved).toBeNull();
  });

  it("the accepted live row's scene picks the mesh fixture; a fixture source never does", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    useSceneStore.getState().setGraphSource(source);
    expect(meshFixtureFor("store", liveSceneIdOf(useSceneStore.getState()))).toBe("store");

    fake.current().onRow(graphRow(stairwell));
    pushSource(source);
    expect(liveSceneIdOf(useSceneStore.getState())).toBe("room_v1");
    expect(meshFixtureFor("store", liveSceneIdOf(useSceneStore.getState()))).toBe("room");

    fake.current().onRow(graphRow(robberyGraph));
    pushSource(source);
    expect(meshFixtureFor("room", liveSceneIdOf(useSceneStore.getState()))).toBe("store");

    useSceneStore.getState().setGraphSource({ kind: "fixture", getSnapshot: () => source.getSnapshot(), subscribe: () => () => undefined });
    expect(liveSceneIdOf(useSceneStore.getState())).toBeNull();
    expect(meshFixtureFor("room", null)).toBe("room");
    expect(meshFixtureFor("store", "attic_v1")).toBe("store");
  });
});
