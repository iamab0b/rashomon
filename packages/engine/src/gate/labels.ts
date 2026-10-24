import type { Landmark, SceneManifest } from "@rashomon/schema";
import type { ResolvedGraph, Vec3 } from "../types";

export function distanceToLandmark(p: Vec3, l: Landmark): number {
  const dx = Math.max(l.bounds.min[0] - p[0], 0, p[0] - l.bounds.max[0]);
  const dz = Math.max(l.bounds.min[2] - p[2], 0, p[2] - l.bounds.max[2]);
  return Math.hypot(dx, dz);
}

export function nearestLandmarks(p: Vec3, manifest: SceneManifest, count: number): Landmark[] {
  return manifest.landmarks
    .map((l, i) => ({ l, i, d: distanceToLandmark(p, l) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, count)
    .map((x) => x.l);
}

export function nearestLabel(p: Vec3, manifest: SceneManifest): string {
  return nearestLandmarks(p, manifest, 1)[0]?.label ?? "room";
}

export function landmarkLabel(id: string, manifest: SceneManifest): string {
  return manifest.landmarks.find((l) => l.id === id)?.label ?? id;
}

export function actorLabel(resolved: ResolvedGraph, id: string): string {
  return resolved.actors.find((a) => a.id === id)?.label ?? id;
}
