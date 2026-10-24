import type { Vec3 } from "@rashomon/engine";
import { Box3, Group, Vector3, type Object3D } from "three";
import { DRESS_PREFIX, enableShadows, tagCollision } from "../loaders/scene";
import type { DressingFit, DressingPlacement } from "./dressingPlan";

export type AssembledDressing = {
  readonly group: Group;
  readonly coveredLandmarks: ReadonlySet<string>;
};

const QUARTER_TURN_SINE = 0.5;

function ratio(target: number, size: number): number {
  return size > 0 ? target / size : 1;
}

function scaleFor(fit: DressingFit, size: Vector3, rotationY: number): Vector3 {
  if (fit.kind === "longest") {
    const uniform = ratio(fit.meters, Math.max(size.x, size.y, size.z));
    return new Vector3(uniform, uniform, uniform);
  }
  const [worldX, worldY, worldZ] = fit.size;
  const turned = Math.abs(Math.sin(rotationY)) > QUARTER_TURN_SINE;
  const target: Vec3 = turned ? [worldZ, worldY, worldX] : [worldX, worldY, worldZ];
  return new Vector3(ratio(target[0], size.x), ratio(target[1], size.y), ratio(target[2], size.z));
}

function seatedUnit(model: Object3D, placement: DressingPlacement, name: string): Group {
  const content = model.clone(true);
  const box = new Box3().setFromObject(content);
  const scale = scaleFor(placement.fit, box.getSize(new Vector3()), placement.rotationY);

  const holder = new Group();
  holder.add(content);
  holder.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  const fitted = new Group();
  fitted.scale.copy(scale);
  fitted.add(holder);

  const slot = new Group();
  slot.position.set(...placement.position);
  slot.rotation.y = placement.rotationY;
  slot.add(fitted);

  slot.traverse((object) => {
    object.name = `${DRESS_PREFIX}${object.name}`;
  });
  slot.name = name;
  return slot;
}

export function assembleDressing(
  plan: readonly DressingPlacement[],
  models: ReadonlyMap<string, Object3D>,
): AssembledDressing {
  const group = new Group();
  group.name = `${DRESS_PREFIX}root`;
  const covered = new Set<string>();
  plan.forEach((placement, index) => {
    const model = models.get(placement.url);
    if (!model) return;
    group.add(seatedUnit(model, placement, `${DRESS_PREFIX}${placement.landmarkId}_${placement.role}_${index}`));
    if (placement.role === "unit") covered.add(placement.landmarkId);
  });
  enableShadows(group);
  tagCollision(group);
  return { group, coveredLandmarks: covered };
}
