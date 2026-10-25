import { extractSegment, type ExtractContext } from "@rashomon/extractor";
import propsJson from "@rashomon/props";
import type { Event, PropType, Segment } from "@rashomon/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import roomAlignmentJson from "../../../../../packages/schema/fixtures/room.alignment.json";
import roomJson from "../../../../../packages/schema/fixtures/room.scene.json";
import { manifestError } from "../labeling/validate";
import { isAlignment } from "../loaders/alignment";
import { parseRoomAlignment, ROOM_FIXTURE, ROOM_MISSING_NOTE, roomAlignment, roomScene } from "../loaders/roomFixture";
import { isKnownFixture, loadManifest, loadScene } from "../loaders/scene";
import { sha256Hex } from "../loaders/scanRequest";
import { useSceneStore } from "../store";
import { fixtureGraphSource, type FixtureGraphSource } from "./graphSource";
import { selectSource } from "./selectSource";
import { stairwellGraph } from "./stairwell";
import { STAIRWELL_CLAIM_TEXT, STAIRWELL_CORRECTION_TEXT, STAIRWELL_NOTE, STAIRWELL_STATEMENTS } from "./stairwellStatements";
import { useGraphActions } from "./useGraphActions";

const NODE_FS: string = "node:fs/promises";
type ReadFile = (path: URL) => Promise<Uint8Array>;

const MAIN_STORE_FIXTURES: Readonly<Record<string, string>> = {
  "store.scene.json": "12e9d54ba9a8065c2c3c233f272735d15ab7f4e4a8afd95a2a8d7960074d9181",
  "robbery.graph.json": "f1664e2a108c52719ca049c8123adebaa962a1dd2f5ae04ea98290e409154c2c",
  "robbery.clerk.json": "b1121f520565c7e99f9e230a0d9be457cdc9c3bc57b159a9e340b96d58657033",
  "robbery.resolved.json": "6540ee9e2eb4231ce304a9b86729e4af94ea800d82dfb27a28441c5dbe3d10d6",
};

const fixturesDir = new URL("../../../../../packages/schema/fixtures/", import.meta.url);
const initial = useSceneStore.getState();

afterEach(() => {
  useSceneStore.setState(initial, true);
});

function roomSource(scenario?: string): FixtureGraphSource {
  const source = fixtureGraphSource(ROOM_FIXTURE, scenario);
  if (!source) throw new Error("room fixture source missing");
  return source;
}

const settled = async (source: FixtureGraphSource, segmentId: string) => {
  await vi.waitFor(() => expect(source.statementStatuses()[segmentId]?.state).not.toBe("extracting"));
  return source.statementStatuses()[segmentId];
};

const shape = (event: Pick<Event, "actor" | "action" | "from" | "to" | "at" | "target" | "t">) => ({
  actor: event.actor,
  action: event.action,
  from: event.from,
  to: event.to,
  at: event.at,
  target: event.target,
  t: event.t,
});

describe("the room manifest", () => {
  it("passes the labeling tool's validator", () => {
    expect(manifestError(roomJson)).toBeNull();
  });

  it("is room_v1 on the zatec_room scan with generated portals and human labels", () => {
    expect(roomScene.sceneId).toBe("room_v1");
    expect(roomScene.meshUrl).toBe("/scans/zatec_room.glb");
    expect(roomScene.portals).toBeUndefined();
    expect(Object.fromEntries(roomScene.landmarks.map((l) => [l.id, l.label]))).toEqual({
      stairs_top: "top of the stairs",
      window_n: "north window",
      window_e: "east window",
      window_w: "west window",
      window_s: "south window",
      ladder: "ladder",
    });
  });
});

describe("room.alignment.json", () => {
  it("parses into an Alignment", () => {
    expect(isAlignment(roomAlignmentJson)).toBe(true);
    expect(roomAlignment).toEqual({
      rotation: roomAlignmentJson.rotation,
      translation: roomAlignmentJson.translation,
      scale: roomAlignmentJson.scale,
    });
    expect(roomAlignmentJson.metresPerUnit).toBe(roomAlignmentJson.scale);
  });

  it("refuses a value that is not an alignment", () => {
    expect(() => parseRoomAlignment({ rotation: [0, 0, 0], translation: [0, 0, 0], scale: 1 })).toThrow(/not an alignment/);
  });
});

