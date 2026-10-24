import { Box3, Vector3 } from "three";
import type { CharacterHandle } from "./Character";
import type { RigReport } from "./rigReportStore";

export function measureRig(handle: CharacterHandle): RigReport {
  handle.root.updateMatrixWorld(true);
  const bounds = new Box3();
  for (const mesh of handle.skinnedMeshes) {
    mesh.skeleton.update();
    mesh.computeBoundingBox();
    if (mesh.boundingBox) bounds.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  const hipPosition = handle.hips?.getWorldPosition(new Vector3());
  return {
    rig: handle.rig,
    hipBone: handle.hips?.name ?? "(no hip bone found)",
    hipY: hipPosition?.y ?? Number.NaN,
    height: bounds.isEmpty() ? Number.NaN : bounds.max.y - bounds.min.y,
  };
}
