import type { Anchor, Event, EventGraph, Flag, Patch, Status } from "@rashomon/schema";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pushSource, useGraphErrors } from "../playback/useGraph";
import { useGraphActions } from "../playback/useGraphActions";
import { useSceneStore } from "../store";
import { robberyGatedSnapshot } from "../playback/graphSource";
import { modeFromSearch, selectSource } from "../playback/selectSource";
import type { Anchor as AnchorRow, Event as EventRow, Flag as FlagRow } from "./bindings/types";
import { convertGraphRow, type LiveGraphRow } from "./convert";
import { DEFAULT_LIVE_OPTIONS, graphQuery, liveOptionsFromSearch, type LiveConnector, type LiveHandlers } from "./liveConnection";
import { liveGraphSource } from "./liveGraphSource";

const SIGHTLINE_E5 = robberyGatedSnapshot().resolved?.events.find((event) => event.id === "e5")?.flags[0];
const REASON = "witness later confirmed the view";

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

function flagRow(flag: Flag): FlagRow {
  return { ...flag, evidence: JSON.stringify(flag.evidence), conflictsWith: flag.conflictsWith };
}

function eventRow(event: Event, status: Status, flags: readonly Flag[]): EventRow {
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
    status,
    flags: flags.map(flagRow),
    override: status === "overridden" ? { by: "investigator", reason: REASON, at: 1, flagIds: ["sightline:e5"] } : undefined,
    supersededBy: event.supersededBy,
    style: event.style,
    actionApproximated: event.actionApproximated,
    verb: event.verb,
  };
}

function robberyRow(e5Status: Status, version: number): LiveGraphRow {
  if (!SIGHTLINE_E5) throw new Error("gate gave e5 no flag");
  const graph: EventGraph = robberyGraph;
  return {
    sceneId: graph.sceneId,
    actors: graph.actors.map((actor) => ({ ...actor, body: actor.body, heightM: actor.heightM, tint: actor.tint })),
    props: graph.props.map((prop) => ({
      id: prop.id,
      type: prop.type,
      anchor: anchorRow(prop.anchor),
      heldBy: prop.heldBy,
      notes: prop.notes,
      sources: [...prop.sources],
    })),
    events: graph.events.map((event) =>
      event.id === "e5" ? eventRow(event, e5Status, [SIGHTLINE_E5]) : eventRow(event, "plausible", []),
    ),
    witnesses: undefined,
    version,
  };
}

function fakeConnector() {
  const handlers: LiveHandlers[] = [];
  const disconnect = vi.fn();
  const applyPatches = vi.fn((_baseVersion: number, _patchesJson: string): Promise<void> => Promise.resolve());
  const submitStatement = vi.fn((_text: string, _witnessName: string): Promise<void> => Promise.resolve());
  const connect: LiveConnector = vi.fn((_options, given) => {
    handlers.push(given);
    return { disconnect, applyPatches, submitStatement };
  });
  const current = () => {
    const latest = handlers.at(-1);
    if (!latest) throw new Error("not connected");
    return latest;
  };
  return { connect, disconnect, applyPatches, submitStatement, handlers, current };
}

function eventIn(source: ReturnType<typeof liveGraphSource>, id: string) {
  return source.getSnapshot().resolved?.events.find((event) => event.id === id);
}

