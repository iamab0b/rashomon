import type { ResolvedEvent, Vec3 } from "@rashomon/engine";
import type { Action, Status } from "@rashomon/schema";
import { Quaternion, Vector3 } from "three";
import { describe, expect, test } from "vitest";
import { buildActorPlayback, type PositionLookup } from "../../playback/actorPose";
import { applyProceduralLayers } from "./applyProcedural";
import {
  applyLookAt,
  HEAD_HEIGHT_M,
  headAngles,
  LOOK_PITCH_LIMIT_RAD,
  LOOK_YAW_LIMIT_RAD,
  lookTarget,
  NECK_SHARE,
} from "./lookAt";
import { buildProceduralRig, restoreClipPose, type ProceduralRig } from "./proceduralRig";
import { buildProceduralScene } from "./proceduralScene";
import { RIG_FORWARD, rigQuaternion, type ActorFrame } from "./rigSpace";
import { syntheticSkeleton } from "./testRig";

const ORIGIN_FRAME: ActorFrame = { position: [0, 0, 0], yaw: 0 };
const DEG = Math.PI / 180;

function rig(): ProceduralRig {
  const { root, bones } = syntheticSkeleton();
  const built = buildProceduralRig(root, bones);
  if (!built) throw new Error("synthetic rig is missing a bone");
  return built;
}

function event(id: string, actor: string, action: Action, tStart: number, tEnd: number, extra: Partial<ResolvedEvent> = {}): ResolvedEvent {
  return {
    id,
    witnessId: "w1",
    actor,
    action,
    tStart,
    tEnd,
    status: "plausible",
    flags: [],
    path: [],
    pathLengthM: 0,
    reachable: true,
    at: [0, 0, 0],
    sources: ["u1"],
    tInferred: false,
    ...extra,
  };
}

const fixedPosition =
  (positions: Readonly<Record<string, Vec3>>): PositionLookup =>
  (actorId) =>
    positions[actorId] ?? null;

function headPoint(yaw: number, pitch: number, distance = 3): Vec3 {
  const headY = rigHeadY();
  return [
    distance * Math.cos(pitch) * Math.sin(yaw),
    headY + distance * Math.sin(pitch),
    distance * Math.cos(pitch) * Math.cos(yaw),
  ];
}

function rigHeadY(): number {
  const probe = rig();
  probe.head.updateWorldMatrix(true, false);
  return probe.head.getWorldPosition(new Vector3()).y;
}

function quaternions(subject: ProceduralRig): number[] {
  return [subject.neck, subject.head, subject.rightArm, subject.rightForeArm].flatMap((bone) => bone.quaternion.toArray());
}

describe("head look-at bones", () => {
  test("a target inside the limits is looked at exactly, with the neck taking 40% of the turn", () => {
    const subject = rig();
    applyLookAt(subject, ORIGIN_FRAME, { point: headPoint(30 * DEG, -10 * DEG), weight: 1 });
    const angles = headAngles(subject);
    expect(angles.yaw).toBeCloseTo(30 * DEG, 3);
    expect(angles.pitch).toBeCloseTo(-10 * DEG, 3);
    const neckForward = RIG_FORWARD.clone().applyQuaternion(rigQuaternion(subject.neck, subject.root, new Quaternion()));
    expect(Math.atan2(neckForward.x, neckForward.z)).toBeCloseTo(30 * DEG * NECK_SHARE, 2);
  });

  test("yaw clamps at 70 degrees for a target behind the actor", () => {
    const subject = rig();
    applyLookAt(subject, ORIGIN_FRAME, { point: headPoint(170 * DEG, 0), weight: 1 });
    expect(headAngles(subject).yaw).toBeCloseTo(LOOK_YAW_LIMIT_RAD, 3);
  });

  test("pitch clamps at 35 degrees for a target overhead or underfoot", () => {
    const up = rig();
    applyLookAt(up, ORIGIN_FRAME, { point: headPoint(0, 80 * DEG), weight: 1 });
    expect(headAngles(up).pitch).toBeCloseTo(LOOK_PITCH_LIMIT_RAD, 3);
    const down = rig();
    applyLookAt(down, ORIGIN_FRAME, { point: headPoint(0, -80 * DEG), weight: 1 });
    expect(headAngles(down).pitch).toBeCloseTo(-LOOK_PITCH_LIMIT_RAD, 3);
  });

  test("the weight scales the turn and the actor frame's yaw is respected", () => {
    const subject = rig();
    const frame: ActorFrame = { position: [2, 0, 1], yaw: Math.PI / 2 };
    const world: Vec3 = [2 + 3, rigHeadY(), 1 + 3];
    applyLookAt(subject, frame, { point: world, weight: 0.5 });
    expect(headAngles(subject).yaw).toBeCloseTo((-45 * DEG) / 2, 3);
  });

  test("only bones rotate: no bone moves its local position", () => {
    const subject = rig();
    const before = [subject.neck, subject.head].map((bone) => bone.position.clone());
    applyLookAt(subject, ORIGIN_FRAME, { point: headPoint(50 * DEG, 20 * DEG), weight: 1 });
    [subject.neck, subject.head].forEach((bone, index) => expect(bone.position.equals(before[index] as Vector3)).toBe(true));
  });
});

