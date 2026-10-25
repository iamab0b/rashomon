import type { ResolvedGraph } from "@rashomon/engine";
import { AnimationClip, AnimationMixer, Group, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type AnimationAction } from "three";
import { describe, expect, test, vi } from "vitest";
import { fixtureGraphSource, type GraphSource } from "../../playback/graphSource";
import { GENERATED_FIXTURE_EVENT, GENERATED_FIXTURE_MOTIONS, GENERATED_FIXTURE_VERB, GENERATED_SCENARIO } from "../../playback/generatedFixture";
import { buildClipWindows, createClipSampler } from "../blend";
import { HIPS_POSITION_TRACK } from "../clips";
import { poseActorFrame, type FramePoser } from "../procedural/applyProcedural";
import { swingClip, syntheticSkeleton } from "../procedural/testRig";
import { HIPS_QUATERNION_TRACK, hipsParentRotation, prepareGeneratedClip, type GltfLike } from "./generatedClip";
import { isGeneratedEvent } from "./generatedState";
import { isGlb, loadGeneratedMotion, motionLoadKey, type GeneratedMotion, type MotionLoaderDeps } from "./loadGeneratedMotion";
import { cacheKey, indexedDbCache, memoryCache } from "./motionCache";
import { syncGeneratedMotions } from "./useGeneratedMotions";
import { genClipName, normalizeVerb } from "./verb";

const RIGHT_ANGLE = Math.PI / 2;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const CHARACTER = "cXChar01";
const MOTION = "mGen0001";
const GEN_CLIP = `gen_${GENERATED_FIXTURE_VERB}`;

function glbBytes(): ArrayBuffer {
  const bytes = new ArrayBuffer(12);
  const view = new DataView(bytes);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 12, true);
  return bytes;
}

function axisQuaternion(axis: Vector3, angle: number): Quaternion {
  return new Quaternion().setFromAxisAngle(axis, angle);
}

function uthanaLikeGltf(duration = 2): GltfLike {
  const scene = new Group();
  const armature = new Object3D();
  armature.name = "Armature";
  armature.quaternion.copy(axisQuaternion(X, RIGHT_ANGLE));
  armature.scale.setScalar(0.01);
  const hips = new Object3D();
  hips.name = "mixamorigHips";
  hips.position.set(0, 0, -99.79);
  hips.quaternion.copy(axisQuaternion(X, -RIGHT_ANGLE));
  const spine = new Object3D();
  spine.name = "mixamorigSpine";
  const head = new Object3D();
  head.name = "mixamorigHead";
  const headTop = new Object3D();
  headTop.name = "mixamorigHeadTop_End";
  scene.add(armature);
  armature.add(hips);
  hips.add(spine);
  spine.add(head);
  head.add(headTop);
  const rest = axisQuaternion(X, -RIGHT_ANGLE);
  const turned = rest.clone().multiply(axisQuaternion(Y, 0.2));
  const tracks = [
    new VectorKeyframeTrack(HIPS_POSITION_TRACK, [0, duration], [-0.33, 0.553, -93.507, -20, 50, -90]),
    new QuaternionKeyframeTrack(HIPS_QUATERNION_TRACK, [0, duration], [...rest.toArray(), ...turned.toArray()]),
    new QuaternionKeyframeTrack("mixamorigSpine.quaternion", [0, duration], [0, 0, 0, 1, 0, 0.1, 0, 0.995]),
    new QuaternionKeyframeTrack("mixamorigHeadTop_End.quaternion", [0, duration], [0, 0, 0, 1, 0, 0, 0, 1]),
  ];
  return { scene, animations: [new AnimationClip("animation_0", duration, tracks)] };
}

function readyMotion(overrides: Partial<GeneratedMotion> = {}): GeneratedMotion {
  return { verb: "Staggers", status: "ready", characterId: CHARACTER, motionId: MOTION, ...overrides };
}

