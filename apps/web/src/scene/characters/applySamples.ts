import type { AnimationAction, AnimationClip, AnimationMixer } from "three";
import type { ClipSample } from "./blend";

export type ActionCache = Map<string, AnimationAction>;

export function applySamples(
  mixer: AnimationMixer,
  samples: readonly ClipSample[],
  clipOf: (name: string) => AnimationClip | undefined,
  actions: ActionCache,
): void {
  const active = new Set(samples.map((sample) => sample.clip));
  for (const [name, action] of actions) {
    if (!active.has(name)) action.setEffectiveWeight(0);
  }
  for (const sample of samples) {
    const clip = clipOf(sample.clip);
    if (!clip) continue;
    const cached = actions.get(sample.clip);
    const action = cached ?? mixer.clipAction(clip);
    if (!cached) {
      action.play();
      actions.set(sample.clip, action);
    }
    action.setEffectiveWeight(sample.weight);
    action.time = sample.time;
  }
  mixer.update(0);
}
