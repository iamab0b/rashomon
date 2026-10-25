import { storeScene } from "@rashomon/schema/fixtures";
import type { SceneManifest } from "@rashomon/schema";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { storeDroppedScan, loadScan, scanManifest, type LoadedScan } from "../loaders/scan";
import { LIVE_SCAN_MESSAGE, scanFailure } from "../loaders/scanRequest";
import { useScanToolsStore } from "../loaders/scanToolsStore";
import { meshKeyOf } from "../loaders/sceneLoad";
import { NO_GEOM } from "../playback/graphSource";
import { Scene, useMeshSwitcher, useScanRequest, useSceneFailure } from "../Scene";
import { failureSkipped } from "../sceneFailure";
import { useSceneStore } from "../store";
import { callHook, callHookWithEffects, findElement } from "../testing/hookHost";
import { applyManifest } from "./importFlow";
import { useLabelingStore } from "./labelingStore";
import { seedManifest } from "./seeds";
import { manifestKey } from "./storage";
import { memoryStorage } from "./testStorage";

vi.mock("../loaders/scan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loaders/scan")>()),
  storeDroppedScan: vi.fn(),
  loadScan: vi.fn(),
}));

const initialLabeling = useLabelingStore.getState();
const initialScene = useSceneStore.getState();
const initialTools = useScanToolsStore.getState();

function state() {
  return useLabelingStore.getState();
}

function stubWindow(search: string) {
  const replaceState = vi.fn();
  const confirm = vi.fn(() => true);
  vi.stubGlobal("window", { location: { search }, history: { state: null, replaceState }, confirm });
  return { replaceState, confirm };
}

function shownScan(meshUrl: string): LoadedScan {
  return { meshUrl, hash: "h", geom: NO_GEOM, aligned: true, supplied: false } as unknown as LoadedScan;
}

beforeEach(() => {
  vi.mocked(storeDroppedScan).mockReset();
  vi.mocked(loadScan).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  useLabelingStore.setState(initialLabeling, true);
  useSceneStore.setState(initialScene, true);
  useScanToolsStore.setState(initialTools, true);
});

describe("drop through useScanRequest", () => {
  const search = "?manifest=local:X&edit=landmarks&scene=idb:old";
  const file = new File([new Uint8Array(4)], "new.glb");

  test("a dirty editor asks first, and declining leaves everything alone", () => {
    const win = stubWindow(search);
    win.confirm.mockReturnValue(false);
    state().load(seedManifest(), "scan:idb:old");
    state().addAt([1, 0, 1]);
    const api = callHook(() => useScanRequest(true));

    api.drop(file);

    expect(win.confirm).toHaveBeenCalledWith("Discard unsaved landmark edits?");
    expect(storeDroppedScan).not.toHaveBeenCalled();
    expect(win.replaceState).not.toHaveBeenCalled();
  });

  test("a clean editor does not ask", async () => {
    const win = stubWindow(search);
    vi.mocked(storeDroppedScan).mockResolvedValue("newhash");
    state().load(seedManifest(), "scan:idb:old");
    const api = callHook(() => useScanRequest(true));

    api.drop(file);
    await vi.waitFor(() => expect(win.replaceState).toHaveBeenCalled());

    expect(win.confirm).not.toHaveBeenCalled();
  });

  test("the drop clears ?manifest= and Save writes the new mesh under a new id", async () => {
    const win = stubWindow(search);
    vi.mocked(storeDroppedScan).mockResolvedValue("newhash");
    const storage = memoryStorage();
    const old: SceneManifest = { ...seedManifest(), sceneId: "X", meshUrl: "idb:old" };
    storage.setItem(manifestKey("X"), JSON.stringify(old));
    state().load(old, "scan:idb:old");
    const api = callHook(() => useScanRequest(true));

    api.drop(file);
    await vi.waitFor(() => expect(win.replaceState).toHaveBeenCalled());

    const url = new URLSearchParams(win.replaceState.mock.calls[0]![2] as string);
    expect(url.has("manifest")).toBe(false);
    expect(url.get("scene")).toBe("idb:newhash");
    expect(url.get("edit")).toBe("landmarks");

    state().load(scanManifest("newhash", "idb:newhash", NO_GEOM), "scan:idb:newhash");
    state().addAt([2, 0, 2]);
    expect(state().save(storage)).toBe(true);

    const saved = JSON.parse(storage.getItem(manifestKey("scan:newhash"))!) as SceneManifest;
    expect(saved.meshUrl).toBe("idb:newhash");
    expect(saved.landmarks).toHaveLength(1);
    expect(JSON.parse(storage.getItem(manifestKey("X"))!)).toEqual(old);
  });
});

