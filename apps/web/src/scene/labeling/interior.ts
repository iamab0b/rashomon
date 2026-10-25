import type { Interior } from "@rashomon/schema";
import { round } from "./boxes";

export function interiorFromBounds(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  fallback: Interior | undefined,
): Interior | undefined {
  const all = [...min, ...max];
  if (!all.every(Number.isFinite) || max[0] <= min[0] || max[1] <= min[1] || max[2] <= min[2]) return fallback;
  return {
    min: [round(min[0]), round(min[1]), round(min[2])],
    max: [round(max[0]), round(max[1]), round(max[2])],
  };
}
