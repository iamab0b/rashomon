import type { Anchor, SceneManifest } from "@rashomon/schema";

export function restBaseY(anchor: Anchor | undefined, manifest: SceneManifest, fallbackY: number): number {
  if (!anchor || (anchor.kind !== "at" && anchor.kind !== "near" && anchor.kind !== "behind")) return fallbackY;
  const landmark = manifest.landmarks.find((l) => l.id === anchor.landmark);
  if (!landmark) return fallbackY;
  if (landmark.kind === "prop_spawn") return landmark.bounds.min[1];
  if (landmark.kind === "furniture" || landmark.kind === "appliance") return landmark.bounds.max[1];
  return fallbackY;
}
