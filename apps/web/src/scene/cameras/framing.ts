import type { Interior } from "@rashomon/schema";
import type { Vec3 } from "./presets";

export type FramedPose = {
  readonly position: Vec3;
  readonly lookAt: Vec3;
  readonly far: number;
};

const VIEW_DIRECTION: Vec3 = [0, 0.6, 0.8];
const MIN_FAR = 1000;
const MIN_RADIUS = 0.5;

export function framePose(bounds: Interior, fovDegrees: number): FramedPose {
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const radius = Math.max(
    MIN_RADIUS,
    Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) / 2,
  );
  const distance = radius / Math.sin((fovDegrees * Math.PI) / 360);
  return {
    position: [
      center[0] + VIEW_DIRECTION[0] * distance,
      center[1] + VIEW_DIRECTION[1] * distance,
      center[2] + VIEW_DIRECTION[2] * distance,
    ],
    lookAt: center,
    far: Math.max(MIN_FAR, 2 * (distance + radius)),
  };
}
