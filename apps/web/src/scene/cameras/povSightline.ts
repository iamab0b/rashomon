import type { ResolvedEvent, ResolvedGraph, Vec3 } from "@rashomon/engine";
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
