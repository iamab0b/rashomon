import { storeScene } from "@rashomon/schema/fixtures";
import type { SceneManifest } from "@rashomon/schema";
import { beforeEach, describe, expect, test } from "vitest";
import { useLabelingStore } from "./labelingStore";
import { idErrorFor, labelErrorFor } from "./landmarkErrors";
import { seedManifest } from "./seeds";
import {
  buildManifest,
  isGraphlessSearch,
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
    ["reversed interior", { ...storeScene, interior: { min: [9, 0, 0], max: [0, 3, 7] } }],
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

function state() {
  return useLabelingStore.getState();
}

function entryOf(id: string) {
  const entry = state().entries.find((candidate) => candidate.landmark.id === id);
  if (!entry) throw new Error(`no landmark ${id}`);
  return entry;
}

function ids(): string[] {
  return state().entries.map((entry) => entry.landmark.id);
}

describe("save, reload and validate", () => {
  beforeEach(() => {
    state().load(seedManifest());
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

  test("placing a landmark and saving it survives a reload through ?manifest=local:", () => {
    const storage = memoryStorage();
    state().addAt([2, 0, 3]);
    state().setLabel(state().selectedKey!, "Ice Bin");
    expect(state().save(storage)).toBe(true);

    const source = manifestSourceFromSearch("?manifest=local:scan_demo", storage);

    expect(source.kind).toBe("ok");
    const landmarks = (source as { manifest: SceneManifest }).manifest.landmarks;
    expect(landmarks.at(-1)).toMatchObject({ id: "ice_bin", label: "Ice Bin", kind: "furniture", occludes: true });
  });

  test("saving is refused while an id is duplicated", () => {
    const storage = memoryStorage();
    state().setId(entryOf("counter").key, "door");

    expect(state().save(storage)).toBe(false);
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

  test("graphless views are edit mode and a saved manifest without a scan", () => {
    expect(isGraphlessSearch("")).toBe(false);
    expect(isGraphlessSearch("?fixture=store")).toBe(false);
    expect(isGraphlessSearch("?edit=landmarks")).toBe(true);
    expect(isGraphlessSearch("?manifest=local:scan_demo")).toBe(true);
    expect(isGraphlessSearch("?scene=/a.glb&manifest=local:scan_demo")).toBe(false);
  });
});

describe("labeling store", () => {
  beforeEach(() => {
    state().load(seedManifest());
  });

  test("placing adds a 1 x 1 x 1 furniture box with occludes on", () => {
    state().addAt([4, 0, 2]);
    const placed = state().entries.at(-1)!.landmark;

    expect(placed).toMatchObject({ kind: "furniture", occludes: true, position: [4, 0, 1.5] });
    expect(placed.bounds).toEqual({ min: [3.5, 0, 1.5], max: [4.5, 1, 2.5] });
    expect(state().selectedKey).toBe(state().entries.at(-1)!.key);
  });

  test("changing the kind resets occludes to the kind default", () => {
    const key = entryOf("counter").key;
    state().setKind(key, "zone");
    expect(entryOf("counter").landmark.occludes).toBe(false);
    state().setKind(key, "appliance");
    expect(entryOf("counter").landmark.occludes).toBe(true);
  });

  test("sizing and moving rewrite position and bounds", () => {
    const key = entryOf("counter").key;
    state().setSize(key, { width: 2, height: 1.2 });
    state().moveTo(key, 6, 4);
    const counter = entryOf("counter").landmark;

    expect(counter.bounds).toEqual({ min: [5, 0, 2.5], max: [7, 1.2, 5.5] });
    expect(counter.position).toEqual([6, 0, 2.5]);
  });

  test("renaming one landmark to a clashing id leaves the other untouched by edits and delete", () => {
    const counterKey = entryOf("counter").key;
    const doorBefore = structuredClone(entryOf("door").landmark);
    state().select(counterKey);
    state().setId(counterKey, "door");

    expect(state().selectedKey).toBe(counterKey);
    expect(idErrorFor(state().entries, counterKey)).toBe("Id is already used");
    expect(idErrorFor(state().entries, entryOf("shelf_a").key)).toBeNull();

    state().setLabel(counterKey, "Till");
    state().setKind(counterKey, "zone");
    state().setSize(counterKey, { width: 3 });
    state().moveTo(counterKey, 1, 1);
    state().setAliases(counterKey, "a, b");
    expect(state().entries.find((entry) => entry.landmark.id === "door" && entry.key !== counterKey)?.landmark).toEqual(doorBefore);

    state().remove(counterKey);
    expect(ids()).toEqual(["door", "shelf_a", "shelf_b", "cooler"]);
    expect(entryOf("door").landmark).toEqual(doorBefore);
    expect(state().selectedKey).toBeNull();
  });

  test("backspacing an auto id into a clash does not fuse the two landmarks", () => {
    state().addAt([1, 0, 1]);
    state().addAt([2, 0, 2]);
    const [first, second] = state().entries.slice(-2);
    state().setLabel(first!.key, "Shelf");
    state().setLabel(second!.key, "Shelf");
    expect(second!.landmark.id).not.toBe("shelf");
    expect(state().entries.find((entry) => entry.key === second!.key)?.landmark.id).toBe("shelf_2");

    state().setId(second!.key, "shelf");
    state().setSize(second!.key, { height: 2 });

    const firstAfter = state().entries.find((entry) => entry.key === first!.key)!.landmark;
    expect(firstAfter.bounds.max[1]).toBe(1);
    expect(state().save(memoryStorage())).toBe(false);
  });

  test("empty ids and labels are inline errors", () => {
    const key = entryOf("door").key;
    state().setId(key, "");
    state().setLabel(key, "");

    expect(idErrorFor(state().entries, key)).toBe("Id is required");
    expect(labelErrorFor(state().entries, key)).toBe("Label is required");
  });

  test("clearing a label then typing a new one still regenerates an untouched id", () => {
    state().addAt([1, 0, 1]);
    const key = state().selectedKey!;
    state().setLabel(key, "Cooler");
    state().setLabel(key, "");
    expect(state().entries.find((entry) => entry.key === key)!.landmark.id).toBe("cooler_2");
    state().setLabel(key, "Ice Bin");

    expect(state().entries.find((entry) => entry.key === key)!.landmark.id).toBe("ice_bin");
  });

  test("a hand-edited id stops following the label", () => {
    state().addAt([1, 0, 1]);
    const key = state().selectedKey!;
    state().setId(key, "mine");
    state().setLabel(key, "Fridge");

    expect(state().entries.find((entry) => entry.key === key)!.landmark.id).toBe("mine");
  });

  test("loaded landmarks whose id matches their label keep following it", () => {
    const key = entryOf("cooler").key;
    state().setLabel(key, "Back Fridge");

    expect(ids()).toContain("back_fridge");
  });
});

describe("interior on import", () => {
  test("importing a manifest without interior over the same mesh keeps the room bounds", () => {
    const loaded = seedManifest();
    state().load(loaded);
    const measured = { min: [0, 0, 0] as [number, number, number], max: [10, 3.2, 8] as [number, number, number] };
    state().setInterior(measured);
    const { interior: _drop, ...withoutInterior } = seedManifest();

    state().load(withoutInterior);

    expect(state().toManifest()?.interior).toEqual(measured);
  });

  test("a different mesh without interior starts with none until the scene measures it", () => {
    state().load(seedManifest());
    const { interior: _drop, ...withoutInterior } = seedManifest();

    state().load({ ...withoutInterior, meshUrl: "/other.glb" });

    expect(state().toManifest()?.interior).toBeUndefined();
  });

  test("an imported interior wins over the current one", () => {
    state().load(seedManifest());
    state().setInterior({ min: [0, 0, 0], max: [1, 1, 1] });
    const imported = { ...seedManifest(), interior: { min: [0, 0, 0] as [number, number, number], max: [5, 3, 5] as [number, number, number] } };

    state().load(imported);

    expect(state().toManifest()?.interior).toEqual(imported.interior);
  });
});
