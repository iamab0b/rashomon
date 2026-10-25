import type { ResolvedEvent, ResolvedProp, Vec3 } from "@rashomon/engine";
import { Quaternion, Vector3 } from "three";
import { eventFraction } from "../../playback/paths";
import { propPose } from "../../props/propPose";
import { ACTION_MAP } from "../actionMap";
import { smoothstep01 } from "./ease";
import type { ProceduralRig } from "./proceduralRig";
import { rigPosition, rotateInRig, toRigSpace, type ActorFrame } from "./rigSpace";
import { solveTwoBoneIk } from "./twoBoneIk";

export const REACH_ACTION = "pick_up";
const DEFAULT_ATTACH_FRACTION = 0.6;
export const REACH_ATTACH_FRACTION = ACTION_MAP.pick_up.propAttachAt ?? DEFAULT_ATTACH_FRACTION;
const MIN_OUTWARD_M = 1e-6;

export type PropRest = {
  readonly prop: Pick<ResolvedProp, "position" | "heldByIntervals">;
  readonly point: Vec3;
};

export type ReachTarget = {
  readonly point: Vec3;
  readonly weight: number;
};

export type ReachSource = {
  readonly events: readonly ResolvedEvent[];
  readonly props: ReadonlyMap<string, PropRest>;
};

export function reachWeight(fraction: number, attachAt: number = REACH_ATTACH_FRACTION): number {
  if (fraction <= 0 || fraction >= 1) return 0;
  if (fraction <= attachAt) return smoothstep01(fraction / attachAt);
  return smoothstep01((1 - fraction) / (1 - attachAt));
}

export function reachTarget(source: ReachSource, t: number): ReachTarget | null {
  for (const event of source.events) {
    if (event.action !== REACH_ACTION || !event.prop || t < event.tStart || t > event.tEnd) continue;
    const weight = reachWeight(eventFraction(event, t));
    if (weight <= 0) continue;
    const rest = source.props.get(event.prop);
    if (!rest || propPose(rest.prop, t).kind !== "rest") continue;
    return { point: rest.point, weight };
  }
  return null;
}

const shoulder = new Vector3();
const elbow = new Vector3();
const hand = new Vector3();
const chest = new Vector3();
const goal = new Vector3();
const pole = new Vector3();
const from = new Vector3();
const to = new Vector3();
const swing = new Quaternion();
const armClip = new Quaternion();
const foreArmClip = new Quaternion();

function elbowPole(rig: ProceduralRig): Vector3 {
  rigPosition(rig.chest, rig.root, chest);
  pole.copy(shoulder).sub(chest).setY(0);
  if (pole.length() > MIN_OUTWARD_M) pole.normalize();
  return pole.setY(-1).normalize();
}

export function applyReach(rig: ProceduralRig, frame: ActorFrame, target: ReachTarget): void {
  rigPosition(rig.rightArm, rig.root, shoulder);
  rigPosition(rig.rightForeArm, rig.root, elbow);
  rigPosition(rig.rightHand, rig.root, hand);
  toRigSpace(frame, target.point, goal);
  const solution = solveTwoBoneIk(shoulder, elbow, hand, goal, elbowPole(rig));
  armClip.copy(rig.rightArm.quaternion);
  foreArmClip.copy(rig.rightForeArm.quaternion);

  from.copy(elbow).sub(shoulder).normalize();
  to.copy(solution.elbow).sub(shoulder).normalize();
  rotateInRig(rig.rightArm, rig.root, swing.setFromUnitVectors(from, to));

  rigPosition(rig.rightForeArm, rig.root, elbow);
  rigPosition(rig.rightHand, rig.root, hand);
  from.copy(hand).sub(elbow).normalize();
  to.copy(solution.hand).sub(solution.elbow).normalize();
  rotateInRig(rig.rightForeArm, rig.root, swing.setFromUnitVectors(from, to));

  rig.rightArm.quaternion.slerpQuaternions(armClip, rig.rightArm.quaternion.clone(), target.weight);
  rig.rightForeArm.quaternion.slerpQuaternions(foreArmClip, rig.rightForeArm.quaternion.clone(), target.weight);
}