describe("look-at target and easing from t", () => {
  const speak = event("s", "suspect", "speak", 5, 9, { target: "clerk", at: [7.2, 0, 2.5] });
  const source = { events: [speak], positionOf: fixedPosition({ clerk: [8.7, 0, 2.5] }) };

  test("the target is the other actor's head at the same t", () => {
    expect(lookTarget(source, 7)?.point).toEqual([8.7, HEAD_HEIGHT_M, 2.5]);
  });

  test("it eases in and out over 0.3 s at the event's edges", () => {
    expect(lookTarget(source, 4.9)).toBeNull();
    expect(lookTarget(source, 5)).toBeNull();
    expect(lookTarget(source, 5.15)?.weight).toBeCloseTo(0.5, 9);
    expect(lookTarget(source, 5.3)?.weight).toBeCloseTo(1, 9);
    expect(lookTarget(source, 7)?.weight).toBe(1);
    expect(lookTarget(source, 8.85)?.weight).toBeCloseTo(0.5, 9);
    expect(lookTarget(source, 9.1)).toBeNull();
  });

  test("an event that starts at the timeline start does not ease in", () => {
    const stand = event("st", "clerk", "stand", 0, 13, { facing: [7.4, 0, 2.5] });
    expect(lookTarget({ events: [stand], positionOf: fixedPosition({}) }, 0)).toEqual({
      point: [7.4, HEAD_HEIGHT_M, 2.5],
      weight: 1,
    });
  });

  test("an action with no target and no facing does not look", () => {
    const walk = event("w", "suspect", "walk", 0, 5);
    expect(lookTarget({ events: [walk], positionOf: fixedPosition({}) }, 2)).toBeNull();
  });

  test("the rotation is a pure function of t: same t, same rotation, in either order", () => {
    const actorAt = event("rest", "suspect", "stand", 0, 20, { at: [0, 0, 0] });
    const look = event("look", "suspect", "look", 2, 8, { target: "clerk" });
    const graph = {
      sceneId: "s",
      version: 1,
      durationS: 20,
      actors: [{ id: "suspect", label: "S", role: "suspect", rig: "mixamo_ybot", position: [0, 0, 0] as Vec3 }],
      events: [actorAt, look],
      props: [],
    };
    const playback = buildActorPlayback(graph, "suspect", (e) => e.status);
    const positionOf = fixedPosition({ clerk: [3, 0, 1] });
    const scene = buildProceduralScene(playback, positionOf, new Map());
    const subject = rig();
    const at = (t: number) => {
      restoreClipPose(subject);
      applyProceduralLayers(subject, scene, t);
      return quaternions(subject);
    };
    const first = at(2.1);
    const later = at(6);
    at(7.95);
    expect(at(6)).toEqual(later);
    expect(at(2.1)).toEqual(first);
    expect(first).not.toEqual(later);
  });

  test.each<Status>(["superseded", "implausible"])("no look-at runs for a %s event", (status) => {
    const actorAt = event("rest", "suspect", "stand", 0, 20, { at: [0, 0, 0] });
    const look = event("look", "suspect", "speak", 2, 8, { target: "clerk", status });
    const graph = {
      sceneId: "s",
      version: 1,
      durationS: 20,
      actors: [{ id: "suspect", label: "S", role: "suspect", rig: "mixamo_ybot", position: [0, 0, 0] as Vec3 }],
      events: [actorAt, look],
      props: [],
    };
    const playback = buildActorPlayback(graph, "suspect", (e) => e.status);
    const scene = buildProceduralScene(playback, fixedPosition({ clerk: [3, 0, 1] }), new Map());
    expect(lookTarget(scene, 5)).toBeNull();
    const subject = rig();
    const rest = quaternions(subject);
    applyProceduralLayers(subject, scene, 5);
    expect(quaternions(subject)).toEqual(rest);
  });
});
