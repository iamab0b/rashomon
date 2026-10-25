import { storeScene } from "@rashomon/schema/fixtures";
import type { SceneManifest } from "@rashomon/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ScanPanel } from "../loaders/ScanPanel";
import type { LoadedScan } from "../loaders/scan";
import { useScanAlignStore } from "../loaders/scanAlignStore";
import { useScanToolsStore } from "../loaders/scanToolsStore";
import { meshKeyOf } from "../loaders/sceneLoad";
import { NO_GEOM } from "../playback/graphSource";
import { SceneTools, useSceneToolsAvailable } from "../SceneTools";
import { callHook, findElement } from "../testing/hookHost";
import { EditorLayer } from "./EditorLayer";
import { applyManifest } from "./importFlow";
import { sessionAction, useLabelingStore, type MeshSwitcher } from "./labelingStore";
import { seedManifest } from "./seeds";
import { scanRequestForSavedManifest, searchWithMesh } from "./storage";
import { memoryStorage } from "./testStorage";

function state() {
  return useLabelingStore.getState();
}

const scanMesh = "idb:abc123";
const scanManifest: SceneManifest = { ...seedManifest(), sceneId: "scan_one", meshUrl: scanMesh };

function fakeScan(): LoadedScan {
  return { hash: "abcdef123456", aligned: true, geom: NO_GEOM, supplied: false } as unknown as LoadedScan;
}

function stubSearch(search: string) {
  vi.stubGlobal("window", { location: { search } });
}

const initialLabeling = useLabelingStore.getState();
const initialAlign = useScanAlignStore.getState();
const initialTools = useScanToolsStore.getState();

afterEach(() => {
  vi.unstubAllGlobals();
  useLabelingStore.setState(initialLabeling, true);
  useScanAlignStore.setState(initialAlign, true);
  useScanToolsStore.setState(initialTools, true);
});

describe("saved scan manifests", () => {
  test("an idb: meshUrl is routed to the scan loader with its local manifest", () => {
    expect(scanRequestForSavedManifest(scanManifest)).toEqual({
      scan: { kind: "idb", hash: "abc123" },
      manifest: { kind: "local", sceneId: "scan_one" },
    });
  });

  test("a plain meshUrl keeps the fixture loader", () => {
    expect(scanRequestForSavedManifest(storeScene)).toBeNull();
    expect(scanRequestForSavedManifest({ ...storeScene, meshUrl: "https://x/y.glb" })).toBeNull();
  });

  test("switching meshes rewrites scene and drops the manifest param", () => {
    expect(searchWithMesh("?edit=landmarks&scene=idb:old&manifest=local:a", "idb:new")).toBe("?edit=landmarks&scene=idb%3Anew");
  });
});

describe("editor session", () => {
  test("the first scan begins a session, a different scan resets it, the same scan keeps it", () => {
    expect(sessionAction(null, "scan:idb:a")).toBe("begin");
    expect(sessionAction("fixture:store:", "scan:idb:a")).toBe("reset");
    expect(sessionAction("scan:idb:a", "scan:idb:a")).toBe("keep");
    expect(sessionAction("scan:idb:a", null)).toBe("keep");
  });

  test("a reset replaces the old labels and ids with the new scan's", () => {
    state().begin(storeScene, "fixture:store:");
    expect(state().entries).toHaveLength(11);

    state().load(scanManifest, "scan:idb:abc123");

    expect(state().entries).toHaveLength(5);
    expect(state().toManifest()).toMatchObject({ sceneId: "scan_one", meshUrl: scanMesh });
  });

  test("edits make the session dirty and saving clears it", () => {
    state().load(seedManifest(), "k");
    expect(state().isDirty()).toBe(false);
    state().addAt([1, 0, 1]);
    expect(state().isDirty()).toBe(true);
    expect(state().save(memoryStorage())).toBe(true);
    expect(state().isDirty()).toBe(false);
  });
});

