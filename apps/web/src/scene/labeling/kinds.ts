import type { Landmark } from "@rashomon/schema";

export type LandmarkKind = Landmark["kind"];

export const LANDMARK_KINDS: readonly LandmarkKind[] = ["door", "window", "furniture", "appliance", "zone", "prop_spawn"];

export const DEFAULT_KIND: LandmarkKind = "furniture";

export function isLandmarkKind(value: unknown): value is LandmarkKind {
  return typeof value === "string" && (LANDMARK_KINDS as readonly string[]).includes(value);
}

export function defaultOccludes(kind: LandmarkKind): boolean {
  return kind === "furniture" || kind === "appliance";
}
