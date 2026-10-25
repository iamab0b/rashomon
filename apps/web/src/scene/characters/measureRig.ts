import { Box3, SkinnedMesh, Vector3, type Bone } from "three";
import type { CharacterHandle } from "./Character";
import type { RigReport } from "./rigReportStore";

const EYE_BONES = ["mixamorigLeftEye", "mixamorigRightEye"];
const HEAD_BONE = "mixamorigHead";
const HEAD_TOP_BONE = "mixamorigHeadTop_End";
const EYE_FRACTION_OF_HEAD = 0.45;

function worldY(bone: Bone | undefined): number | undefined {
  return bone?.getWorldPosition(new Vector3()).y;
}

function eyeHeight(bones: readonly Bone[]): { eyeY: number; eyeEstimated: boolean } {
  const byName = (name: string) => bones.find((bone) => bone.name === name);
  const eyes = EYE_BONES.map((name) => worldY(byName(name))).filter((y): y is number => y !== undefined);
  if (eyes.length > 0) return { eyeY: eyes.reduce((sum, y) => sum + y, 0) / eyes.length, eyeEstimated: false };
  const head = worldY(byName(HEAD_BONE));
  const top = worldY(byName(HEAD_TOP_BONE));
  if (head === undefined || top === undefined) return { eyeY: Number.NaN, eyeEstimated: true };
  return { eyeY: head + (top - head) * EYE_FRACTION_OF_HEAD, eyeEstimated: true };
}

export function measureRig(handle: CharacterHandle, name: string = handle.name): RigReport {
  handle.root.updateMatrixWorld(true);
  const bounds = new Box3();
  for (const mesh of handle.skinnedMeshes) {
    mesh.skeleton.update();
    mesh.computeBoundingBox();
    if (mesh.boundingBox) bounds.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  const mixerRoot = handle.mixer.getRoot();
  const bones = mixerRoot instanceof SkinnedMesh ? mixerRoot.skeleton.bones : [];
  const hipPosition = handle.hips?.getWorldPosition(new Vector3());
  return {
    name,
    bones: bones.length,
    hipBone: handle.hips?.name ?? "(no hip bone found)",
    hipY: hipPosition?.y ?? Number.NaN,
    ...eyeHeight(bones),
    height: bounds.isEmpty() ? Number.NaN : bounds.max.y - bounds.min.y,
  };
}