describe("live GraphSource over a fake connection", () => {
  it("a row with e5 implausible gives e5 implausible with its sightline flag and e1's path", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);

    fake.current().onRow(robberyRow("implausible", 1));

    const e5 = eventIn(source, "e5");
    expect(e5?.status).toBe("implausible");
    expect(e5?.flags).toEqual([SIGHTLINE_E5]);
    expect(source.getSnapshot().statuses.e5).toBe("implausible");
    expect(eventIn(source, "e1")?.path.length).toBeGreaterThanOrEqual(3);
    expect(eventIn(source, "e1")?.status).toBe("plausible");
    expect(source.error).toBeNull();
  });

  it("a second row with e5 overridden notifies once and updates e5", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    const listener = vi.fn();
    source.subscribe(listener);
    fake.current().onRow(robberyRow("implausible", 1));
    listener.mockClear();

    fake.current().onRow(robberyRow("overridden", 2));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(eventIn(source, "e5")?.status).toBe("overridden");
    expect(source.getSnapshot().statuses.e5).toBe("overridden");
  });

  it("a disconnect keeps the last snapshot and sets error", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    const listener = vi.fn();
    source.subscribe(listener);
    fake.current().onRow(robberyRow("implausible", 1));
    const before = source.getSnapshot();

    fake.current().onError("live connection to ws://localhost:3000 database rashomon closed");

    expect(source.getSnapshot()).toBe(before);
    expect(source.error).toBe("live connection to ws://localhost:3000 database rashomon closed");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("a malformed row keeps the last snapshot and names the field", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 1));
    const before = source.getSnapshot();
    const bad = robberyRow("implausible", 2);

    fake.current().onRow({ ...bad, events: bad.events.map((event) => ({ ...event, status: "maybe" })) });

    expect(source.getSnapshot()).toBe(before);
    expect(source.error).toMatch(/event e1\.status "maybe" is not one of/);
  });

  it("connects on first subscribe, disconnects after the last, and ignores a closed connection", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    expect(fake.connect).not.toHaveBeenCalled();

    const first = source.subscribe(() => undefined);
    const second = source.subscribe(() => undefined);
    expect(fake.connect).toHaveBeenCalledTimes(1);
    first();
    expect(fake.disconnect).not.toHaveBeenCalled();
    second();
    expect(fake.disconnect).toHaveBeenCalledTimes(1);

    fake.handlers[0]?.onRow(robberyRow("implausible", 1));
    expect(source.getSnapshot().resolved).toBeNull();
  });
});

