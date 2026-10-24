import type { Landmark } from "@rashomon/schema";

export type Vec3 = [number, number, number];

export function labelAnchor(landmark: Landmark): Vec3 {
  const { min, max } = landmark.bounds;
  if (landmark.occludes) {
    return [(min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2];
  }
  return [landmark.position[0], landmark.position[1], landmark.position[2]];
}