function loaderDeps(overrides: Partial<MotionLoaderDeps> = {}) {
  const registry = new Map<string, AnimationClip>();
  const cache = memoryCache();
  const download = vi.fn(async () => glbBytes());
  const fetchUrl = vi.fn(async () => glbBytes());
  const deps: MotionLoaderDeps = {
    cache,
    download,
    fetchUrl,
    parse: async () => uthanaLikeGltf(),
    register: (clip) => registry.set(clip.name, clip),
    ...overrides,
  };
  return { deps, registry, cache, download, fetchUrl };
}

const values = (clip: AnimationClip, name: string): number[] => Array.from(clip.tracks.find((t) => t.name === name)?.values ?? []);

describe("verbs on the client match the module", () => {
  test.each([
    ["Staggered", "staggered"],
    ["  ducked  ", "ducked"],
    ["sort of   LUNGED", "sort of lunged"],
    ["didn't move", "didn't move"],
    ["half-ran", "half-ran"],
  ])("%j becomes %j", (raw, expected) => {
    expect(normalizeVerb(raw)).toBe(expected);
    expect(genClipName(raw)).toBe(`gen_${expected}`);
  });

  test.each(["", "   ", "ran!", "run; drop table", "1st", "a".repeat(41), "ran\u0000fast"])("%j is refused", (raw) => {
    expect(normalizeVerb(raw)).toBeUndefined();
    expect(genClipName(raw)).toBeUndefined();
  });
});

describe("prepareGeneratedClip", () => {
  test("folds the Z-up armature rotation into the hips tracks and strips horizontal root motion", () => {
    const clip = prepareGeneratedClip(GEN_CLIP, uthanaLikeGltf());

    const hips = values(clip, HIPS_POSITION_TRACK);
    expect(hips[0]).toBe(0);
    expect(hips[1]).toBeCloseTo(93.507, 4);
    expect(hips[2]).toBe(0);
    expect(hips[4]).toBeCloseTo(90, 4);
    const [first, second] = [0, 4].map((offset) => new Quaternion().fromArray(values(clip, HIPS_QUATERNION_TRACK), offset));
    expect(first!.angleTo(new Quaternion())).toBeLessThan(1e-6);
    expect(second!.angleTo(axisQuaternion(Y, 0.2))).toBeLessThan(1e-6);
  });

  test("keeps every other track, the name and the duration as they were", () => {
    const gltf = uthanaLikeGltf(3.9);

    const clip = prepareGeneratedClip(GEN_CLIP, gltf);

    expect(clip.name).toBe(GEN_CLIP);
    expect(clip.duration).toBe(3.9);
    expect(clip.tracks.find((t) => t.name === "mixamorigSpine.quaternion")).toBe(gltf.animations[0]!.tracks[2]);
  });

  test("drops tracks on leaf end bones, which carry no skin", () => {
    const clip = prepareGeneratedClip(GEN_CLIP, uthanaLikeGltf());

    expect(clip.tracks.map((t) => t.name)).toEqual([HIPS_POSITION_TRACK, HIPS_QUATERNION_TRACK, "mixamorigSpine.quaternion"]);
  });

  test("does not mutate the source clip", () => {
    const gltf = uthanaLikeGltf();
    const before = Array.from(gltf.animations[0]!.tracks[0]!.values);

    prepareGeneratedClip(GEN_CLIP, gltf);

    expect(Array.from(gltf.animations[0]!.tracks[0]!.values)).toEqual(before);
  });

  test("a hips bone directly under the root needs no rotation", () => {
    const scene = new Group();
    const hips = new Object3D();
    hips.name = "mixamorigHips";
    scene.add(hips);

    expect(hipsParentRotation(scene).angleTo(new Quaternion())).toBe(0);
  });

  test("a motion without hips or without an animation is refused", () => {
    expect(() => hipsParentRotation(new Group())).toThrow(/mixamorigHips/);
    expect(() => prepareGeneratedClip(GEN_CLIP, { scene: uthanaLikeGltf().scene, animations: [] })).toThrow(/no animation/);
  });
});