describe("source selection and options", () => {
  it("?mode=live selects the live kind, anything else the fixture kind", () => {
    const fake = fakeConnector();

    expect(selectSource("?mode=live", "store", fake.connect)?.kind).toBe("live");
    expect(selectSource("", "store", fake.connect)?.kind).toBe("fixture");
    expect(selectSource("?mode=fixture", "store", fake.connect)?.kind).toBe("fixture");
    expect(selectSource("?mode=other&fixture=store", "store", fake.connect)?.kind).toBe("fixture");
    expect(modeFromSearch("?fixture=store&mode=live")).toBe("live");
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it("reads stdb, db and session with defaults", () => {
    expect(liveOptionsFromSearch("")).toEqual({ uri: "ws://localhost:3000", databaseName: "rashomon", sessionId: "demo" });
    expect(liveOptionsFromSearch("?stdb=ws://10.0.0.2:3000&db=r2&session=s7")).toEqual({
      uri: "ws://10.0.0.2:3000",
      databaseName: "r2",
      sessionId: "s7",
    });
  });

  it("quotes the session id inside the view query", () => {
    expect(graphQuery("demo")).toBe("SELECT * FROM graph_for_scene('demo')");
    expect(graphQuery("o'brien")).toBe("SELECT * FROM graph_for_scene('o''brien')");
  });
});

const MOVE_E5: Patch = {
  op: "update_event",
  id: "e5",
  changes: { at: { kind: "at", landmark: "window_front" } },
  sources: ["investigator:local"],
};

describe("live GraphSource applying patches", () => {
  afterEach(() => {
    useSceneStore.getState().setGraphSource(null);
    useSceneStore.getState().setGraphErrors({ connection: null, action: null });
  });

  it("sends the last row's version and the patches as a JSON string, and changes nothing by itself", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    const listener = vi.fn();
    source.subscribe(listener);
    fake.current().onRow(robberyRow("implausible", 7));
    const before = source.getSnapshot();
    listener.mockClear();

    source.apply([MOVE_E5]);

    expect(fake.applyPatches).toHaveBeenCalledTimes(1);
    expect(fake.applyPatches).toHaveBeenCalledWith(7, JSON.stringify([MOVE_E5]));
    expect(source.getSnapshot()).toBe(before);
    expect(source.getSnapshot().statuses.e5).toBe("implausible");
    expect(listener).not.toHaveBeenCalled();
    expect(source.actionError).toBeNull();
  });

  it("uses the newest row's version for the next call", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 3));
    fake.current().onRow(robberyRow("plausible", 4));

    source.apply([MOVE_E5]);

    expect(fake.applyPatches).toHaveBeenCalledWith(4, expect.any(String));
  });

  it("throws at once when nothing is connected or no row has arrived", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    expect(() => source.apply([MOVE_E5])).toThrow(/not connected/);
    source.subscribe(() => undefined);
    expect(() => source.apply([MOVE_E5])).toThrow(/no live graph row has arrived/);
    expect(fake.applyPatches).not.toHaveBeenCalled();
  });

  it("a rejected call sets the action error and leaves the snapshot and statuses unchanged", async () => {
    const fake = fakeConnector();
    fake.applyPatches.mockRejectedValueOnce(new Error("stale baseVersion 1; the graph is at version 2"));
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    const listener = vi.fn();
    source.subscribe(listener);
    fake.current().onRow(robberyRow("implausible", 1));
    const before = source.getSnapshot();
    listener.mockClear();

    source.apply([MOVE_E5]);
    await Promise.resolve();
    await Promise.resolve();

    expect(source.actionError).toBe("stale baseVersion 1; the graph is at version 2");
    expect(source.getSnapshot()).toBe(before);
    expect(source.getSnapshot().statuses.e5).toBe("implausible");
    expect(source.error).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("an updated row replaces the snapshot and clears the action error", async () => {
    const fake = fakeConnector();
    fake.applyPatches.mockRejectedValueOnce(new Error("stale baseVersion 1; the graph is at version 2"));
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 1));
    source.apply([MOVE_E5]);
    await Promise.resolve();
    await Promise.resolve();
    expect(source.actionError).not.toBeNull();

    fake.current().onRow(robberyRow("plausible", 2));

    expect(source.actionError).toBeNull();
    expect(source.getSnapshot().statuses.e5).toBe("plausible");
    expect(eventIn(source, "e5")?.status).toBe("plausible");
  });

  it("a rejection that arrives after the connection closed is ignored", async () => {
    const fake = fakeConnector();
    let reject: (error: Error) => void = () => undefined;
    fake.applyPatches.mockReturnValueOnce(new Promise<void>((_resolve, fail) => (reject = fail)));
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    const unsubscribe = source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 1));
    source.apply([MOVE_E5]);
    unsubscribe();

    reject(new Error("too late"));
    await Promise.resolve();
    await Promise.resolve();

    expect(source.actionError).toBeNull();
  });

  it("useGraphActions sends through a mounted live source instead of throwing", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 5));
    useSceneStore.getState().setGraphSource(source);

    expect(() => useGraphActions().applyPatches([MOVE_E5])).not.toThrow();

    expect(fake.applyPatches).toHaveBeenCalledWith(5, JSON.stringify([MOVE_E5]));
  });

  it("eventOf returns the graph event with its anchors from the last good row", () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    expect(source.eventOf("e5")).toBeUndefined();
    fake.current().onRow(robberyRow("implausible", 1));
    expect(source.eventOf("e5")?.at).toEqual({ kind: "at", landmark: "aisle_chips" });
  });

  it("the connection error and the action error reach the store and the exported hook", async () => {
    const fake = fakeConnector();
    fake.applyPatches.mockRejectedValueOnce(new Error("stale baseVersion 1; the graph is at version 2"));
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => pushSource(source));
    fake.current().onRow(robberyRow("implausible", 1));
    const Probe = () => <p>{JSON.stringify(useGraphErrors())}</p>;
    const shown = () => {
      const initial = useSceneStore.getInitialState();
      const saved = { connectionError: initial.connectionError, actionError: initial.actionError };
      const { connectionError, actionError } = useSceneStore.getState();
      Object.assign(initial, { connectionError, actionError });
      try {
        return renderToStaticMarkup(<Probe />).replaceAll("&quot;", '"');
      } finally {
        Object.assign(initial, saved);
      }
    };
    expect(shown()).toContain('{"connectionError":null,"actionError":null}');

    source.apply([MOVE_E5]);
    await Promise.resolve();
    await Promise.resolve();
    expect(shown()).toContain("stale baseVersion 1; the graph is at version 2");

    fake.current().onError("live connection to ws://localhost:3000 database rashomon closed");
    expect(shown()).toContain("live connection to ws://localhost:3000 database rashomon closed");
    expect(useSceneStore.getState().connectionError).toBe("live connection to ws://localhost:3000 database rashomon closed");

    fake.current().onRow(robberyRow("plausible", 2));
    expect(useSceneStore.getState().actionError).toBeNull();
  });

  it("a second call while one is pending throws and sends nothing, until the next row clears it", () => {
    const fake = fakeConnector();
    fake.applyPatches.mockReturnValueOnce(new Promise<void>(() => undefined));
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 1));

    source.apply([MOVE_E5]);
    expect(() => source.apply([MOVE_E5])).toThrow("a change is still being applied; try again in a moment");
    expect(fake.applyPatches).toHaveBeenCalledTimes(1);

    fake.current().onRow(robberyRow("plausible", 2));
    source.apply([MOVE_E5]);
    expect(fake.applyPatches).toHaveBeenCalledTimes(2);
    expect(fake.applyPatches).toHaveBeenLastCalledWith(2, JSON.stringify([MOVE_E5]));
  });

  it("a rejection clears the guard so the next drop goes through", async () => {
    const fake = fakeConnector();
    fake.applyPatches.mockRejectedValueOnce(new Error("stale baseVersion 1; the graph is at version 2"));
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 1));

    source.apply([MOVE_E5]);
    expect(() => source.apply([MOVE_E5])).toThrow(/still being applied/);
    await Promise.resolve();
    await Promise.resolve();

    expect(source.actionError).toMatch(/stale baseVersion/);
    expect(() => source.apply([MOVE_E5])).not.toThrow();
    expect(fake.applyPatches).toHaveBeenCalledTimes(2);
  });

  it("a call the server accepted without a new row does not leave the guard stuck", async () => {
    const fake = fakeConnector();
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 1));

    source.apply([MOVE_E5]);
    await Promise.resolve();
    await Promise.resolve();

    expect(() => source.apply([MOVE_E5])).not.toThrow();
  });

  it("the guard does not outlive the connection", () => {
    const fake = fakeConnector();
    fake.applyPatches.mockReturnValue(new Promise<void>(() => undefined));
    const source = liveGraphSource(DEFAULT_LIVE_OPTIONS, fake.connect);
    const unsubscribe = source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 1));
    source.apply([MOVE_E5]);
    unsubscribe();

    source.subscribe(() => undefined);
    fake.current().onRow(robberyRow("implausible", 3));
    expect(() => source.apply([MOVE_E5])).not.toThrow();
  });
});

