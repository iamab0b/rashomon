import type { ResolvedEvent, Vec3 } from "@rashomon/engine";
import { Quaternion, Vector3 } from "three";
import type { PositionLookup } from "../../playback/actorPose";
import { clampAbs, edgeWeight, wrapAngle } from "./ease";
import type { ProceduralRig } from "./proceduralRig";
import { RIG_UP, rigPosition, rigQuaternion, rotateInRig, toRigSpace, type ActorFrame } from "./rigSpace";

export const LOOK_ACTIONS: ReadonlySet<string> = new Set(["look", "speak", "point", "phone"]);
export const HEAD_HEIGHT_M = 1.6;
export const LOOK_YAW_LIMIT_RAD = (70 * Math.PI) / 180;
export const LOOK_PITCH_LIMIT_RAD = (35 * Math.PI) / 180;
export const NECK_SHARE = 0.4;
const MIN_LOOK_DISTANCE_M = 1e-3;

export type LookTarget = {
  readonly point: Vec3;
  readonly weight: number;
};

export type LookSource = {
  readonly events: readonly ResolvedEvent[];
  readonly positionOf: PositionLookup;
};

type HeadAngles = { readonly yaw: number; readonly pitch: number };

function wantsLook(event: ResolvedEvent): boolean {
  return LOOK_ACTIONS.has(event.action) || event.target !== undefined || event.facing !== undefined;
}

function lookPoint(event: ResolvedEvent, t: number, positionOf: PositionLookup): Vec3 | null {
  const there = event.target ? positionOf(event.target, t) : null;
  if (there) return [there[0], there[1] + HEAD_HEIGHT_M, there[2]];
  if (event.facing) return [event.facing[0], event.facing[1] + HEAD_HEIGHT_M, event.facing[2]];
  return null;
}

export function lookTarget(source: LookSource, t: number): LookTarget | null {
  let best: LookTarget | null = null;
  let bestStart = Number.NEGATIVE_INFINITY;
  for (const event of source.events) {
    if (!wantsLook(event)) continue;
    const weight = edgeWeight(event.tStart, event.tEnd, t);
    if (weight <= 0) continue;
    if (best && (weight < best.weight || (weight === best.weight && event.tStart < bestStart))) continue;
    const point = lookPoint(event, t, source.positionOf);
    if (!point) continue;
    best = { point, weight };
    bestStart = event.tStart;
  }
  return best;
}

const headQuaternion = new Quaternion();
const forward = new Vector3();
const headPosition = new Vector3();
const goal = new Vector3();
const pitchAxis = new Vector3();
const yawTurn = new Quaternion();
const pitchTurn = new Quaternion();

export function headAngles(rig: ProceduralRig): HeadAngles {
  rigQuaternion(rig.head, rig.root, headQuaternion);
  forward.copy(rig.headForward).applyQuaternion(headQuaternion).normalize();
  return { yaw: Math.atan2(forward.x, forward.z), pitch: Math.asin(Math.min(1, Math.max(-1, forward.y))) };
}

function turnHeadWith(rig: ProceduralRig, bone: ProceduralRig["neck"], yaw: number, pitch: number): void {
  const current = headAngles(rig);
  yawTurn.setFromAxisAngle(RIG_UP, wrapAngle(yaw - current.yaw));
  pitchAxis.set(Math.sin(yaw), 0, Math.cos(yaw)).cross(RIG_UP).normalize();
  pitchTurn.setFromAxisAngle(pitchAxis, pitch - current.pitch);
  rotateInRig(bone, rig.root, pitchTurn.multiply(yawTurn));
}

export function applyLookAt(rig: ProceduralRig, frame: ActorFrame, target: LookTarget): void {
  rigPosition(rig.head, rig.root, headPosition);
  toRigSpace(frame, target.point, goal).sub(headPosition);
  const horizontal = Math.hypot(goal.x, goal.z);
  if (Math.hypot(horizontal, goal.y) < MIN_LOOK_DISTANCE_M) return;
  const desiredYaw = clampAbs(Math.atan2(goal.x, goal.z), LOOK_YAW_LIMIT_RAD);
  const desiredPitch = clampAbs(Math.atan2(goal.y, horizontal), LOOK_PITCH_LIMIT_RAD);
  const start = headAngles(rig);
  const yawDelta = wrapAngle(desiredYaw - start.yaw) * target.weight;
  const pitchDelta = (desiredPitch - start.pitch) * target.weight;
  turnHeadWith(rig, rig.neck, start.yaw + yawDelta * NECK_SHARE, start.pitch + pitchDelta * NECK_SHARE);
  turnHeadWith(rig, rig.head, start.yaw + yawDelta, start.pitch + pitchDelta);
}
