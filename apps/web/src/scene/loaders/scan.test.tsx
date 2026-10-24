import type { SceneManifest } from "@rashomon/schema";
import { robberyGraph, storeScene } from "@rashomon/schema/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { Mesh, type Object3D } from "three";
import { afterEach, describe, expect, test } from "vitest";
import mainGate from "../../../../../packages/engine/src/gate/robbery.main-gate.json";
import { fixtureGraphSource, gatedSnapshot, NO_GEOM } from "../playback/graphSource";
import { SceneErrorCard } from "../SceneErrorCard";
import { useSceneStore } from "../store";
import { brokenIndexedDb, fakeIndexedDb } from "../testing/fakeIndexedDb";
import { callHook } from "../testing/hookHost";
import { buildGlb, gridNode, type TestNode } from "../testing/testGlb";
import { CENTIMETRES } from "./alignment";
import { alignmentFromClick, loadScan, realignScan, SCAN_ROOT, storeDroppedScan } from "./scan";
import { triangleCount } from "./scanGeom";
import { localManifestKey, scanFailure, scanRequestFromSearch, tooLargeMessage, type ScanRequest } from "./scanRequest";
import { scanKey, type ScanRecord } from "./scanStore";
import { failScan } from "./useScanScene";

const initial = useSceneStore.getState();
afterEach(() => useSceneStore.setState(initial, true));

const OPEN_STORE = "store-open";
const openStore: SceneManifest = {
  ...storeScene,
  sceneId: OPEN_STORE,
  landmarks: storeScene.landmarks.map((landmark) => ({ ...landmark, occludes: false })),
};
const storage = { getItem: (key: string) => (key === localManifestKey(OPEN_STORE) ? JSON.stringify(openStore) : null) };

const wall: TestNode = {
  name: "wall",
  positions: [450, 0, 0, 450, 300, 0, 450, 300, 700, 450, 0, 700],
  indices: [0, 1, 2, 0, 2, 3],
};

function verdict(snapshot: ReturnType<typeof gatedSnapshot>) {
  return snapshot.resolved?.events.map((event) => [event.id, event.status, event.flags]);
}

function findMesh(root: Object3D, name: string): Object3D {
  let found: Object3D | null = null;
  root.traverse((object) => {
    if (object instanceof Mesh && object.name === name) found = object;
  });
  if (!found) throw new Error(name);
  return found;
}