describe("loadGeneratedMotion", () => {
  test("a ready row with a cached GLB registers gen_<verb> without any download", async () => {
    const { deps, registry, cache, download } = loaderDeps();
    await cache.put(cacheKey(CHARACTER, MOTION), glbBytes());

    expect(await loadGeneratedMotion(readyMotion(), deps)).toBe("registered");
    expect(download).not.toHaveBeenCalled();
    expect([...registry.keys()]).toEqual(["gen_staggers"]);
  });

  test("a cache miss downloads once and stores the GLB under rashomon.gen.<characterId>.<motionId>", async () => {
    const { deps, registry, cache, download } = loaderDeps();

    expect(await loadGeneratedMotion(readyMotion(), deps)).toBe("registered");
    expect(download).toHaveBeenCalledWith(CHARACTER, MOTION);
    expect([...cache.entries.keys()]).toEqual([`rashomon.gen.${CHARACTER}.${MOTION}`]);
    expect(registry.has("gen_staggers")).toBe(true);
  });

  test("a motion with a url is fetched from it, not through the dev server", async () => {
    const { deps, download, fetchUrl } = loaderDeps();

    expect(await loadGeneratedMotion(readyMotion({ url: "/generated/staggers.glb" }), deps)).toBe("registered");
    expect(fetchUrl).toHaveBeenCalledWith("/generated/staggers.glb");
    expect(download).not.toHaveBeenCalled();
  });

  test.each([
    readyMotion({ status: "pending" }),
    readyMotion({ status: "failed" }),
    readyMotion({ motionId: undefined }),
    readyMotion({ characterId: "../x" }),
    readyMotion({ verb: "ran!" }),
  ])("%j is unavailable and registers nothing", async (motion) => {
    const { deps, registry, download } = loaderDeps();

    expect(await loadGeneratedMotion(motion, deps)).toBe("unavailable");
    expect(download).not.toHaveBeenCalled();
    expect(registry.size).toBe(0);
  });

  test("without a dev server, an uncached motion stays unavailable", async () => {
    const { deps, registry } = loaderDeps({ download: undefined });

    expect(await loadGeneratedMotion(readyMotion(), deps)).toBe("unavailable");
    expect(registry.size).toBe(0);
  });

  test("a failed download is reported and registers nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deps, registry, cache } = loaderDeps({ download: async () => Promise.reject(new Error("502")) });

    expect(await loadGeneratedMotion(readyMotion(), deps)).toBe("failed");
    expect(registry.size).toBe(0);
    expect(cache.entries.size).toBe(0);
    warn.mockRestore();
  });

  test("bytes that are not a GLB are never cached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const html = new TextEncoder().encode("<!doctype html><html></html>").buffer as ArrayBuffer;
    const { deps, cache, registry } = loaderDeps({ download: async () => html });

    expect(await loadGeneratedMotion(readyMotion(), deps)).toBe("failed");
    expect(cache.entries.size).toBe(0);
    expect(registry.size).toBe(0);
    expect(isGlb(html)).toBe(false);
    expect(isGlb(glbBytes())).toBe(true);
    warn.mockRestore();
  });

  test("a corrupt cache entry is replaced by a fresh download", async () => {
    const { deps, cache, download } = loaderDeps();
    await cache.put(cacheKey(CHARACTER, MOTION), new ArrayBuffer(4));

    expect(await loadGeneratedMotion(readyMotion(), deps)).toBe("registered");
    expect(download).toHaveBeenCalledOnce();
    expect(isGlb(cache.entries.get(cacheKey(CHARACTER, MOTION))!)).toBe(true);
  });

  test("motionLoadKey names only ready, well-formed rows", () => {
    expect(motionLoadKey(readyMotion())).toBe(`rashomon.gen.${CHARACTER}.${MOTION}`);
    expect(motionLoadKey(readyMotion({ status: "pending" }))).toBeUndefined();
  });
});

