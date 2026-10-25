import type { Landmark } from "@rashomon/schema";

export type Box = {
  cx: number;
  cz: number;
  floorY: number;
  width: number;
  depth: number;
  height: number;
};

export type BoxSize = Pick<Box, "width" | "depth" | "height">;

export const DEFAULT_SIZE: BoxSize = { width: 1, depth: 1, height: 1 };
export const MIN_SIZE = 0.05;

const PRECISION = 1000;

export function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

export function boxFromClick(point: readonly [number, number, number], size: BoxSize = DEFAULT_SIZE): Box {
  return { cx: round(point[0]), cz: round(point[2]), floorY: round(point[1]), ...size };
}

export function geometryOfBox(box: Box): Pick<Landmark, "position" | "bounds"> {
  const halfWidth = box.width / 2;
  const halfDepth = box.depth / 2;
  return {
    position: [round(box.cx), round(box.floorY), round(box.cz - halfDepth)],
    bounds: {
      min: [round(box.cx - halfWidth), round(box.floorY), round(box.cz - halfDepth)],
      max: [round(box.cx + halfWidth), round(box.floorY + box.height), round(box.cz + halfDepth)],
    },
  };
}

export function boxOfLandmark(landmark: Pick<Landmark, "bounds">): Box {
  const { min, max } = landmark.bounds;
  return {
    cx: round((min[0] + max[0]) / 2),
    cz: round((min[2] + max[2]) / 2),
    floorY: min[1],
    width: round(max[0] - min[0]),
    depth: round(max[2] - min[2]),
    height: round(max[1] - min[1]),
  };
}

export function moveBox(box: Box, cx: number, cz: number): Box {
  return { ...box, cx: round(cx), cz: round(cz) };
}

export function resizeBox(box: Box, size: Partial<BoxSize>): Box {
  const next = { ...box };
  for (const key of ["width", "depth", "height"] as const) {
    const value = size[key];
    if (value !== undefined && Number.isFinite(value)) next[key] = Math.max(MIN_SIZE, round(value));
  }
  return next;
}

export function withBox<T extends Landmark>(landmark: T, box: Box): T {
  return { ...landmark, ...geometryOfBox(box) };
}