describe("?fixture=room", () => {
  it("is a known fixture whose manifest is room_v1", () => {
    expect(isKnownFixture(ROOM_FIXTURE)).toBe(true);
    expect(loadManifest(ROOM_FIXTURE)).toBe(roomScene);
  });

  it("selects the stairwell graph, and the corrected scenario with the correction applied", () => {
    const base = selectSource("?fixture=room", ROOM_FIXTURE)?.getSnapshot();
    const corrected = selectSource("?fixture=room&scenario=corrected", ROOM_FIXTURE)?.getSnapshot();

    expect(base?.graph?.sceneId).toBe("room_v1");
    expect(base?.graph?.events.map((e) => e.id)).toEqual(stairwellGraph.events.map((e) => e.id));
    expect(base?.graph?.events.find((e) => e.id === "w2e")?.at).toEqual({ kind: "at", landmark: "stairs_top" });
    expect(corrected?.graph?.events.find((e) => e.id === "w2e")?.at).toEqual({ kind: "at", landmark: "window_w" });
    expect(corrected?.graph?.events.find((e) => e.id === "w1e")?.t).toEqual([0, 4]);
  });

  it("has no two-witnesses scenario", () => {
    expect(selectSource("?fixture=room&scenario=two-witnesses", ROOM_FIXTURE)).toBeNull();
  });

  it("gates w2e implausible on the ladder before the correction and every event plausible after it", () => {
    const base = roomSource().getSnapshot();
    const corrected = roomSource("corrected").getSnapshot();
    const w2e = base.resolved?.events.find((e) => e.id === "w2e");

    expect(base.statuses.w2e).toBe("implausible");
    expect(w2e?.flags[0]).toMatchObject({ check: "sightline", severity: "hard" });
    expect(w2e?.flags[0]?.evidence.blocker).toBe("ladder");
    expect(Object.values(corrected.statuses).every((status) => status === "plausible")).toBe(true);
    expect(corrected.resolved?.events.flatMap((e) => e.flags)).toEqual([]);
  });

  it("falls back to placeholder boxes when the scan GLB cannot be loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const loaded = await loadScene(ROOM_FIXTURE, false);
    warn.mockRestore();

    expect(loaded.isPlaceholder).toBe(true);
    expect(loaded.manifest).toBe(roomScene);
    expect(loaded.model.getObjectByName("ladder")).toBeDefined();
    expect(ROOM_MISSING_NOTE).toBe("zatec_room.glb is not in apps/web/public/scans");
  });
});

describe("the stairwell's recorded statements", () => {
  it("the claim's tool calls produce the fixture's events", async () => {
    const segment: Segment = {
      id: "seg_claim",
      sessionId: "fixture",
      witnessId: "w1",
      speaker: "witness",
      text: STAIRWELL_CLAIM_TEXT,
      t: [0, 2],
      source: "upload_text",
    };
    const context: ExtractContext = {
      landmarks: roomScene.landmarks,
      actors: stairwellGraph.actors,
      propTypes: propsJson as unknown as PropType[],
      events: [],
      props: [],
      recentSegments: [segment],
    };
    const result = await extractSegment(segment, context, async () => ({ content: [...STAIRWELL_STATEMENTS.calls(segment.text)] }));
    const added = result.patches.flatMap((patch) => (patch.op === "add_event" ? [patch.event] : []));

    expect(added.map(shape)).toEqual(stairwellGraph.events.map(shape));
  });

  it("filing the correction in the Statement box makes w2e plausible, like ?scenario=corrected", async () => {
    const source = roomSource();
    useSceneStore.getState().setGraphSource(source);
    const { segmentId } = await useGraphActions().submitStatement(STAIRWELL_CORRECTION_TEXT, "Witness");
    const status = await settled(source, segmentId);

    expect(status).toEqual({ state: "done", patchCount: 3 });
    expect(source.getSnapshot().statuses.w2e).toBe("plausible");
    expect(Object.values(source.getSnapshot().statuses).every((s) => s === "plausible")).toBe(true);
  });

  it("an unknown statement in the room says which statements fixture mode understands", async () => {
    const source = roomSource();
    useSceneStore.getState().setGraphSource(source);
    const { segmentId } = await useGraphActions().submitStatement("The suspect left by the door.", "Witness");

    expect(await settled(source, segmentId)).toEqual({ state: "done", patchCount: 0, note: STAIRWELL_NOTE });
  });
});

describe("the store fixture", () => {
  it("is byte-identical to main", async () => {
    const fs: { readFile: ReadFile } = await import(NODE_FS);
    const hashes: Record<string, string> = {};
    for (const name of Object.keys(MAIN_STORE_FIXTURES)) {
      const bytes = await fs.readFile(new URL(name, fixturesDir));
      hashes[name] = await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    }
    expect(hashes).toEqual(MAIN_STORE_FIXTURES);
  });
});