describe("syncGeneratedMotions", () => {
  test("loads each ready motion once, however often the source notifies", async () => {
    const motions = [readyMotion(), readyMotion({ verb: "ducked", motionId: "mGen0002", status: "pending" })];
    const source: GraphSource = {
      kind: "live",
      getSnapshot: () => ({ resolved: null, statuses: {} }),
      subscribe: () => () => undefined,
      generatedMotions: () => motions,
    };
    const { deps, download } = loaderDeps();
    const seen = new Map();

    syncGeneratedMotions(source, deps, seen);
    syncGeneratedMotions(source, deps, seen);
    await Promise.all(seen.values());

    expect([...seen.keys()]).toEqual([`rashomon.gen.${CHARACTER}.${MOTION}`]);
    expect(download).toHaveBeenCalledOnce();
  });
});

describe("isGeneratedEvent", () => {
  const has = (name: string) => name === "gen_staggered";

  test("is true only for an approximated event whose verb has a registered clip", () => {
    expect(isGeneratedEvent({ actionApproximated: true, verb: "Staggered" }, has)).toBe(true);
    expect(isGeneratedEvent({ actionApproximated: true, verb: "ducked" }, has)).toBe(false);
    expect(isGeneratedEvent({ actionApproximated: false, verb: "staggered" }, has)).toBe(false);
    expect(isGeneratedEvent({ actionApproximated: true }, has)).toBe(false);
  });
});

describe("indexedDbCache without IndexedDB", () => {
  test("reads come back empty and writes resolve, so the scene keeps the nearest clip", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const cache = indexedDbCache(() => undefined);

    await expect(cache.get("rashomon.gen.a.b")).resolves.toBeUndefined();
    await expect(cache.put("rashomon.gen.a.b", glbBytes())).resolves.toBeUndefined();
    info.mockRestore();
  });

  test("a throwing IndexedDB open is caught", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const factory = { open: () => { throw new Error("SecurityError"); } } as unknown as IDBFactory;
    const cache = indexedDbCache(() => factory);

    await expect(cache.get("k")).resolves.toBeUndefined();
    await expect(cache.put("k", glbBytes())).resolves.toBeUndefined();
    info.mockRestore();
  });
});

const DURATIONS: Readonly<Record<string, number>> = {
  clip_idle: 8.33,
  clip_walk: 1.03,
  clip_run: 0.7,
  clip_crouch_idle: 2.5,
  clip_fall_back: 2.6,
  clip_push: 8.0,
  clip_shoved: 2.73,
  clip_pick_up: 9.57,
  clip_look_around: 6.33,
  clip_talk: 5.17,
};
const BASE_CLIPS = new Map<string, AnimationClip>(
  Object.entries(DURATIONS).map(([name, duration], index) => [name, swingClip(name, duration, 0.2 + index * 0.03)]),
);
const GEN_DURATION = 3.93;

const generatedSnapshot = () => {
  const source = fixtureGraphSource("store", GENERATED_SCENARIO);
  if (!source) throw new Error("generated scenario is not registered");
  return source;
};

describe("the generated fixture scenario", () => {
  test("marks the clerk's fall approximated with the fixture verb and offers its motion", () => {
    const source = generatedSnapshot();
    const event = source.getSnapshot().resolved?.events.find((e) => e.id === GENERATED_FIXTURE_EVENT);

    expect(event).toMatchObject({ action: "fall", actionApproximated: true, verb: GENERATED_FIXTURE_VERB });
    expect(source.generatedMotions?.()).toBe(GENERATED_FIXTURE_MOTIONS);
  });

  test("leaves statuses as the plain robbery fixture has them", () => {
    const plain = fixtureGraphSource("store")!.getSnapshot().statuses;

    expect(generatedSnapshot().getSnapshot().statuses).toEqual(plain);
  });

  test("other fixtures offer no generated motions", () => {
    expect(fixtureGraphSource("store")!.generatedMotions?.()).toEqual([]);
  });
});

