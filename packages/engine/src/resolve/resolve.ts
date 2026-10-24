import type { Event, EventGraph, SceneManifest } from "@rashomon/schema";
import type {
  ResolvedEvent,
  ResolvedGraph,
  ResolvedProp,
  Vec3,
} from "../types";
import { anchorToPoint, type ResolverAnchor } from "./anchors";
import { pathLength, shortestPath } from "./portals";
import { resolveInterval } from "./time";

export type HeldInterval = { actor: string; tStart: number; tEnd: number };
export type ResolverActor = ResolvedGraph["actors"][number] & { position?: Vec3 };
export type ResolverProp = ResolvedProp & { heldByIntervals?: HeldInterval[] };
export type ResolverGraph = Omit<ResolvedGraph, "actors" | "props"> & {
  actors: ResolverActor[];
  props: ResolverProp[];
};

const MOVEMENT = new Set(["walk", "run"]);

const round = (n: number): number => Math.round(n * 1e6) / 1e6;
const roundVec = (v: Vec3): Vec3 => [round(v[0]), round(v[1]), round(v[2])];

/** Where a landmark id (as used by `facing`) is, or undefined if it is an actor or unknown. */
function facingPoint(
  id: string | undefined,
  manifest: SceneManifest,
): Vec3 | undefined {
  if (!id || !manifest.landmarks.some((l) => l.id === id)) return undefined;
  return anchorToPoint({ kind: "at", landmark: id }, manifest);
}

export function resolve(
  graph: EventGraph,
  manifest: SceneManifest,
): ResolverGraph {
  const portals = manifest.portals;
  const obstacles = manifest.landmarks
    .filter((l) => l.occludes)
    .map((l) => l.bounds);
  const point = (a: Event["at"]) =>
    a ? roundVec(anchorToPoint(a as ResolverAnchor, manifest)) : undefined;

  const lastPos = new Map<string, Vec3>();
  const firstPos = new Map<string, Vec3>();
  const remember = (actor: string, p: Vec3 | undefined) => {
    if (!p) return;
    lastPos.set(actor, p);
    if (!firstPos.has(actor)) firstPos.set(actor, p);
  };

  let previousEnd = 0;
  const events: ResolvedEvent[] = graph.events.map((e) => {
    const isMove = MOVEMENT.has(e.action);
    let from = point(e.from);
    let to = point(e.to);
    let at: Vec3 | undefined;
    let path: Vec3[] = [];

    if (isMove) {
      from ??= lastPos.get(e.actor);
      to ??= lastPos.get(e.actor);
      if (from && to) {
        path = portals
          ? shortestPath(from, to, portals, obstacles).map(roundVec)
          : [from, to];
      } else if (from ?? to) {
        path = [(from ?? to)!];
      }
      remember(e.actor, from);
      remember(e.actor, to);
    } else {
      at = point(e.at) ?? lastPos.get(e.actor);
      if (at) path = [];
      remember(e.actor, at);
    }

    const len = pathLength(path);
    const t = resolveInterval(e.t, e.action, len, previousEnd);
    previousEnd = t.tEnd;

    const facing = facingPoint(e.facing, manifest);
    return {
      id: e.id,
      actor: e.actor,
      action: e.action,
      tStart: round(t.tStart),
      tEnd: round(t.tEnd),
      status: e.status ?? "proposed",
      flags: e.flags ?? [],
      path,
      pathLengthM: round(len),
      ...(from && isMove ? { from } : {}),
      ...(to && isMove ? { to } : {}),
      ...(at ? { at } : {}),
      ...(facing ? { facing: roundVec(facing) } : {}),
      ...(e.target ? { target: e.target } : {}),
      ...(e.prop ? { prop: e.prop } : {}),
      tInferred: t.tInferred,
    };
  });

  const durationS = events.reduce((m, e) => Math.max(m, e.tEnd), 0);

  const props: ResolverProp[] = graph.props.map((p) => {
    const position = roundVec(anchorToPoint(p.anchor as ResolverAnchor, manifest));
    const handoffs = events
      .filter((e) => e.prop === p.id && (e.action === "pick_up" || e.action === "drop"))
      .sort((a, b) => a.tStart - b.tStart);
    const intervals: HeldInterval[] = [];
    let open: HeldInterval | undefined;
    for (const e of handoffs) {
      if (e.action === "pick_up") {
        open ??= { actor: e.actor, tStart: e.tEnd, tEnd: durationS };
      } else if (open) {
        open.tEnd = e.tStart;
        intervals.push(open);
        open = undefined;
      }
    }
    if (open) intervals.push(open);
    if (!intervals.length && p.heldBy)
      intervals.push({ actor: p.heldBy, tStart: 0, tEnd: durationS });
    return {
      id: p.id,
      type: p.type,
      position,
      ...(p.heldBy ? { heldBy: p.heldBy } : {}),
      notes: p.notes,
      ...(intervals.length ? { heldByIntervals: intervals } : {}),
    };
  });

  return {
    sceneId: graph.sceneId,
    version: graph.version,
    durationS,
    actors: graph.actors.map((a) => {
      const position = firstPos.get(a.id);
      return {
        id: a.id,
        label: a.label,
        role: a.role,
        rig: a.rig,
        ...(position ? { position } : {}),
      };
    }),
    events,
    props,
    handwritten: false,
  };
}
