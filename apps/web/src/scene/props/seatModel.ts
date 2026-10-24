import { Box3, Group, Vector3, type Object3D } from "three";
import { modelScale } from "./library";
import type { PropType } from "./types";

const ELONGATED_RATIO = 2;
const LAY_FLAT_RAD = Math.PI / 2;
const LONG_AXIS_TO_Z_RAD = -Math.PI / 2;

function sizeOf(object: Object3D): Vector3 {
  return new Box3().setFromObject(object).getSize(new Vector3());
}

function orient(holder: Object3D): void {
  holder.rotation.order = "YXZ";
  const upright = sizeOf(holder);
  if (upright.y >= ELONGATED_RATIO * Math.max(upright.x, upright.z)) holder.rotation.x = LAY_FLAT_RAD;
  const laid = sizeOf(holder);
  if (laid.x > laid.z) holder.rotation.y = LONG_AXIS_TO_Z_RAD;
}

export function seatPropModel(model: Object3D, entry: PropType): Group {
  const holder = new Group();
  holder.add(model);
  if (entry.graspable) orient(holder);
  const box = new Box3().setFromObject(holder);
  const size = box.getSize(new Vector3());
  const scale = modelScale(entry, [size.x, size.y, size.z]);
  holder.position.set(
    -(box.min.x + box.max.x) / 2,
    -box.min.y - entry.dimensionsM.h / 2 / scale,
    -(box.min.z + box.max.z) / 2,
  );
  const seated = new Group();
  seated.scale.setScalar(scale);
  seated.add(holder);
  return seated;
}