describe("useMeshSwitcher", () => {
  test("registers while editing, switches to a loadable mesh and clears on cleanup", async () => {
    const replace = vi.fn();
    vi.mocked(loadScan).mockResolvedValue({ meshUrl: "idb:next" } as LoadedScan);
    state().load(seedManifest(), "scan:idb:old");
    const hook = callHookWithEffects(() => useMeshSwitcher(true, shownScan("idb:old"), replace));
    expect(state().meshSwitcher).not.toBeNull();

    const ok = await applyManifest({ ...seedManifest(), sceneId: "next", meshUrl: "idb:next" });

    expect(ok).toBe(true);
    expect(replace).toHaveBeenCalledWith({ scan: { kind: "idb", hash: "next" }, manifest: null }, "idb:next");
    expect(state().sessionKey).toBe("scan:idb:next");
    hook.cleanup();
    expect(state().meshSwitcher).toBeNull();
  });

  test("an unloadable mesh is refused with the error card and the editor untouched", async () => {
    const replace = vi.fn();
    vi.mocked(loadScan).mockRejectedValue(new Error("The scan at /nope.glb could not be fetched (404)"));
    state().load(seedManifest(), "scan:idb:old");
    const before = state().toManifest();
    callHookWithEffects(() => useMeshSwitcher(true, shownScan("idb:old"), replace));

    const ok = await applyManifest({ ...seedManifest(), meshUrl: "/nope.glb" });

    expect(ok).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(state().toManifest()).toEqual(before);
    expect(useSceneStore.getState().status).toBe("error");
    expect(useSceneStore.getState().error).toContain("404");
  });

  test("it does not register outside the editor", () => {
    callHookWithEffects(() => useMeshSwitcher(false, null, vi.fn()));
    expect(state().meshSwitcher).toBeNull();
  });
});

describe("kept room bounds", () => {
  test("importing without interior over the same mesh stores the kept interior in base", () => {
    state().begin(storeScene, "fixture:store:");
    const kept = storeScene.interior!;
    const { interior: _drop, ...withoutInterior } = storeScene;

    state().load(withoutInterior as SceneManifest);

    expect(state().base?.interior).toEqual(kept);
    expect(meshKeyOf(state().base)).toBe(meshKeyOf(storeScene));
    expect(state().toManifest()?.interior).toEqual(kept);
  });

  test("the placeholder bounds effect then restores the same interior", () => {
    state().begin(storeScene, "fixture:store:");
    const { interior: _drop, ...withoutInterior } = storeScene;
    state().load(withoutInterior as SceneManifest);

    state().setInterior(state().base?.interior);

    expect(state().toManifest()?.interior).toEqual(storeScene.interior);
  });
});

describe("Scene tools hosting", () => {
  const hasOverlay = (props: Parameters<typeof Scene>[0]) =>
    findElement(callHook(() => Scene(props)), (p) => "data-scene-tools-overlay" in p) !== null;

  test("by default the panels render inside Scene while the editor is open", () => {
    stubWindow("?edit=landmarks");
    expect(hasOverlay({ fixture: "store" })).toBe(true);
  });

  test("with sceneToolsHosted the host mounts them and Scene does not", () => {
    stubWindow("?edit=landmarks");
    expect(hasOverlay({ fixture: "store", sceneToolsHosted: true })).toBe(false);
  });

  test("the default URL draws no overlay either way", () => {
    stubWindow("");
    expect(hasOverlay({ fixture: "store" })).toBe(false);
  });

  test("a loaded scan draws the overlay by default", () => {
    stubWindow("?scene=idb:abc");
    useScanToolsStore.setState({ scan: shownScan("idb:abc") });
    expect(hasOverlay({ fixture: "store" })).toBe(true);
    expect(hasOverlay({ fixture: "store", sceneToolsHosted: true })).toBe(false);
  });
});

describe("live scan editing", () => {
  const search = "?edit=landmarks&scene=x&mode=live";

  test("the editor in live mode keeps the failure check on", () => {
    const liveScan = scanFailure(search);
    expect(liveScan).toBe(LIVE_SCAN_MESSAGE);
    expect(failureSkipped({ isRigDebug: false, graphless: true, liveScan })).toBe(false);
    expect(failureSkipped({ isRigDebug: false, graphless: true, liveScan: null })).toBe(true);
    expect(failureSkipped({ isRigDebug: true, graphless: false, liveScan })).toBe(true);
  });

  test("?edit=landmarks&scene=x&mode=live shows the needs-the-server message", () => {
    stubWindow(search);
    const skip = failureSkipped({ isRigDebug: false, graphless: true, liveScan: scanFailure(search) });
    const request = { scan: { kind: "url", url: "x" } as const, manifest: null };

    const { result } = callHookWithEffects(() => useSceneFailure("store", skip, false, { request, loaded: false }));

    expect(result).toBe(LIVE_SCAN_MESSAGE);
    expect(useSceneStore.getState().status).toBe("error");
    expect(useSceneStore.getState().error).toBe(LIVE_SCAN_MESSAGE);
  });
});
