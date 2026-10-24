import type { Group, Object3D } from "three";
import { checkPropModels } from "./preload";
import { seatPropModel } from "./seatModel";
import type { PropType } from "./types";

export async function loadPropModel(
  entry: PropType,
  exists: (url: string) => Promise<boolean>,
  load: (url: string) => Promise<Object3D>,
): Promise<Group | null> {
  const report = await checkPropModels([entry], exists);
  if (report.existing.length === 0) return null;
  return seatPropModel(await load(entry.modelUrl), entry);
}