describe("importing a manifest over a displayed scan", () => {
  beforeEach(() => {
    state().load(seedManifest(), "scan:idb:old");
  });

  test("a refused mesh leaves the editor untouched and says why", async () => {
    const before = state().toManifest();
    const refuse: MeshSwitcher = async () => ({ ok: false, error: "The scan could not be fetched (404)" });
    state().setMeshSwitcher(refuse);

    expect(await applyManifest(scanManifest)).toBe(false);

    expect(state().toManifest()).toEqual(before);
    expect(state().message).toBe("Import refused: The scan could not be fetched (404)");
  });

  test("an accepted mesh loads the manifest under the new session key", async () => {
    state().setMeshSwitcher(async () => ({ ok: true, key: "scan:idb:abc123" }));

    expect(await applyManifest(scanManifest)).toBe(true);

    expect(state().sessionKey).toBe("scan:idb:abc123");
    expect(state().toManifest()?.meshUrl).toBe(scanMesh);
  });

  test("without a switcher the manifest loads directly", async () => {
    expect(await applyManifest(scanManifest)).toBe(true);
    expect(state().toManifest()?.sceneId).toBe("scan_one");
  });
});

describe("placement while aligning", () => {
  test("the placement plane is gone while the Align button is active", () => {
    state().load(seedManifest(), "k");
    const hasPlane = () => findElement(callHook(() => EditorLayer()), (props) => "interior" in props) !== null;

    expect(hasPlane()).toBe(true);
    useScanAlignStore.setState({ aligning: true });
    expect(hasPlane()).toBe(false);
    useScanAlignStore.setState({ aligning: false });
    expect(hasPlane()).toBe(true);
  });
});

describe("imported rooms", () => {
  test("the load key follows the interior but not landmark edits", () => {
    const base = seedManifest();
    const wider = { ...base, interior: { min: [0, 0, 0] as [number, number, number], max: [12, 3, 7] as [number, number, number] } };
    const edited = { ...base, landmarks: base.landmarks.slice(1) };

    expect(meshKeyOf(wider)).not.toBe(meshKeyOf(base));
    expect(meshKeyOf(edited)).toBe(meshKeyOf(base));
    expect(meshKeyOf(null)).toBeNull();
  });
});

describe("SceneTools", () => {
  const render = () => renderToStaticMarkup(callHook(() => SceneTools()));

  test("the default URL renders neither panel and reports nothing available", () => {
    stubSearch("");
    expect(render()).toBe("");
    expect(callHook(() => useSceneToolsAvailable())).toBe(false);
  });

  test("a scan renders the scan panel only", () => {
    stubSearch("?scene=idb:abc");
    useScanToolsStore.setState({ scan: fakeScan() });
    const html = render();

    expect(html).toContain("data-scan-panel");
    expect(html).not.toContain("labeling-panel");
    expect(callHook(() => useSceneToolsAvailable())).toBe(true);
  });

  test("edit mode renders the labeling panel only", () => {
    stubSearch("?edit=landmarks");
    const html = render();

    expect(html).toContain("labeling-panel");
    expect(html).not.toContain("data-scan-panel");
    expect(callHook(() => useSceneToolsAvailable())).toBe(true);
  });

  test("a scan in edit mode renders both, and rig debug renders neither editor", () => {
    stubSearch("?scene=idb:abc&edit=landmarks");
    useScanToolsStore.setState({ scan: fakeScan() });
    const both = render();
    expect(both).toContain("data-scan-panel");
    expect(both).toContain("labeling-panel");

    useScanToolsStore.setState({ scan: null });
    stubSearch("?edit=landmarks&debug=rig");
    expect(render()).toBe("");
  });

  test("the scan panel lays out in flow so it fits the rail", () => {
    const html = renderToStaticMarkup(callHook(() => ScanPanel({ scan: fakeScan() })));
    expect(html).not.toContain("position:absolute");
  });
});
