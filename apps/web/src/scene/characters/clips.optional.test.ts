import { AnimationClip, VectorKeyframeTrack } from "three";
import { beforeEach, describe, expect, test, vi } from "vitest";

const loader = vi.hoisted(() => ({ urls: [] as string[], releaseOptional: () => undefined as void }));

const REQUIRED = /clip_(idle|walk|run|crouch_idle|fall_back|push|shoved|punch|pick_up|look_around|talk|stand_up)\.fbx$/;

vi.mock("three/examples/jsm/loaders/FBXLoader.js", () => ({
  FBXLoader: class {
    async loadAsync(url: string): Promise<{ animations: AnimationClip[] }> {
      loader.urls.push(url);
      if (!REQUIRED.test(url)) {
        await new Promise<void>((resolve) => {
          const previous = loader.releaseOptional;
          loader.releaseOptional = () => {
            previous();
            resolve();
          };
        });
        if (!url.includes("clip_sneak")) throw new Error("404");
      }
      const hips = new VectorKeyframeTrack("mixamorigHips.position", [0, 1], [0, 1, 0, 5, 1, 5]);
      return { animations: [new AnimationClip("mixamo.com", 1, [hips])] };
    }
  },
}));

const { CLIP_NAMES, OPTIONAL_CLIP_NAMES, getClip, loadClips, loadOptionalClips } = await import("./clips");

describe("optional clips", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  test("required clips are ready while optional downloads are still pending", async () => {
    const optional = loadOptionalClips();
    const clips = await loadClips();
    expect(clips.size).toBe(CLIP_NAMES.length);
    expect(getClip("clip_sneak")).toBeUndefined();

    loader.releaseOptional();
    await optional;
    expect(getClip("clip_sneak")?.name).toBe("clip_sneak");
    expect(getClip("clip_dodge")).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
    for (const name of OPTIONAL_CLIP_NAMES) expect(loader.urls).toContain(`/clips/${name}.fbx`);
  });

  test("missing optional files are tried once", async () => {
    loader.urls = [];
    await loadOptionalClips();
    await loadClips();
    expect(loader.urls).toEqual([]);
  });
});
