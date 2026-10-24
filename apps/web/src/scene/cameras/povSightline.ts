import type { ResolvedEvent, ResolvedGraph, Vec3 } from "@rashomon/engine";
import type { Flag } from "@rashomon/schema";
import { actorYaw } from "../playback/actorPose";
import { playbacksFor } from "../playback/playbacks";
import { statusOf } from "../playback/useGraph";
import { useSceneStore, type SceneState, type StatusMap } from "../store";

export const EYE_HEIGHT_M = 1.6;
export const CHEST_HEIGHT_M = 1.2;
const FALLBACK_LOOK_DISTANCE_M = 5;
const WITNESS_ROLE = "witness";

export type PovSightline = {
  readonly actorId: string;
  readonly eventId: string | null;
  readonly eye: Vec3;
  readonly target: Vec3;
};

export function povActorId(resolved: ResolvedGraph | null, explicit: string | null): string | null {
  if (!resolved) return null;
  if (explicit && resolved.actors.some((actor) => actor.id === explicit)) return explicit;
  return resolved.actors.find((actor) => actor.role === WITNESS_ROLE)?.id ?? null;
}

function lookEvent(
  resolved: ResolvedGraph,
  statuses: StatusMap,
  actorId: string,
  t: number,
): ResolvedEvent | undefined {
  let chosen: ResolvedEvent | undefined;
  for (const event of resolved.events) {
    if (event.actor !== actorId || statusOf(statuses, event) === "superseded") continue;
    if (!event.target && !event.facing) continue;
    if (event.tStart > t || t > event.tEnd) continue;
    if (!chosen || event.tStart >= chosen.tStart) chosen = event;
  }
  return chosen;
}

function chestOf(point: Vec3): Vec3 {
  return [point[0], point[1] + CHEST_HEIGHT_M, point[2]];
}

export function povSightline(
  resolved: ResolvedGraph,
  statuses: StatusMap,
  actorId: string,
  t: number,
): PovSightline | null {
  const { byId, positionOf } = playbacksFor(resolved, statuses);
  const playback = byId.get(actorId);
  const feet = positionOf(actorId, t);
  if (!playback || !feet) return null;
  const eye: Vec3 = [feet[0], feet[1] + EYE_HEIGHT_M, feet[2]];
  const event = lookEvent(resolved, statuses, actorId, t);
  const targetFeet = event?.target ? positionOf(event.target, t) : null;
  if (event && targetFeet) return { actorId, eventId: event.id, eye, target: chestOf(targetFeet) };
  if (event?.facing) return { actorId, eventId: event.id, eye, target: [event.facing[0], CHEST_HEIGHT_M, event.facing[2]] };
  const yaw = actorYaw(playback, t, positionOf);
  const target: Vec3 = [
    eye[0] + Math.sin(yaw) * FALLBACK_LOOK_DISTANCE_M,
    CHEST_HEIGHT_M,
    eye[2] + Math.cos(yaw) * FALLBACK_LOOK_DISTANCE_M,
  ];
  return { actorId, eventId: null, eye, target };
}

export function followedActorId(state: Pick<SceneState, "povFollow" | "povActor" | "resolved">): string | null {
  return state.povFollow ? povActorId(state.resolved, state.povActor) : null;
}

export function getPovSightline(): PovSightline | null {
  const state = useSceneStore.getState();
  const actorId = followedActorId(state);
  if (!actorId || !state.resolved) return null;
  return povSightline(state.resolved, state.statuses, actorId, state.t);
}

export type PovRay = {
  readonly eventId: string;
  readonly blocked: boolean;
  readonly blocker: string | null;
  readonly from: Vec3;
  readonly to: Vec3;
};

function blockedRay(sightline: PovSightline, flag: Flag): PovRay {
  const distance = Number(flag.evidence.blockerDistanceM);
  const length = Number(flag.evidence.rayLengthM);
  const along = Number.isFinite(distance) && Number.isFinite(length) && length > 0 ? Math.min(distance / length, 1) : 1;
  const to: Vec3 = [
    sightline.eye[0] + (sightline.target[0] - sightline.eye[0]) * along,
    sightline.eye[1] + (sightline.target[1] - sightline.eye[1]) * along,
    sightline.eye[2] + (sightline.target[2] - sightline.eye[2]) * along,
  ];
  const blocker = typeof flag.evidence.blocker === "string" ? flag.evidence.blocker : null;
  return { eventId: flag.eventId, blocked: true, blocker, from: sightline.eye, to };
}

export function povRay(resolved: ResolvedGraph, sightline: PovSightline | null): PovRay | null {
  if (!sightline?.eventId) return null;
  const event = resolved.events.find((candidate) => candidate.id === sightline.eventId);
  if (!event || event.action !== "look" || !event.target) return null;
  const flag = event.flags.find((candidate) => candidate.check === "sightline");
  if (flag) return blockedRay(sightline, flag);
  return { eventId: event.id, blocked: false, blocker: null, from: sightline.eye, to: sightline.target };
}

export function currentPovRay(): PovRay | null {
  const state = useSceneStore.getState();
  if (!state.resolved) return null;
  const actorId = povActorId(state.resolved, state.povActor);
  if (!actorId) return null;
  return povRay(state.resolved, povSightline(state.resolved, state.statuses, actorId, state.t));
}
