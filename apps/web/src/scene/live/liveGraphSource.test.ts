import type { Anchor, Event, EventGraph, Flag, Status } from "@rashomon/schema";
import { robberyGraph } from "@rashomon/schema/fixtures";
import { describe, expect, it, vi } from "vitest";
import { robberyGatedSnapshot } from "../playback/graphSource";
import { modeFromSearch, selectSource } from "../playback/selectSource";
import type { Anchor as AnchorRow, Event as EventRow, Flag as FlagRow } from "./bindings/types";
import type { LiveGraphRow } from "./convert";
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
  };
}

function robberyRow(e5Status: Status, version: number): LiveGraphRow {
  if (!SIGHTLINE_E5) throw new Error("gate gave e5 no flag");
  const graph: EventGraph = robberyGraph;
  return {
    sceneId: graph.sceneId,
    actors: graph.actors.map((actor) => ({ ...actor })),
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
    version,
  };
}

function fakeConnector() {
  const handlers: LiveHandlers[] = [];
  const disconnect = vi.fn();
  const connect: LiveConnector = vi.fn((_options, given) => {
    handlers.push(given);
    return { disconnect };
  });
  const current = () => {
    const latest = handlers.at(-1);
    if (!latest) throw new Error("not connected");
    return latest;
  };
  return { connect, disconnect, handlers, current };
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
