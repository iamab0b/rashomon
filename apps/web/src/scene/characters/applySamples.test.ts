import { AnimationClip, AnimationMixer, Bone, NumberKeyframeTrack, SkinnedMesh, Skeleton, BufferGeometry, MeshBasicMaterial } from "three";
import { describe, expect, test } from "vitest";
import { applySamples, type ActionCache } from "./applySamples";
import type { ClipSample } from "./blend";

const RAISE = new AnimationClip("clip_raise", 2, [new NumberKeyframeTrack("hips.position[y]", [0, 2], [0, 2])]);
const SLIDE = new AnimationClip("clip_slide", 1, [new NumberKeyframeTrack("hips.position[y]", [0, 1], [10, 20])]);
const CLIPS: Readonly<Record<string, AnimationClip>> = { clip_raise: RAISE, clip_slide: SLIDE };
const clipOf = (name: string): AnimationClip | undefined => CLIPS[name];

function rig(): { mixer: AnimationMixer; hips: Bone; actions: ActionCache } {
  const hips = new Bone();
  hips.name = "hips";
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial());
  mesh.add(hips);
  mesh.bind(new Skeleton([hips]));
  return { mixer: new AnimationMixer(mesh), hips, actions: new Map() };
}

const raiseAt = (time: number, weight = 1): ClipSample => ({ clip: "clip_raise", time, weight });

describe("applySamples on a real AnimationMixer", () => {
  test("poses the bone at the sample's clip time", () => {
    const { mixer, hips, actions } = rig();

    applySamples(mixer, [raiseAt(0.5)], clipOf, actions);

    expect(hips.position.y).toBeCloseTo(0.5);
  });

  test("a one-shot at its last frame holds there instead of wrapping to frame 0", () => {
    const { mixer, hips, actions } = rig();

    applySamples(mixer, [raiseAt(2)], clipOf, actions);
    applySamples(mixer, [raiseAt(2)], clipOf, actions);

    expect(hips.position.y).toBeCloseTo(2);
  });

  test("scrubbing backward after a one-shot finished still poses correctly", () => {
    const { mixer, hips, actions } = rig();
    applySamples(mixer, [raiseAt(2)], clipOf, actions);

    applySamples(mixer, [raiseAt(0.25)], clipOf, actions);

    expect(hips.position.y).toBeCloseTo(0.25);
  });

  test("the same sample sequence forward and backward gives identical poses", () => {
    const times = [0, 0.4, 1.1, 1.9, 2];
    const forward = rig();
    const forwardPoses = times.map((time) => {
      applySamples(forward.mixer, [raiseAt(time)], clipOf, forward.actions);
      return forward.hips.position.y;
    });
    const backward = rig();
    const backwardPoses = [...times].reverse().map((time) => {
      applySamples(backward.mixer, [raiseAt(time)], clipOf, backward.actions);
      return backward.hips.position.y;
    });
    expect(backwardPoses.reverse()).toEqual(forwardPoses);
  });

  test("blends two clips by weight", () => {
    const { mixer, hips, actions } = rig();

    applySamples(
      mixer,
      [raiseAt(1, 0.5), { clip: "clip_slide", time: 0, weight: 0.5 }],
      clipOf,
      actions,
    );

    expect(hips.position.y).toBeCloseTo(0.5 * 1 + 0.5 * 10);
  });

  test("a clip that drops out of the samples stops contributing", () => {
    const { mixer, hips, actions } = rig();
    applySamples(mixer, [{ clip: "clip_slide", time: 0, weight: 1 }], clipOf, actions);

    applySamples(mixer, [raiseAt(1)], clipOf, actions);

    expect(hips.position.y).toBeCloseTo(1);
    expect(actions.get("clip_slide")?.getEffectiveWeight()).toBe(0);
  });

  test("never cross-fades or fades: no action carries a weight interpolant", () => {
    const { mixer, actions } = rig();
    applySamples(mixer, [raiseAt(1, 0.5), { clip: "clip_slide", time: 0, weight: 0.5 }], clipOf, actions);

    for (const action of actions.values()) {
      expect((action as unknown as { _weightInterpolant: unknown })._weightInterpolant).toBeNull();
    }
  });

  test("skips samples for clips that are not loaded", () => {
    const { mixer, hips, actions } = rig();

    applySamples(mixer, [{ clip: "clip_missing", time: 0, weight: 1 }], clipOf, actions);

    expect(actions.size).toBe(0);
    expect(hips.position.y).toBe(0);
  });
});
