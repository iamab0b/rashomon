import type { SceneManifest } from "@rashomon/schema";
import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from "three";

export type LandmarkOccluders = {
  readonly group: Group;
  readonly boxes: readonly Mesh[];
  readonly boxFor: (landmarkId: string) => Mesh | null;
};

const cache = new WeakMap<SceneManifest, LandmarkOccluders>();

function boxOf(landmark: SceneManifest["landmarks"][number]): Mesh {
  const [minX, minY, minZ] = landmark.bounds.min;
  const [maxX, maxY, maxZ] = landmark.bounds.max;
  const box = new Mesh(new BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ), new MeshBasicMaterial({ side: DoubleSide }));
  box.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  box.name = landmark.id;
  box.updateMatrixWorld(true);
  return box;
}

function build(manifest: SceneManifest): LandmarkOccluders {
  const group = new Group();
  const byId = new Map<string, Mesh>();
  for (const landmark of manifest.landmarks) {
    if (!landmark.occludes) continue;
    const box = boxOf(landmark);
    group.add(box);
    byId.set(landmark.id, box);
  }
  group.updateMatrixWorld(true);
  return { group, boxes: [...byId.values()], boxFor: (landmarkId) => byId.get(landmarkId) ?? null };
}

export function landmarkOccluders(manifest: SceneManifest): LandmarkOccluders {
  const cached = cache.get(manifest);
  if (cached) return cached;
  const built = build(manifest);
  cache.set(manifest, built);
  return built;
}
