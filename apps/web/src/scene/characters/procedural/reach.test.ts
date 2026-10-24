import type { ResolvedEvent, ResolvedGraph, Vec3 } from "@rashomon/engine";
import { storeScene } from "@rashomon/schema/fixtures";
import { Vector3 } from "three";
import { describe, expect, test } from "vitest";
import { robberyGatedSnapshot } from "../../playback/graphSource";
import { buildProceduralRig, type ProceduralRig } from "./proceduralRig";
import { actorFrameAt, proceduralSceneFor, propRests } from "./proceduralScene";
import { applyReach, REACH_ATTACH_FRACTION, reachTarget, reachWeight, type PropRest } from "./reach";
import { rigPosition, RIG_UP, type ActorFrame } from "./rigSpace";
import { syntheticSkeleton } from "./testRig";

const MM = 1e-3;
const ORIGIN_FRAME: ActorFrame = { position: [0, 0, 0], yaw: 0 };

function rig(): ProceduralRig {
  const { root, bones } = syntheticSkeleton();
  const built = buildProceduralRig(root, bones);
  if (!built) throw new Error("synthetic rig is missing a bone");
  return built;
}

function chainPositions(subject: ProceduralRig): Vector3[] {
  return [subject.rightArm, subject.rightForeArm, subject.rightHand].map((bone) =>
    rigPosition(bone, subject.root, new Vector3()),
  );
}

function pickUp(extra: Partial<ResolvedEvent> = {}): ResolvedEvent {
  return {
    id: "p",
    witnessId: "w1",
    actor: "suspect",
    action: "pick_up",
    tStart: 9,
    tEnd: 11,
    status: "plausible",
    flags: [],
    path: [],
    pathLengthM: 0,
    reachable: true,
    at: [0, 0, 0],
    prop: "knife",
    sources: ["u1"],
    tInferred: false,
    ...extra,
  };
}

const knife: PropRest = { prop: { position: [0.1, 0, 0.3], heldByIntervals: [{ actor: "suspect", tStart: 11, tEnd: 24 }] }, point: [-0.1, 1.0, 0.3] };

describe("reach weight from t", () => {
  test("it goes 0 to 1 over the first 60% and back to 0 by the end", () => {
    expect(REACH_ATTACH_FRACTION).toBe(0.6);
    expect(reachWeight(0)).toBe(0);
    expect(reachWeight(0.3)).toBeCloseTo(0.5, 9);
    expect(reachWeight(0.6)).toBe(1);
    expect(reachWeight(0.8)).toBeCloseTo(0.5, 9);
    expect(reachWeight(1)).toBe(0);
  });

  test("the target is the prop's resting point while the prop is at rest", () => {
    const source = { events: [pickUp()], props: new Map([["knife", knife]]) };
    expect(reachTarget(source, 10.2)).toEqual({ point: knife.point, weight: 1 });
    expect(reachTarget(source, 8.9)).toBeNull();
    expect(reachTarget(source, 11)).toBeNull();
  });

  test("no reach once the prop is held, or for a pick_up with no prop", () => {
    const held: PropRest = { ...knife, prop: { ...knife.prop, heldByIntervals: [{ actor: "suspect", tStart: 9, tEnd: 24 }] } };
    expect(reachTarget({ events: [pickUp()], props: new Map([["knife", held]]) }, 10)).toBeNull();
    expect(reachTarget({ events: [pickUp({ prop: undefined })], props: new Map([["knife", knife]]) }, 10)).toBeNull();
  });
});

describe("reach bones", () => {
  test("a reachable target is reached within 1 mm at full weight, with bone lengths unchanged", () => {
    const subject = rig();
    const [shoulder, elbow, hand] = chainPositions(subject) as [Vector3, Vector3, Vector3];
    const lengths = [elbow.distanceTo(shoulder), hand.distanceTo(elbow)];
    applyReach(subject, ORIGIN_FRAME, { point: [-0.25, 1.0, 0.25], weight: 1 });
    const [s, e, h] = chainPositions(subject) as [Vector3, Vector3, Vector3];
    expect(h.distanceTo(new Vector3(-0.25, 1.0, 0.25))).toBeLessThan(MM);
    expect(e.distanceTo(s)).toBeCloseTo(lengths[0] as number, 9);
    expect(h.distanceTo(e)).toBeCloseTo(lengths[1] as number, 9);
    expect(s.distanceTo(shoulder)).toBeLessThan(1e-9);
  });

  test("an unreachable target gets a straight arm toward it", () => {
    const subject = rig();
    const target = new Vector3(-0.3, 0.1, 1.5);
    applyReach(subject, ORIGIN_FRAME, { point: [target.x, target.y, target.z], weight: 1 });
    const [s, e, h] = chainPositions(subject) as [Vector3, Vector3, Vector3];
    const toward = target.clone().sub(s).normalize();
    expect(h.clone().sub(s).normalize().dot(toward)).toBeCloseTo(1, 6);
    expect(e.clone().sub(s).normalize().dot(toward)).toBeCloseTo(1, 6);
  });

  test("weight 0 leaves the clip pose alone", () => {
    const subject = rig();
    const before = [subject.rightArm, subject.rightForeArm].map((bone) => bone.quaternion.clone());
    applyReach(subject, ORIGIN_FRAME, { point: [-0.25, 1.0, 0.25], weight: 0 });
    [subject.rightArm, subject.rightForeArm].forEach((bone, index) => expect(bone.quaternion.angleTo(before[index]!)).toBeLessThan(1e-9));
  });

  test("in the robbery the suspect's right hand reaches the knife on the counter at the attach point", () => {
    const snapshot = robberyGatedSnapshot();
    const resolved = snapshot.resolved as ResolvedGraph;
    const fixtureGraph = snapshot.graph ?? null;
    const scene = proceduralSceneFor(resolved, snapshot.statuses, fixtureGraph, storeScene, "suspect");
    if (!scene) throw new Error("suspect has no playback");
    const pick = resolved.events.find((e) => e.action === "pick_up");
    if (!pick) throw new Error("robbery has no pick_up");
    const t = pick.tStart + REACH_ATTACH_FRACTION * (pick.tEnd - pick.tStart);
    const target = reachTarget(scene, t);
    const knifePoint = propRests(resolved, fixtureGraph, storeScene).get("p_knife")?.point as Vec3;
    expect(target).toEqual({ point: knifePoint, weight: 1 });
    expect(knifePoint[1]).toBeGreaterThan(1);
    const frame = actorFrameAt(scene, t) as ActorFrame;
    const subject = rig();
    applyReach(subject, frame, target!);
    const handRig = rigPosition(subject.rightHand, subject.root, new Vector3());
    const handWorld = handRig.applyAxisAngle(RIG_UP, frame.yaw).add(new Vector3(...frame.position));
    expect(handWorld.distanceTo(new Vector3(...knifePoint))).toBeLessThan(MM);
  });
});
