import { AnimationClip, VectorKeyframeTrack } from "three";
import { beforeEach, describe, expect, test, vi } from "vitest";

const loader = vi.hoisted(() => ({ failing: true, calls: 0 }));

vi.mock("three/examples/jsm/loaders/FBXLoader.js", () => ({
  FBXLoader: class {
    async loadAsync(): Promise<{ animations: AnimationClip[] }> {
      loader.calls += 1;
      if (loader.failing) throw new Error("network down");
      const hips = new VectorKeyframeTrack("mixamorigHips.position", [0, 1], [0, 1, 0, 5, 1, 5]);
      return { animations: [new AnimationClip("mixamo.com", 1, [hips])] };
    }
  },
}));

const { CLIP_NAMES, OPTIONAL_CLIP_NAMES, getClip, loadClips } = await import("./clips");

describe("loadClips retry", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  test("a failed load is retried on the next call instead of memoized", async () => {
    loader.failing = true;
    const failed = await loadClips();
    expect(failed.size).toBe(0);
    expect(getClip("clip_walk")).toBeUndefined();

    loader.failing = false;
    loader.calls = 0;
    const retried = await loadClips();

    expect(retried.size).toBe(CLIP_NAMES.length + OPTIONAL_CLIP_NAMES.length);
    expect(getClip("clip_walk")?.name).toBe("clip_walk");
  });

  test("after a complete load, further calls do not hit the loader", async () => {
    loader.calls = 0;

    await loadClips();
    await loadClips();

    expect(loader.calls).toBe(0);
  });
});