describe("live rows carry the action vocabulary", () => {
  it("style, actionApproximated and verb convert, and an unknown style is refused", () => {
    const row = robberyRow("implausible", 1);
    const e1 = row.events[0]!;
    const styled: LiveGraphRow = {
      ...row,
      events: [{ ...e1, action: "dodge", style: undefined, actionApproximated: true, verb: "ducked" }, { ...e1, id: "e2", style: "sneak" }],
    };
    const graph = convertGraphRow(styled);
    expect(graph.events[0]).toMatchObject({ action: "dodge", actionApproximated: true, verb: "ducked" });
    expect(graph.events[0]).not.toHaveProperty("style");
    expect(graph.events[1]).toMatchObject({ style: "sneak" });
    expect(convertGraphRow(row).events.some((e) => "style" in e || "verb" in e || "actionApproximated" in e)).toBe(false);
    expect(() => convertGraphRow({ ...row, events: [{ ...e1, style: "limping" }] })).toThrow(/style/);
  });
});

describe("live rows carry actor bodies", () => {
  it("body, heightM and tint convert, actors without them keep four fields, and an unknown body is refused", () => {
    const row = robberyRow("implausible", 1);
    const suspect = row.actors[0]!;
    const described: LiveGraphRow = {
      ...row,
      actors: [{ ...suspect, body: "heavy_tall", heightM: 1.88, tint: "#b22222" }, ...row.actors.slice(1)],
    };
    const graph = convertGraphRow(described);
    expect(graph.actors[0]).toMatchObject({ body: "heavy_tall", heightM: 1.88, tint: "#b22222" });
    for (const actor of convertGraphRow(row).actors) expect(Object.keys(actor).sort()).toEqual(["id", "label", "rig", "role"]);
    expect(() => convertGraphRow({ ...row, actors: [{ ...suspect, body: "muscular" }] })).toThrow(/body/);
  });
});
