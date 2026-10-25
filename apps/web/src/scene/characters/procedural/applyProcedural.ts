import type { AnimationClip, AnimationMixer } from "three";
import { applySamples, type ActionCache } from "../applySamples";
import type { ClipDurationLookup, ClipSampler, ClipTimeOverride, ClipWindowSet } from "../blend";
import { applyLookAt, lookTarget } from "./lookAt";
import { captureClipPose, restoreClipPose, type ProceduralRig } from "./proceduralRig";
import { actorFrameAt, type ProceduralScene } from "./proceduralScene";
import { applyReach, reachTarget } from "./reach";

export type FramePoser = {
  readonly mixer: AnimationMixer;
  readonly sampler: ClipSampler;
  readonly windowSet: ClipWindowSet;
  readonly durationOf: ClipDurationLookup;
  readonly clipOf: (name: string) => AnimationClip | undefined;
  readonly actions: ActionCache;
  readonly timeOf: ClipTimeOverride | undefined;
  readonly rig: ProceduralRig | null;
  readonly scene: ProceduralScene | null;
};

export function applyProceduralLayers(rig: ProceduralRig, scene: ProceduralScene, t: number): void {
  const frame = actorFrameAt(scene, t);
  if (!frame) return;
  const look = lookTarget(scene, t);
  if (look) applyLookAt(rig, frame, look);
  const reach = reachTarget(scene, t);
  if (reach) applyReach(rig, frame, reach);
}

export function poseActorFrame(poser: FramePoser, t: number): void {
  const { rig, scene } = poser;
  if (rig) restoreClipPose(rig);
  const samples = poser.sampler(poser.windowSet, t, poser.durationOf, poser.timeOf);
  applySamples(poser.mixer, samples, poser.clipOf, poser.actions);
  if (!rig) return;
  captureClipPose(rig);
  if (scene) applyProceduralLayers(rig, scene, t);
}
