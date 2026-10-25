import type { EventGraph } from "@rashomon/schema";
import { robberyGraph, roomScene, storeScene } from "@rashomon/schema/fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import stairwellJson from "../../../../../packages/schema/fixtures/stairwell.graph.json";
import type { GraphSource } from "../playback/graphSource";
import { Scene } from "../Scene";
import { useSceneStore } from "../store";
import { callHookWithEffects } from "../testing/hookHost";

const stairwell = stairwellJson as unknown as EventGraph;
const requested = vi.hoisted(() => [] as string[]);

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  const three = await import("three");
  class GLTFLoader {
    register() {
      return this;
    }
    loadAsync(url: string) {
      requested.push(url);
      const scene = new three.Group();
      scene.add(new three.Mesh(new three.BoxGeometry(1, 1, 1), new three.MeshStandardMaterial()));
      return Promise.resolve({ scene });
    }
  }
  return { GLTFLoader };
});

const initialScene = useSceneStore.getState();

function source(kind: GraphSource["kind"]): GraphSource {
  return { kind, getSnapshot: () => ({ graph: null, resolved: null }) as never, subscribe: () => () => undefined };
}

async function meshRequestsFor(kind: GraphSource["kind"], graph: EventGraph): Promise<string[]> {
  useSceneStore.setState({ graphSource: source(kind), graph });
  const { cleanup } = callHookWithEffects(() => Scene({ fixture: "store" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  return [...requested];
}

beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal("window", {
    location: { search: "" },
    history: { state: null, replaceState: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSceneStore.setState(initialScene, true);
});

describe("Scene draws the live session's scene", () => {
  it("a live room_v1 session requests only the room scan", async () => {
    expect(await meshRequestsFor("live", stairwell)).toEqual([roomScene.meshUrl]);
  });

  it("a live store_v1 session requests only the store mesh", async () => {
    expect(await meshRequestsFor("live", robberyGraph)).toEqual([storeScene.meshUrl]);
  });

  it("a fixture source ignores the graph's scene and requests the page's fixture", async () => {
    expect(await meshRequestsFor("fixture", stairwell)).toEqual([storeScene.meshUrl]);
  });
});
