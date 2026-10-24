import { storeScene } from "@rashomon/schema/fixtures";
import type { SceneManifest } from "@rashomon/schema";
import { beforeEach, describe, expect, test } from "vitest";
import { useLabelingStore } from "./labelingStore";
import { seedManifest } from "./seeds";
import {
  buildManifest,
  isLandmarkEditing,
  manifestKey,
  manifestSourceFromSearch,
  readSavedManifest,
  saveManifest,
  type ManifestStorage,
} from "./storage";
import { landmarkErrors } from "./landmarkErrors";
import { parseManifest, parseManifestText } from "./validate";

function memoryStorage(): ManifestStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwingStorage: ManifestStorage = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

describe("manifest validation", () => {
  test("the store fixture and the seed are valid", () => {
    expect(parseManifest(storeScene).ok).toBe(true);
    expect(parseManifest(seedManifest()).ok).toBe(true);
  });

  test.each([
    ["not an object", 7],
    ["missing sceneId", { ...storeScene, sceneId: "" }],
    ["wrong up axis", { ...storeScene, up: "z" }],
    ["landmarks missing", { ...storeScene, landmarks: undefined }],
    ["unknown kind", { ...storeScene, landmarks: [{ ...storeScene.landmarks[0], kind: "sofa" }] }],
    ["inverted bounds", { ...storeScene, landmarks: [{ ...storeScene.landmarks[0], bounds: { min: [1, 1, 1], max: [0, 0, 0] } }] }],
    ["duplicate ids", { ...storeScene, landmarks: [storeScene.landmarks[0], storeScene.landmarks[0]] }],
    ["empty label", { ...storeScene, landmarks: [{ ...storeScene.landmarks[0], label: " " }] }],
    ["bad interior", { ...storeScene, interior: { min: [0, 0], max: [1, 1, 1] } }],
    ["bad portals", { ...storeScene, portals: { waypoints: [{ id: "a" }], edges: [] } }],
  ])("rejects %s", (_name, value) => {
    expect(parseManifest(value).ok).toBe(false);
  });

  test("rejects text that is not JSON", () => {
    expect(parseManifestText("{nope")).toEqual({ ok: false, error: "Manifest is not valid JSON" });
  });
});

describe("landmark errors", () => {
  const [first] = storeScene.landmarks;

  test("flags empty labels and duplicate ids", () => {
    expect(landmarkErrors([{ ...first!, label: "" }])).toHaveLength(1);
    expect(landmarkErrors([first!, first!])).toEqual([`Id "${first!.id}" is used twice`]);
    expect(landmarkErrors([first!])).toEqual([]);
  });
});