describe("a dropped scan", () => {
  test("is stored by hash, aligned with one floor click, and gives the gate its wall", async () => {
    const idb = fakeIndexedDb();
    const bytes = await buildGlb([{ ...gridNode("floor", 1000, 10) }, wall]);
    const file = new File([bytes], "store-scan.glb");
    const hash = await storeDroppedScan(file, { idb: idb.factory });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect((idb.data.get(scanKey(hash)) as ScanRecord).bytes?.byteLength).toBe(bytes.byteLength);

    const request = scanRequestFromSearch(`?scene=idb:${hash}&manifest=local:${OPEN_STORE}`)!;
    const deps = { idb: idb.factory, storage };
    const unaligned = await loadScan(request, deps);
    expect(unaligned.aligned).toBe(false);
    expect(unaligned.model.name).toBe(SCAN_ROOT);
    expect(unaligned.meshUrl).toBe(`idb:${hash}`);

    const alignment = alignmentFromClick(
      unaligned,
      { object: findMesh(unaligned.raw, "floor"), faceIndex: 22, point: [150, 0, 150], direction: [0, -1, 0] },
      CENTIMETRES,
      "bbox",
    )!;
    const scan = await realignScan(unaligned, alignment, deps);
    expect(scan.geom.meshes.map((mesh) => mesh.id)).toEqual(["scan:floor", "scan:wall"]);
    expect(scan.manifest.sceneId).toBe(OPEN_STORE);

    const snapshot = fixtureGraphSource("store", null, { manifest: scan.manifest, geom: scan.geom })!.getSnapshot();
    const e5 = snapshot.resolved!.events.find((event) => event.id === "e5")!;
    expect(e5.status).toBe("implausible");
    expect(e5.flags[0]!.evidence).toMatchObject({ blocker: "scan:wall" });
    expect(e5.flags[0]!.suggestedQuestion).toBe(
      "From the chips aisle, the surface by the drinks aisle would be between you and the suspect. Where exactly were you standing when you saw that?",
    );
    const withoutScan = fixtureGraphSource("store", null, { manifest: scan.manifest, geom: NO_GEOM })!.getSnapshot();
    expect(withoutScan.statuses.e5).toBe("plausible");

    const reloaded = await loadScan(request, deps);
    expect(reloaded.aligned).toBe(true);
    expect(reloaded.alignment).toEqual(alignment);
    expect(reloaded.model.quaternion.toArray()).toEqual(alignment.rotation);
    expect(reloaded.model.scale.x).toBe(CENTIMETRES);
    expect(reloaded.geom).toEqual(scan.geom);
  });

  test("without a manifest it gets a minimal one from the aligned bounds and an empty graph", async () => {
    const idb = fakeIndexedDb();
    const hash = await storeDroppedScan(new File([await buildGlb([gridNode("floor", 900, 9), wall])], "a.glb"), { idb: idb.factory });
    const request: ScanRequest = { scan: { kind: "idb", hash }, manifest: null };
    const unaligned = await loadScan(request, { idb: idb.factory });
    const alignment = alignmentFromClick(
      unaligned,
      { object: findMesh(unaligned.raw, "floor"), faceIndex: 0, point: [0, 0, 0], direction: [0, -1, 0] },
      CENTIMETRES,
      "click",
    )!;
    const scan = await realignScan(unaligned, alignment, { idb: idb.factory });
    expect(scan.manifest).toMatchObject({ sceneId: `scan:${hash}`, meshUrl: `idb:${hash}`, landmarks: [], up: "y" });
    const interior = scan.manifest.interior!;
    [...interior.min, ...interior.max].forEach((v, i) => expect(v).toBeCloseTo([0, 0, 0, 9, 3, 9][i]!, 6));
    const snapshot = fixtureGraphSource("store", null, { manifest: scan.manifest, geom: scan.geom })!.getSnapshot();
    expect(snapshot.resolved?.events).toEqual([]);
    expect(triangleCount(scan.geom)).toBe(9 * 9 * 2 + 2);
  });

  test("a file over 200 MB is refused before it is read", async () => {
    const huge = { size: 201 * 1024 * 1024, name: "big.glb", arrayBuffer: () => Promise.reject(new Error("read")) } as unknown as File;
    await expect(storeDroppedScan(huge, { idb: fakeIndexedDb().factory })).rejects.toThrow(
      "This scan is 201 MB; scans are capped at 200 MB.",
    );
    expect(tooLargeMessage(200 * 1024 * 1024)).toBeNull();
  });
});

describe("a scan from a URL", () => {
  test("loads any GLB and keeps its URL as the mesh url", async () => {
    const bytes = await buildGlb([wall]);
    const fetcher = (async () => new Response(bytes)) as typeof fetch;
    const scan = await loadScan(scanRequestFromSearch("?scene=https://example.test/room.glb")!, { idb: fakeIndexedDb().factory, fetcher });
    expect(scan.meshUrl).toBe("https://example.test/room.glb");
    expect(scan.geom.meshes.map((mesh) => mesh.id)).toEqual(["scan:wall"]);
  });

  test("live mode on a scanned scene is refused with a message", () => {
    expect(scanFailure("?mode=live&scene=idb:abc")).toBe("Live mode needs the scan's manifest on the server");
    expect(scanFailure("?scene=idb:abc")).toBeNull();
    expect(scanFailure("?mode=live")).toBeNull();
  });
});

describe("an IndexedDB failure", () => {
  test("shows the scene error card", async () => {
    await loadScan({ scan: { kind: "idb", hash: "abc" }, manifest: null }, { idb: brokenIndexedDb("blocked by policy") }).catch(failScan);
    const html = renderToStaticMarkup(callHook(() => SceneErrorCard()));
    expect(html).toContain('role="alert"');
    expect(html).toContain("IndexedDB");
    expect(html).toContain("blocked by policy");
  });

  test("on drop also shows the card", async () => {
    await storeDroppedScan(new File([new Uint8Array([1, 2, 3])], "a.glb"), { idb: brokenIndexedDb("quota exceeded") }).catch(failScan);
    expect(useSceneStore.getState().status).toBe("error");
    expect(renderToStaticMarkup(callHook(() => SceneErrorCard()))).toContain("quota exceeded");
  });
});

describe("the store fixture without a scan", () => {
  test("gates byte-identically to main", () => {
    const snapshot = fixtureGraphSource("store")!.getSnapshot();
    expect(JSON.stringify(snapshot.statuses)).toBe(JSON.stringify(mainGate.statuses));
    expect(JSON.stringify(snapshot.resolved!.events.flatMap((event) => event.flags))).toBe(JSON.stringify(mainGate.flags));
    expect(JSON.stringify(verdict(gatedSnapshot(robberyGraph, storeScene)))).toBe(JSON.stringify(verdict(snapshot)));
  });
});
