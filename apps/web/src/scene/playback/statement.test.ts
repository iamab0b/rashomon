import { robberyGraph } from "@rashomon/schema/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fnv1a64 } from "../../../../../spacetimedb/server/src/extract/hash";
import { fixtureGraphSource, type FixtureGraphSource } from "./graphSource";
import { CORRECTION_TEXT, RECORDED_NOTE } from "./recordedStatements";
import { checkStatement, statementSegmentId } from "./statementId";
import { liveStatementStatus } from "./statementStatus";
import { pushSource } from "./useGraph";
import { useGraphActions } from "./useGraphActions";
import { useStatementStatus } from "./useStatementStatus";
import { callHook } from "../testing/hookHost";
import { useSceneStore } from "../store";

const initial = useSceneStore.getState();

function mount(scenario?: string): FixtureGraphSource {
  const source = fixtureGraphSource("store", scenario);
  if (!source) throw new Error("store fixture source missing");
  useSceneStore.getState().setGraphSource(source);
  return source;
}

afterEach(() => {
  useSceneStore.setState(initial, true);
  vi.useRealTimers();
});

const settled = async (source: FixtureGraphSource, segmentId: string) => {
  await vi.waitFor(() => expect(source.statementStatuses()[segmentId]?.state).not.toBe("extracting"));
  return source.statementStatuses()[segmentId];
};

describe("submitStatement on the fixture source", () => {
  it("the robbery correction statement makes every event plausible with zero flags, like ?scenario=corrected", async () => {
    const source = mount();
    const { segmentId, baseVersion } = await useGraphActions().submitStatement(CORRECTION_TEXT, "Witness");
    expect(baseVersion).toBe(robberyGraph.version);
    expect(source.statementStatuses()[segmentId]).toEqual({ state: "extracting" });
    expect(source.getSnapshot().statuses.e5).toBe("implausible");

    const status = await settled(source, segmentId);
    expect(status).toEqual({ state: "done", patchCount: 4 });

    const events = source.getSnapshot().resolved?.events ?? [];
    const corrected = fixtureGraphSource("store", "corrected")!.getSnapshot().resolved?.events ?? [];
    expect(events).toHaveLength(corrected.length);
    expect(events).toHaveLength(11);
    for (const event of events) {
      expect(event.status, event.id).toBe("plausible");
      expect(event.flags, event.id).toEqual([]);
    }
    expect(events.find((e) => e.id === "e3")?.tEnd).toBe(9);
    expect(events.find((e) => e.id === "e5")?.at).toEqual(corrected.find((e) => e.id === "e5")?.at);
  });

  it("matches the statement ignoring case, punctuation and spacing", async () => {
    const source = mount();
    const loose = "  oh no youre right id stepped out  I came to the front by the window to see what was going on I saw him from there ";
    const { segmentId } = await useGraphActions().submitStatement(loose, "Witness");
    expect((await settled(source, segmentId))?.patchCount).toBe(4);
  });

  it("an unrelated sentence is done with zero patches and the note, and the graph is unchanged", async () => {
    const source = mount();
    const before = source.getSnapshot();
    const { segmentId } = await useGraphActions().submitStatement("The weather was nice that day.", "Witness");
    const status = await settled(source, segmentId);
    expect(status).toEqual({ state: "done", patchCount: 0, note: RECORDED_NOTE });
    expect(source.getSnapshot()).toBe(before);
  });

  it("submitting the same statement twice runs one extraction", async () => {
    const source = mount();
    const first = await useGraphActions().submitStatement(CORRECTION_TEXT, "Witness");
    const second = await useGraphActions().submitStatement(CORRECTION_TEXT, "Witness");
    expect(second.segmentId).toBe(first.segmentId);
    await settled(source, first.segmentId);
    const again = await useGraphActions().submitStatement(CORRECTION_TEXT, "Witness");
    expect(again.segmentId).toBe(first.segmentId);
    expect(source.statementStatuses()[first.segmentId]).toEqual({ state: "done", patchCount: 4 });
    expect(source.getSnapshot().resolved?.events).toHaveLength(11);
  });

  it("pushSource puts the statuses in the store for useStatementStatus", async () => {
    const source = mount();
    source.subscribe(() => pushSource(source));
    const { segmentId } = await useGraphActions().submitStatement(CORRECTION_TEXT, "Witness");
    expect(useSceneStore.getState().statements[segmentId]).toEqual({ state: "extracting" });
    await settled(source, segmentId);
    expect(useSceneStore.getState().statements[segmentId]).toEqual({ state: "done", patchCount: 4 });
  });

  it("an empty text, a long name or no mounted source is refused", async () => {
    mount();
    await expect(useGraphActions().submitStatement("   ", "Witness")).rejects.toThrow(/must not be empty/);
    await expect(useGraphActions().submitStatement("hello", "n".repeat(65))).rejects.toThrow(/witness name/);
    useSceneStore.getState().setGraphSource(null);
    expect(() => useGraphActions().submitStatement("hello", "Witness")).toThrow(/no graph source is mounted/);
  });
});