describe("save, reload and validate", () => {
  beforeEach(() => {
    useLabelingStore.getState().load(seedManifest());
  });

  test("a saved manifest reads back identically", () => {
    const storage = memoryStorage();
    const manifest = buildManifest({ sceneId: "scan_demo", meshUrl: "/m.glb" }, seedManifest().landmarks, seedManifest().interior);

    expect(saveManifest(manifest, storage)).toEqual({ ok: true });
    expect(storage.data.has(manifestKey("scan_demo"))).toBe(true);
    expect(readSavedManifest("scan_demo", storage)).toEqual({ ok: true, manifest });
  });

  test("the built manifest has no portals and keeps the landmark list", () => {
    const manifest = buildManifest({ sceneId: "s", meshUrl: "/s.glb" }, storeScene.landmarks, undefined);

    expect(manifest.portals).toBeUndefined();
    expect(manifest.interior).toBeUndefined();
    expect(manifest.landmarks).toHaveLength(11);
    expect(parseManifest(manifest).ok).toBe(true);
  });

  test("placing a landmark in the store and saving it survives a reload through ?manifest=local:", () => {
    const storage = memoryStorage();
    const store = useLabelingStore.getState();
    store.addAt([2, 0, 3]);
    store.setLabel(useLabelingStore.getState().selectedId!, "Ice Bin");
    expect(useLabelingStore.getState().save(storage)).toBe(true);

    const source = manifestSourceFromSearch("?manifest=local:scan_demo", storage);

    expect(source.kind).toBe("ok");
    const landmarks = (source as { manifest: SceneManifest }).manifest.landmarks;
    expect(landmarks.at(-1)).toMatchObject({ id: "ice_bin", label: "Ice Bin", kind: "furniture", occludes: true });
  });

  test("saving is refused while an id is duplicated", () => {
    const storage = memoryStorage();
    const state = useLabelingStore.getState();
    state.setId("counter", "door");

    expect(useLabelingStore.getState().save(storage)).toBe(false);
    expect(storage.data.size).toBe(0);
  });

  test("a corrupt or invalid saved manifest is rejected with an error", () => {
    const storage = memoryStorage();
    storage.setItem(manifestKey("bad"), JSON.stringify({ sceneId: "bad" }));
    storage.setItem(manifestKey("worse"), "{");

    expect(manifestSourceFromSearch("?manifest=local:bad", storage).kind).toBe("error");
    expect(manifestSourceFromSearch("?manifest=local:worse", storage).kind).toBe("error");
    expect(manifestSourceFromSearch("?manifest=local:missing", storage).kind).toBe("error");
    expect(manifestSourceFromSearch("?manifest=remote:x", storage).kind).toBe("error");
    expect(manifestSourceFromSearch("?manifest=local:", storage).kind).toBe("error");
  });

  test("unavailable or throwing storage reports an error instead of throwing", () => {
    expect(saveManifest(seedManifest(), throwingStorage).ok).toBe(false);
    expect(saveManifest(seedManifest(), null).ok).toBe(false);
    expect(readSavedManifest("x", throwingStorage).ok).toBe(false);
    expect(manifestSourceFromSearch("?manifest=local:x", null).kind).toBe("error");
  });

  test("no manifest param means no override", () => {
    expect(manifestSourceFromSearch("?fixture=store", memoryStorage())).toEqual({ kind: "none" });
  });
});

describe("edit mode", () => {
  test("only ?edit=landmarks enters it; the default URL never does", () => {
    expect(isLandmarkEditing("")).toBe(false);
    expect(isLandmarkEditing("?fixture=store")).toBe(false);
    expect(isLandmarkEditing("?fixture=store&t=12&cam=witness_claimed")).toBe(false);
    expect(isLandmarkEditing("?edit=anchors")).toBe(false);
    expect(isLandmarkEditing("?edit=landmarks")).toBe(true);
  });
});

describe("labeling store", () => {
  beforeEach(() => {
    useLabelingStore.getState().load(seedManifest());
  });

  test("placing adds a 1 x 1 x 1 furniture box with occludes on", () => {
    useLabelingStore.getState().addAt([4, 0, 2]);
    const placed = useLabelingStore.getState().landmarks.at(-1)!;

    expect(placed).toMatchObject({ kind: "furniture", occludes: true, position: [4, 0, 1.5] });
    expect(placed.bounds).toEqual({ min: [3.5, 0, 1.5], max: [4.5, 1, 2.5] });
    expect(useLabelingStore.getState().selectedId).toBe(placed.id);
  });

  test("changing the kind resets occludes to the kind default", () => {
    const store = useLabelingStore.getState();
    store.setKind("counter", "zone");
    expect(useLabelingStore.getState().landmarks.find((l) => l.id === "counter")?.occludes).toBe(false);
    store.setKind("counter", "appliance");
    expect(useLabelingStore.getState().landmarks.find((l) => l.id === "counter")?.occludes).toBe(true);
  });

  test("sizing and moving rewrite position and bounds", () => {
    const store = useLabelingStore.getState();
    store.setSize("counter", { width: 2, height: 1.2 });
    store.moveTo("counter", 6, 4);
    const counter = useLabelingStore.getState().landmarks.find((l) => l.id === "counter")!;

    expect(counter.bounds).toEqual({ min: [5, 0, 2.5], max: [7, 1.2, 5.5] });
    expect(counter.position).toEqual([6, 0, 2.5]);
  });
});
