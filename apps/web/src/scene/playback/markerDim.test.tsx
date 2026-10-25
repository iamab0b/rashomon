import type { ResolvedEvent } from "@rashomon/engine";
import { act, advance, createRoot, extend, type RootState } from "@react-three/fiber";
import { createElement } from "react";
import * as THREE from "three";
import { Bone, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, type Object3D } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HIDDEN_WITNESS_OPACITY } from "./witnessLayers";
import { useSceneStore } from "../store";
import { buildActorPlayback } from "./actorPose";
import { fixtureGraphSource } from "./graphSource";
import { statusOf } from "./useGraph";
import { disagreementEvents, markerShown } from "./witnessLayers";

vi.mock("../characters/clips", async (importOriginal) => ({ ...(await importOriginal<typeof import("../characters/clips")>()), loadClips: () => Promise.resolve(), loadOptionalClips: () => Promise.resolve(), getClip: () => undefined }));

extend(THREE as never);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SHARED = new Map<string, Group>();

function syntheticSource(): Group {
  const hips = new Bone();
  hips.name = "mixamorigHips";
  const spine = new Bone();
  spine.name = "mixamorigSpine";
  hips.add(spine);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const first = new SkinnedMesh(geometry, new MeshStandardMaterial({ name: "body" }));
  const second = new SkinnedMesh(geometry, new MeshStandardMaterial({ name: "joints" }));
  const skeleton = new Skeleton([hips, spine]);
  first.add(hips);
  first.bind(skeleton);
  second.bind(new Skeleton([hips, spine]));
  const root = new Group();
  root.add(first, second);
  return root;
}

vi.mock("../characters/bodies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../characters/bodies")>();
  return {
    ...actual,
    loadLook: async (look: { rig: string }) => {
      if (!SHARED.has(look.rig)) SHARED.set(look.rig, syntheticSource());
      return { source: SHARED.get(look.rig)!, body: undefined };
    },
  };
});

const { Ghost } = await import("./Ghost");
const { ActorRig } = await import("./ActorRig");

const initial = useSceneStore.getState();
afterEach(() => useSceneStore.setState(initial, true));

function meshesOf(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
}

function opacitiesOf(root: Object3D): number[] {
  return meshesOf(root).flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.opacity));
}

const GHOST_OPACITY = 0.6;

const wireframeOpacities = (root: Object3D): number[] =>
  meshesOf(root).flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter((m) => m instanceof MeshBasicMaterial && m.wireframe).map((m) => m.opacity));

async function mountTogether() {
  const snapshot = fixtureGraphSource("store", "two-witnesses")!.getSnapshot();
  const resolved = snapshot.resolved!;
  useSceneStore.getState().setGraph(snapshot);
  const lookup = (event: ResolvedEvent) => statusOf(snapshot.statuses, event);
  const playback = buildActorPlayback(resolved, "suspect", lookup);
  const marker = disagreementEvents(resolved, lookup).find((event) => event.id === "e11")!;
  const ghost = resolved.events.find((event) => event.id === "e5")!;
  expect(lookup(ghost)).toBe("implausible");
  const look = { rig: "mixamo_ybot" } as const;
  const common = { look, positionOf: () => null, onReady: () => undefined };
  const canvas = { width: 100, height: 100, style: {}, addEventListener() {}, removeEventListener() {}, clientWidth: 100, clientHeight: 100 } as unknown as HTMLCanvasElement;
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, dispose() {}, domElement: canvas, shadowMap: {}, xr: { enabled: false, addEventListener() {}, setAnimationLoop() {} } };
  const root = createRoot(canvas);
  await act(async () => {
    await root.configure({ gl: (() => gl) as never, frameloop: "never", size: { width: 100, height: 100, top: 0, left: 0 } });
  });
  let state!: RootState;
  await act(async () => {
    state = root
      .render(
        createElement(
          "group",
          null,
          createElement(ActorRig, { ...common, key: "rig", playback }),
          createElement(Ghost, { ...common, key: "e5", event: ghost }),
          createElement(Ghost, {
            ...common,
            key: "marker:e11",
            event: marker,
            readyId: "marker:e11",
            color: "#4cd6a0",
            badge: false,
            shownAt: (t: number) => markerShown(playback, marker, t),
          }),
        ),
      )
      .getState();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const groups = state.scene.children[0]!.children;
  return { state, e5: groups[1]!, e11: groups[2]!, teardown: () => root.unmount() };
}

describe("the second-witness marker dims with its witness", () => {
  it("hiding w2 at t 12 dims every material on the e11 marker, leaves the e5 ghost at GHOST_OPACITY, and show all restores both", async () => {
    const { state, e5, e11, teardown } = await mountTogether();
    expect(wireframeOpacities(e11).length).toBeGreaterThan(0);
    expect(wireframeOpacities(e5).length).toBeGreaterThan(0);

    useSceneStore.setState({ t: 12, hiddenWitnesses: new Set(["w2"]) });
    await act(async () => advance(0, true, state));
    expect(e11.visible).toBe(true);
    expect(opacitiesOf(e11).every((o) => o === HIDDEN_WITNESS_OPACITY)).toBe(true);
    expect(wireframeOpacities(e5).every((o) => o === GHOST_OPACITY)).toBe(true);

    useSceneStore.setState({ hiddenWitnesses: new Set() });
    await act(async () => advance(0, true, state));
    expect(opacitiesOf(e11).every((o) => o === GHOST_OPACITY)).toBe(true);
    expect(wireframeOpacities(e5).every((o) => o === GHOST_OPACITY)).toBe(true);
    teardown();
  });
});