describe("the scene swaps to the generated clip", () => {
  const resolved = () => generatedSnapshot().getSnapshot().resolved as ResolvedGraph;
  const e8Clip = (has: (name: string) => boolean) =>
    buildClipWindows("clerk", resolved().events, has).windows.find((w) => w.source === GENERATED_FIXTURE_EVENT)?.clip;

  test("plays the nearest clip until the row and the cached GLB are present, then gen_<verb>", async () => {
    const { deps, registry, cache } = loaderDeps();
    const has = (name: string) => BASE_CLIPS.has(name) || registry.has(name);
    expect(e8Clip(has)).toBe("clip_fall_back");
    await cache.put(cacheKey("fixture", GENERATED_FIXTURE_VERB), glbBytes());

    await loadGeneratedMotion(GENERATED_FIXTURE_MOTIONS[0]!, deps);

    expect(e8Clip(has)).toBe(GEN_CLIP);
  });

  test("keeps the nearest clip when generation failed", async () => {
    const { deps, registry } = loaderDeps();
    const has = (name: string) => BASE_CLIPS.has(name) || registry.has(name);

    await loadGeneratedMotion({ ...GENERATED_FIXTURE_MOTIONS[0]!, status: "failed" }, deps);

    expect(e8Clip(has)).toBe("clip_fall_back");
  });

  test("keeps the nearest clip when the download fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deps, registry } = loaderDeps({ fetchUrl: async () => Promise.reject(new Error("404")) });
    const has = (name: string) => BASE_CLIPS.has(name) || registry.has(name);

    expect(await loadGeneratedMotion(GENERATED_FIXTURE_MOTIONS[0]!, deps)).toBe("failed");
    expect(e8Clip(has)).toBe("clip_fall_back");
    warn.mockRestore();
  });

  test("events without that verb keep their own clips", () => {
    const has = (name: string) => BASE_CLIPS.has(name) || name === GEN_CLIP;
    const suspectClips = buildClipWindows("suspect", resolved().events, has).windows.map((w) => w.clip);

    expect(suspectClips).not.toContain(GEN_CLIP);
  });
});

describe("generated clips keep scrubbing exact", () => {
  const clips = new Map(BASE_CLIPS).set(GEN_CLIP, swingClip(GEN_CLIP, GEN_DURATION, 0.9));
  const durations = (clip: string) => (clip === GEN_CLIP ? GEN_DURATION : DURATIONS[clip]);

  function posedClerk(withGenerated: boolean) {
    const { root, bones } = syntheticSkeleton();
    const source = withGenerated ? clips : BASE_CLIPS;
    const poser: FramePoser = {
      mixer: new AnimationMixer(root),
      sampler: createClipSampler(),
      windowSet: buildClipWindows("clerk", (generatedSnapshot().getSnapshot().resolved as ResolvedGraph).events, (c) => source.has(c)),
      durationOf: durations,
      clipOf: (clip) => source.get(clip),
      actions: new Map<string, AnimationAction>(),
      timeOf: undefined,
      rig: null,
      scene: null,
    };
    return (t: number) => {
      poseActorFrame(poser, t);
      return bones.flatMap((bone) => bone.quaternion.toArray());
    };
  }

  const expectSame = (actual: number[], expected: number[]) =>
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 9));

  test("the pose at 14 after scrubbing 0 → 20 → 14 matches a direct jump to 14", () => {
    const scrubbed = posedClerk(true);
    scrubbed(0);
    scrubbed(20);

    expectSame(scrubbed(14), posedClerk(true)(14));
  });

  test("every stop through the generated window matches a fresh jump", () => {
    const scrubbed = posedClerk(true);
    for (const t of [13.2, 16, 13.5, 14.8, 0, 14.1, 13.05]) expectSame(scrubbed(t), posedClerk(true)(t));
  });

  test("the generated clip really drives the clerk inside its window", () => {
    expect(posedClerk(true)(14.2)).not.toEqual(posedClerk(false)(14.2));
  });
});
