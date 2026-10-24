import type { AnimationAction, AnimationClip, AnimationMixer } from "three";
import type { ClipSample } from "./blend";

export type ActionCache = Map<string, AnimationAction>;

function silence(action: AnimationAction): void {
  action.setEffectiveWeight(0);
}

export function applySamples(
  mixer: AnimationMixer,
  samples: readonly ClipSample[],
  clipOf: (name: string) => AnimationClip | undefined,
  actions: ActionCache,
): void {
  actions.forEach(silence);
  for (const sample of samples) {
    let action = actions.get(sample.clip);
    if (!action) {
      const clip = clipOf(sample.clip);
      if (!clip) continue;
      action = mixer.clipAction(clip);
      action.play();
      actions.set(sample.clip, action);
    }
    action.setEffectiveWeight(sample.weight);
    action.time = sample.time;
  }
  mixer.update(0);
}
