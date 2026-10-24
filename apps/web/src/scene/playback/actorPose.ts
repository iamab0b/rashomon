import type { ResolvedEvent, ResolvedGraph, Vec3 } from "@rashomon/engine";
import type { Status } from "@rashomon/schema";
import { buildEventPath, getPose, type EventPath } from "./paths";

export const TURN_DURATION_S = 0.3;
const TIMELINE_START_S = 0;
const BEFORE_EPSILON_S = 1e-6;
const MIN_LOOK_DISTANCE_M = 1e-3;
const HIDDEN_STATUSES: ReadonlySet<Status> = new Set(["superseded", "implausible"]);

export type StatusLookup = (event: ResolvedEvent) => Status;
export type PositionLookup = (actorId: string, t: number) => Vec3 | null;

export type ActorPlayback = {
  readonly actorId: string;
  readonly events: readonly ResolvedEvent[];
  readonly paths: ReadonlyMap<string, EventPath>;
  readonly restPosition: Vec3 | null;
  readonly turnTimes: readonly number[];
  readonly byStartDesc: readonly ResolvedEvent[];
  readonly byEndDesc: readonly ResolvedEvent[];
  readonly statusOf: StatusLookup;
};

export function isDrawn(status: Status): boolean {
  return !HIDDEN_STATUSES.has(status);
}

function turnTimesFor(events: readonly ResolvedEvent[], paths: ReadonlyMap<string, EventPath>): number[] {
  const times = new Set<number>();
  for (const event of events) {
    times.add(event.tStart);
    const path = paths.get(event.id);
    if (!path) continue;
    times.add(event.tEnd);
    const span = event.tEnd - event.tStart;
    for (const fraction of path.cornerFractions) times.add(event.tStart + fraction * span);
  }
  return [...times].sort((a, b) => a - b);
}

function orderedBy(
  events: readonly ResolvedEvent[],
  compare: (a: ResolvedEvent, b: ResolvedEvent) => number,
): ResolvedEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => compare(a.event, b.event) || a.index - b.index)
    .map(({ event }) => event);
}

export function buildActorPlayback(graph: ResolvedGraph, actorId: string, statusOf: StatusLookup): ActorPlayback {
  const events = graph.events
    .filter((event) => event.actor === actorId && isDrawn(statusOf(event)))
    .sort((a, b) => a.tStart - b.tStart || a.id.localeCompare(b.id));
  const paths = new Map<string, EventPath>();
  for (const event of events) {
    const path = buildEventPath(event);
    if (path) paths.set(event.id, path);
  }
  const actor = graph.actors.find((candidate) => candidate.id === actorId);
  return {
    actorId,
    events,
    paths,
    restPosition: actor?.position ?? null,
    turnTimes: turnTimesFor(events, paths),
    byStartDesc: orderedBy(events, (a, b) => b.tStart - a.tStart),
    byEndDesc: orderedBy(events, (a, b) => b.tEnd - a.tEnd || b.tStart - a.tStart),
    statusOf,
  };
}

function latestStarted(playback: ActorPlayback, t: number): ResolvedEvent | undefined {
  let latest: ResolvedEvent | undefined;
  for (const event of playback.events) {
    if (event.tStart > t) break;
    latest = event;
  }
  return latest;
}

function activeMovement(playback: ActorPlayback, t: number): ResolvedEvent | undefined {
  let active: ResolvedEvent | undefined;
  for (const event of playback.events) {
    if (event.tStart > t) break;
    if (t <= event.tEnd && playback.paths.has(event.id)) active = event;
  }
  return active;
}

function pointAt(playback: ActorPlayback, event: ResolvedEvent, t: number): Vec3 | null {
  return getPose(event, t, playback.paths.get(event.id) ?? null)?.position ?? null;
}

function heldPoint(playback: ActorPlayback, t: number): Vec3 | null {
  for (const event of playback.byStartDesc) {
    if (event.tStart > t || event.tEnd < t) continue;
    const point = pointAt(playback, event, t);
    if (point) return point;
  }
  for (const event of playback.byEndDesc) {
    if (event.tStart > t || event.tEnd >= t) continue;
    const point = pointAt(playback, event, t);
    if (point) return point;
  }
  return null;
}

export function actorPosition(playback: ActorPlayback, t: number): Vec3 | null {
  const moving = activeMovement(playback, t);
  const movingPoint = moving ? pointAt(playback, moving, t) : null;
  if (movingPoint) return movingPoint;
  const held = heldPoint(playback, t);
  if (held) return held;
  const first = playback.events[0];
  return playback.restPosition ?? (first ? pointAt(playback, first, first.tStart) : null);
}

function yawToward(from: Vec3, to: Vec3): number | null {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  if (Math.hypot(dx, dz) < MIN_LOOK_DISTANCE_M) return null;
  return Math.atan2(dx, dz);
}

function desiredYaw(playback: ActorPlayback, t: number, positionOf: PositionLookup): number | null {
  const moving = activeMovement(playback, t);
  if (moving) {
    const tangent = getPose(moving, t, playback.paths.get(moving.id) ?? null)?.tangent;
    return tangent ? yawToward([0, 0, 0], tangent) : null;
  }
  const event = latestStarted(playback, t);
  if (!event || playback.paths.has(event.id)) return null;
  const here = actorPosition(playback, t);
  if (!here) return null;
  if (event.facing) return yawToward(here, event.facing);
  if (event.target) {
    const there = positionOf(event.target, t);
    return there ? yawToward(here, there) : null;
  }
  return null;
}

export function lerpAngle(from: number, to: number, k: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * k;
}

function turnedToward(
  playback: ActorPlayback,
  from: number,
  since: number,
  t: number,
  positionOf: PositionLookup,
): number {
  const desired = desiredYaw(playback, t, positionOf);
  if (desired === null) return from;
  const k = Math.min(1, Math.max(0, (t - since) / TURN_DURATION_S));
  return lerpAngle(from, desired, k);
}

export function actorYaw(playback: ActorPlayback, t: number, positionOf: PositionLookup): number {
  let yaw = 0;
  let since = Number.NEGATIVE_INFINITY;
  for (const change of playback.turnTimes) {
    if (change > t) break;
    yaw = turnedToward(playback, yaw, since, change - BEFORE_EPSILON_S, positionOf);
    since = change <= TIMELINE_START_S ? Number.NEGATIVE_INFINITY : change;
  }
  return turnedToward(playback, yaw, since, t, positionOf);
}

export function actorEvent(playback: ActorPlayback, t: number): ResolvedEvent | undefined {
  return latestStarted(playback, t) ?? playback.events[0];
}

export function actorStatus(playback: ActorPlayback, t: number): Status | null {
  const event = latestStarted(playback, t) ?? playback.events[0];
  return event ? playback.statusOf(event) : null;
}

export function ghostAnchor(event: ResolvedEvent): Vec3 | null {
  return event.at ?? event.to ?? event.from ?? null;
}

export function ghostVisible(event: Pick<ResolvedEvent, "tStart" | "tEnd">, t: number): boolean {
  return t >= event.tStart && t <= event.tEnd;
}

export function ghostYaw(event: ResolvedEvent, t: number, positionOf: PositionLookup): number {
  const anchor = ghostAnchor(event);
  if (!anchor) return 0;
  if (event.facing) return yawToward(anchor, event.facing) ?? 0;
  const target = event.target ? positionOf(event.target, t) : null;
  return target ? (yawToward(anchor, target) ?? 0) : 0;
}
