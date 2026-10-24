import type { ResolvedProp, Vec3 } from "@rashomon/engine";

export type PropPose = { kind: "held"; actor: string } | { kind: "rest"; position: Vec3 };

export function propPose(prop: Pick<ResolvedProp, "position" | "heldByIntervals">, t: number): PropPose {
  const interval = prop.heldByIntervals?.find((i) => t >= i.tStart && t < i.tEnd);
  return interval ? { kind: "held", actor: interval.actor } : { kind: "rest", position: prop.position };
}
