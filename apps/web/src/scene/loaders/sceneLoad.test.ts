import { Group } from "three";
import { describe, expect, test } from "vitest";
import { storeScene } from "@rashomon/schema/fixtures";
import type { SceneStatus } from "../store";
import type { LoadedScene } from "./scene";
import { beginSceneLoad } from "./sceneLoad";

function scene(): LoadedScene {
  return { manifest: storeScene, model: new Group(), isPlaceholder: false };
}

function sinks() {
  const events: string[] = [];
  return {
    events,
    sinks: {
      setLoaded: (loaded: LoadedScene | null) => void events.push(loaded ? "loaded" : "cleared"),
      setStatus: (status: SceneStatus, error?: string | null) => void events.push(error ? `${status}:${error}` : status),
    },
  };
}

describe("beginSceneLoad", () => {
  test("switching meshes clears the old scene before the new one arrives, so the ready signal remounts", async () => {
    const run = sinks();
    beginSceneLoad("store", () => Promise.resolve(scene()), run.sinks);
    await Promise.resolve();
    await Promise.resolve();
    beginSceneLoad("store", () => Promise.resolve(scene()), run.sinks);
    await Promise.resolve();
    await Promise.resolve();

    expect(run.events).toEqual(["cleared", "loading", "loaded", "cleared", "loading", "loaded"]);
  });

  test("a cancelled load never lands", async () => {
    const run = sinks();
    const cancel = beginSceneLoad("store", () => Promise.resolve(scene()), run.sinks);
    cancel();
    await Promise.resolve();
    await Promise.resolve();

    expect(run.events).toEqual(["cleared", "loading"]);
  });

  test("a failed load reports the error", async () => {
    const run = sinks();
    beginSceneLoad("store", () => Promise.reject(new Error("boom")), run.sinks);
    await Promise.resolve();
    await Promise.resolve();

    expect(run.events.at(-1)).toBe("error:The scene could not be loaded: boom");
  });
});
