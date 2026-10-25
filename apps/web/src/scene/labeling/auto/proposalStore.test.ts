import type { Landmark, SceneManifest } from "@rashomon/schema";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { create } from "zustand";
import { labelingAdapter, type LabelingEntryLike, type UniqueId } from "./adapter";
import { findCandidates } from "./candidates";
import { NO_CANDIDATES, SUGGEST_FAILED, useProposalStore, type RenderViews, type SuggestDeps } from "./proposalStore";
import { floorMesh, syntheticRoom } from "./testing/syntheticRoom";
import type { ToolProposal } from "./tool";
import { SuggestError, type SuggestTransport } from "./transport";

const uniqueId: UniqueId = (base, taken) => {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
};

const existing: Landmark = {
  id: "counter",
  label: "Counter",
  aliases: [],
  position: [0, 0, 0],
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  kind: "furniture",
  occludes: true,
};

const base: SceneManifest = {
  sceneId: "scan_test",
  meshUrl: "idb:abc",
  up: "y",
  unitsPerMeter: 1,
  eyeHeight: 1.6,
  landmarks: [existing],
  interior: { min: [0, 0, 0], max: [6, 3, 4] },
};

type LabelingLike = {
  entries: LabelingEntryLike[];
  nextKey: number;
  selectedKey: number | null;
  toManifest: () => SceneManifest | null;
  save: (storage: Map<string, string>) => void;
};

function labelingStore() {
  return create<LabelingLike>((_set, get) => ({
    entries: [{ key: 1, idAuto: true, landmark: existing }],
    nextKey: 2,
    selectedKey: null,
    toManifest: () => ({ ...base, landmarks: get().entries.map((entry) => entry.landmark) }),
    save: (storage) => {
      storage.set(`rashomon.manifest.${base.sceneId}`, JSON.stringify(get().toManifest()));
    },
  }));
}

const room = { geom: syntheticRoom(), model: {} as never };
const render: RenderViews = () => ["/9j/AAAA", "/9j/BBBB", "/9j/CCCC"];
const toolProposals: ToolProposal[] = [
  { candidate: "c1", label: "counter", kind: "occluder", occludes: true, confidence: 0.92, id: "counter" },
  { candidate: "c2", label: "shelf", kind: "occluder", occludes: true, confidence: 0.81, id: "shelf_a" },
  { candidate: "c3", label: "shelf", kind: "occluder", occludes: true, confidence: 0.77, id: "shelf_b" },
];

function deps(transport: SuggestTransport = vi.fn<SuggestTransport>().mockResolvedValue({ proposals: toolProposals, dropped: 1 })): SuggestDeps {
  return { transport, render };
}

function saved(storage: Map<string, string>): SceneManifest {
  return JSON.parse(storage.get(`rashomon.manifest.${base.sceneId}`)!) as SceneManifest;
}

beforeEach(() => useProposalStore.getState().clear());

