import type { Event, EventGraph, Portals, SceneManifest } from "@rashomon/schema";
import type {
  HeldInterval,
  ResolvedEvent,
  ResolvedGraph,
  ResolvedProp,
  Vec3,
} from "../types";
import { anchorToPoint } from "./anchors";
import type { Box } from "./geometry";
import { pathLength, shortestPath, straightLineClear } from "./portals";
import { hasInterval, resolveInterval } from "./time";

const MOVEMENT = new Set(["walk", "run"]);
const TIME_EPS = 1e-9;

const round = (n: number): number => Math.round(n * 1e6) / 1e6;
const roundVec = (v: Vec3): Vec3 => [round(v[0]), round(v[1]), round(v[2])];
const floorDistance = (a: Vec3, b: Vec3): number =>
  Math.hypot(b[0] - a[0], b[2] - a[2]);

function facingPoint(
  id: string | undefined,
  manifest: SceneManifest,
): Vec3 | undefined {
  if (!id || !manifest.landmarks.some((l) => l.id === id)) return undefined;
  return anchorToPoint({ kind: "at", landmark: id }, manifest);
}

type Sighting = { t: number; order: number; p: Vec3 };

function createTracker() {
  const sightings = new Map<string, Sighting[]>();
  let order = 0;
  const latestOf = (list: Sighting[]): Sighting | undefined =>
    list.reduce<Sighting | undefined>(
      (best, s) =>
        !best || s.t > best.t || (s.t === best.t && s.order > best.order)
          ? s
          : best,
      undefined,
    );
  return {
    note(actor: string, t: number, p: Vec3 | undefined) {
      if (!p) return;
      const entry = { t, order: order++, p };
      sightings.set(actor, [...(sightings.get(actor) ?? []), entry]);
    },
    positionAt(actor: string, t: number): Vec3 | undefined {
      const before = (sightings.get(actor) ?? []).filter(
        (s) => s.t <= t + TIME_EPS,
      );
      return latestOf(before)?.p;
    },
    firstPosition(actor: string): Vec3 | undefined {
      const list = sightings.get(actor) ?? [];
      return list.reduce<Sighting | undefined>(
        (first, s) =>
          !first || s.t < first.t || (s.t === first.t && s.order < first.order)
            ? s
            : first,
        undefined,
      )?.p;
    },
  };
}

type Route = { path: Vec3[]; reachable: boolean; travelM: number };

function routeBetween(
  from: Vec3 | undefined,
  to: Vec3 | undefined,
  portals: Portals | undefined,
  obstacles: Box[],
): Route {
  if (!from || !to) {
    const only = from ?? to;
    return { path: only ? [only] : [], reachable: true, travelM: 0 };
  }
  const found = portals
    ? shortestPath(from, to, portals, obstacles)
    : straightLineClear(from, to, obstacles)
      ? [from, to]
      : null;
  if (!found)
    return { path: [], reachable: false, travelM: floorDistance(from, to) };
  const path = found.map(roundVec);
  return { path, reachable: true, travelM: pathLength(path) };
}

function heldIntervals(
  prop: EventGraph["props"][number],
  events: ResolvedEvent[],
  durationS: number,
): HeldInterval[] {
  const handoffs = events
    .filter(
      (e) =>
        e.prop === prop.id &&
        e.status !== "superseded" &&
        (e.action === "pick_up" || e.action === "drop"),
    )
    .sort((a, b) => a.tStart - b.tStart);
  type Open = Omit<HeldInterval, "tEnd">;
  const initial: { closed: HeldInterval[]; open?: Open } = { closed: [] };
  const { closed, open } = handoffs.reduce((acc, e) => {
    if (e.action === "pick_up") {
      if (acc.open?.actor === e.actor) return acc;
      const closedNow = acc.open
        ? [...acc.closed, { ...acc.open, tEnd: e.tStart }]
        : acc.closed;
      return { closed: closedNow, open: { actor: e.actor, tStart: e.tEnd } };
    }
    if (acc.open && acc.open.actor !== e.actor) return acc;
    if (acc.open)
      return { closed: [...acc.closed, { ...acc.open, tEnd: e.tStart }] };
    if (acc.closed.length) return acc;
    return { closed: [{ actor: e.actor, tStart: 0, tEnd: e.tStart }] };
  }, initial);
  const all = open ? [...closed, { ...open, tEnd: durationS }] : closed;
  if (!all.length && prop.heldBy)
    return [{ actor: prop.heldBy, tStart: 0, tEnd: durationS }];
  return all;
}

export function resolve(
  graph: EventGraph,
  manifest: SceneManifest,
): ResolvedGraph {
  const portals = manifest.portals;
  const obstacles = manifest.landmarks
    .filter((l) => l.occludes)
    .map((l) => l.bounds);
  const point = (a: Event["at"]) =>
    a ? roundVec(anchorToPoint(a, manifest)) : undefined;
  const tracker = createTracker();

  let previousEnd = 0;
  const events: ResolvedEvent[] = graph.events.map((e) => {
    const isMove = MOVEMENT.has(e.action);
    const tStartGuess = hasInterval(e.t) ? e.t[0] : previousEnd;
    const known = tracker.positionAt(e.actor, tStartGuess);
    const from = isMove ? (point(e.from) ?? known) : undefined;
    const to = isMove ? (point(e.to) ?? point(e.at) ?? known) : undefined;
    const at = isMove ? undefined : (point(e.at) ?? known);
    const route = isMove
      ? routeBetween(from, to, portals, obstacles)
      : { path: [], reachable: true, travelM: 0 };

    const t = resolveInterval(e.t, e.action, route.travelM, previousEnd);
    previousEnd = t.tEnd;
    const arrivedAt = isMove ? (route.reachable ? to : from) : at;
    tracker.note(e.actor, t.tStart, isMove ? from : at);
    tracker.note(e.actor, t.tEnd, arrivedAt);

    const facing = facingPoint(e.facing, manifest);
    return {
      id: e.id,
      actor: e.actor,
      action: e.action,
      tStart: round(t.tStart),
      tEnd: round(t.tEnd),
      status: e.status ?? "proposed",
      flags: e.flags ?? [],
      path: route.path,
      pathLengthM: round(pathLength(route.path)),
      reachable: route.reachable,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(at ? { at } : {}),
      ...(facing ? { facing: roundVec(facing) } : {}),
      ...(e.target ? { target: e.target } : {}),
      ...(e.prop ? { prop: e.prop } : {}),
      tInferred: t.tInferred,
    };
  });

  const durationS = events.reduce((m, e) => Math.max(m, e.tEnd), 0);

  const props: ResolvedProp[] = graph.props.map((p) => {
    const intervals = heldIntervals(p, events, durationS);
    return {
      id: p.id,
      type: p.type,
      position: roundVec(anchorToPoint(p.anchor, manifest)),
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
      const position = tracker.firstPosition(a.id);
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