describe("the fixture source uses the witness name", () => {
  it("a different name is a different statement, and the events carry the name as their witness", async () => {
    const source = mount();
    const maria = await useGraphActions().submitStatement(CORRECTION_TEXT, "Maria");
    const other = await useGraphActions().submitStatement(CORRECTION_TEXT, "Omar");
    expect(maria.segmentId).not.toBe(other.segmentId);
    expect(maria.segmentId).toBe(statementSegmentId("fixture", "Maria", CORRECTION_TEXT));
    await settled(source, maria.segmentId);
    const added = source.getSnapshot().graph!.events.find((e) => e.id === "e11");
    expect(added?.witnessId).toBe("Maria");
  });
});

describe("useStatementStatus", () => {
  it("is null for an id that was never submitted from this tab, and tracks a submitted one", async () => {
    const source = mount();
    source.subscribe(() => pushSource(source));
    expect(callHook(() => useStatementStatus("seg_unknown"))).toBeNull();
    expect(callHook(() => useStatementStatus(null))).toBeNull();
    const { segmentId } = await useGraphActions().submitStatement(CORRECTION_TEXT, "Witness");
    expect(callHook(() => useStatementStatus(segmentId))).toEqual({ state: "extracting" });
    await settled(source, segmentId);
    expect(callHook(() => useStatementStatus(segmentId))).toEqual({ state: "done", patchCount: 4 });
    expect(callHook(() => useStatementStatus("seg_unknown"))).toBeNull();
  });
});

describe("statement ids and live status", () => {
  it("the browser's segment id equals the module's for the same session, name and text", () => {
    for (const [session, name, text] of [
      ["demo", "Maria", "I stepped to the front by the window."],
      ["s1", "Witness", "  padded text\nwith a newline  "],
      ["é", "Ünï", "名前 text"],
    ] as const) {
      expect(statementSegmentId(session, name, text)).toBe(`seg_${fnv1a64(`${session}\n${name.trim()}\n${text.trim()}`)}`);
    }
  });

  it("checkStatement counts UTF-8 bytes, so 32,000 three-byte characters fail with a byte message", () => {
    const message = checkStatement("€".repeat(32_000), "Witness");
    expect(message).toBe("statement text must be at most 65536 bytes in UTF-8, and this one is 96000");
    expect(checkStatement("€".repeat(21_845), "Witness")).toBeNull();
  });

  it("checkStatement mirrors the module's limits", () => {
    expect(checkStatement("ok", "Witness")).toBeNull();
    expect(checkStatement(" ", "Witness")).toMatch(/empty/);
    expect(checkStatement("x".repeat(32_001), "Witness")).toMatch(/32000/);
    expect(checkStatement("ok", "")).toMatch(/witness name/);
  });

  it("liveStatementStatus: extractedAt wins, then an error code, then the graph version, else extracting", () => {
    expect(liveStatementStatus(undefined, 3, 3)).toEqual({ state: "extracting" });
    expect(liveStatementStatus({ id: "s", extractedAt: {}, extractPatchCount: 4 }, 3, 3)).toEqual({ state: "done", patchCount: 4 });
    expect(liveStatementStatus({ id: "s", extractError: "model_error" }, 3, 9)).toEqual({ state: "failed", error: "model_error" });
    expect(liveStatementStatus({ id: "s", extractedAt: {}, extractPatchCount: 2, extractError: "partly_rejected" }, 3, 3)).toEqual({
      state: "done",
      patchCount: 2,
      error: "partly_rejected",
    });
    expect(liveStatementStatus(undefined, 3, 4)).toEqual({ state: "done" });
    expect(liveStatementStatus(undefined, 3, 3)).toEqual({ state: "extracting" });
    expect(liveStatementStatus({ id: "s" }, 3, 9)).toEqual({ state: "extracting" });
    expect(liveStatementStatus({ id: "s", extractPatchCount: 1 }, 3, 4)).toEqual({ state: "extracting" });
  });
});