describe("proposals never reach the manifest unconfirmed", () => {
  test("three pending proposals: save writes no new landmarks, and rename without confirm writes nothing", async () => {
    const labeling = labelingStore();
    await useProposalStore.getState().suggest(room, deps());
    expect(useProposalStore.getState().proposals.map((p) => p.number)).toEqual([1, 2, 3]);
    expect(useProposalStore.getState().dropped).toBe(1);

    const storage = new Map<string, string>();
    labeling.getState().save(storage);
    expect(saved(storage).landmarks).toEqual([existing]);
    expect(JSON.stringify(saved(storage))).not.toMatch(/shelf|portals/);

    useProposalStore.getState().rename("c2", { label: "Chips shelf", id: "chips_shelf" });
    labeling.getState().save(storage);
    expect(saved(storage).landmarks).toEqual([existing]);
    expect(useProposalStore.getState().proposals[1]).toMatchObject({ label: "Chips shelf", id: "chips_shelf" });
  });

  test("confirm writes exactly that one with the candidate's bounds, through a unique id", async () => {
    const labeling = labelingStore();
    const adapter = labelingAdapter(labeling, uniqueId);
    await useProposalStore.getState().suggest(room, deps());
    const candidate = useProposalStore.getState().proposals[0]!.candidate;

    expect(useProposalStore.getState().confirm("c1", adapter)).toBe(true);

    const storage = new Map<string, string>();
    labeling.getState().save(storage);
    const landmarks = saved(storage).landmarks;
    expect(landmarks).toHaveLength(2);
    expect(landmarks[1]).toEqual({
      id: "counter_2",
      label: "Counter",
      aliases: ["counter"],
      position: candidate.position,
      bounds: candidate.bounds,
      kind: "furniture",
      occludes: true,
    });
    expect(saved(storage).portals).toBeUndefined();
    expect(useProposalStore.getState().proposals.map((p) => p.candidate.id)).toEqual(["c2", "c3"]);
    expect(useProposalStore.getState().portals?.waypoints.length).toBeGreaterThan(0);
  });

  test("a renamed proposal confirms with its new label and id", async () => {
    const labeling = labelingStore();
    await useProposalStore.getState().suggest(room, deps());
    useProposalStore.getState().rename("c3", { label: "Drinks shelf", id: "drinks_shelf" });
    useProposalStore.getState().confirm("c3", labelingAdapter(labeling, uniqueId));
    expect(labeling.getState().entries.map((e) => [e.landmark.id, e.landmark.label])).toEqual([
      ["counter", "Counter"],
      ["drinks_shelf", "Drinks shelf"],
    ]);
  });

  test("an invalid rename refuses to confirm and writes nothing", async () => {
    const labeling = labelingStore();
    await useProposalStore.getState().suggest(room, deps());
    useProposalStore.getState().rename("c1", { id: "Not An Id" });
    expect(useProposalStore.getState().confirm("c1", labelingAdapter(labeling, uniqueId))).toBe(false);
    expect(labeling.getState().entries).toHaveLength(1);
    expect(useProposalStore.getState().error).toMatch(/snake_case/);
  });

  test("delete removes the proposal and writes nothing", async () => {
    const labeling = labelingStore();
    await useProposalStore.getState().suggest(room, deps());
    useProposalStore.getState().remove("c2");
    expect(useProposalStore.getState().proposals.map((p) => p.candidate.id)).toEqual(["c1", "c3"]);
    expect(labeling.getState().entries).toHaveLength(1);
  });
});

describe("suggest", () => {
  test("sends only candidate ids and sizes, never bounds or positions", async () => {
    const transport = vi.fn<SuggestTransport>().mockResolvedValue({ proposals: [], dropped: 0 });
    await useProposalStore.getState().suggest(room, deps(transport));
    const [payload] = transport.mock.calls[0]!;
    const found = findCandidates(room.geom);
    expect(found.ok && payload.candidates).toEqual(found.ok && found.candidates.map(({ id, size }) => ({ id, size })));
    expect(JSON.stringify(payload.candidates)).not.toMatch(/bounds|position/);
  });

  test("a failure shows a short error and leaves the proposals and the editor untouched", async () => {
    await useProposalStore.getState().suggest(room, deps());
    const before = useProposalStore.getState().proposals;
    const failing = vi.fn<SuggestTransport>().mockRejectedValue(new Error("socket hang up"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await useProposalStore.getState().suggest(room, deps(failing));
    expect(useProposalStore.getState()).toMatchObject({ status: "error", error: SUGGEST_FAILED, proposals: before });
    await useProposalStore.getState().suggest(room, deps(vi.fn<SuggestTransport>().mockRejectedValue(new SuggestError("The dev server has no ANTHROPIC_API_KEY"))));
    expect(useProposalStore.getState().error).toBe("The dev server has no ANTHROPIC_API_KEY");
  });

  test("a room with no floor or no objects is refused before any call", async () => {
    const transport = vi.fn<SuggestTransport>();
    await useProposalStore.getState().suggest({ geom: syntheticRoom(0, false), model: {} as never }, deps(transport));
    expect(useProposalStore.getState().error).toMatch(/No floor found/);
    await useProposalStore.getState().suggest({ geom: { meshes: [floorMesh("floor", [0, 0], [6, 4])] }, model: {} as never }, deps(transport));
    expect(useProposalStore.getState().error).toBe(NO_CANDIDATES);
    expect(transport).not.toHaveBeenCalled();
  });

  test("cancel aborts the request and drops its result", async () => {
    let resolve: (value: { proposals: ToolProposal[]; dropped: number }) => void = () => undefined;
    let signal: AbortSignal | null = null;
    const transport: SuggestTransport = (_payload, s) => {
      signal = s;
      return new Promise((done) => (resolve = done));
    };
    const running = useProposalStore.getState().suggest(room, deps(transport));
    await vi.waitFor(() => expect(signal).not.toBeNull());
    expect(useProposalStore.getState().status).toBe("running");
    useProposalStore.getState().cancel();
    expect(signal!.aborted).toBe(true);
    resolve({ proposals: toolProposals, dropped: 0 });
    await running;
    expect(useProposalStore.getState()).toMatchObject({ status: "idle", proposals: [], error: null });
  });
});
